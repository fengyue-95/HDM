import { app, BrowserWindow, Notification, dialog, ipcMain } from "electron";
import { is } from "@electron-toolkit/utils";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import type {
  AppConfig,
  AppState,
  Artifact,
  CreateCronJobInput,
  HermesCheckResult,
  HermesCronJob,
  HermesSkill,
  ModelConfigInput,
  RunTaskInput,
  Task,
  TaskEvent
} from "../shared/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultHermesPath = "/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes";

let mainWindow: BrowserWindow | null = null;
let state: AppState = {
  config: {
    hermesPath: defaultHermesPath,
    baseUrl: "",
    trustedWorkspaces: [],
    recentWorkspaces: []
  },
  currentWorkspace: null,
  tasks: []
};

const runningTasks = new Map<string, ChildProcessWithoutNullStreams>();

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function dataPath(): string {
  return join(app.getPath("userData"), "state.json");
}

async function persistState(): Promise<void> {
  const filePath = dataPath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}

async function loadState(): Promise<void> {
  try {
    const raw = await readFile(dataPath(), "utf8");
    const saved = JSON.parse(raw) as AppState;
    state = {
      config: {
        hermesPath: saved.config?.hermesPath || defaultHermesPath,
        provider: saved.config?.provider,
        model: saved.config?.model,
        baseUrl: saved.config?.baseUrl,
        apiKeyConfigured: saved.config?.apiKeyConfigured,
        apiKeyEnvVar: saved.config?.apiKeyEnvVar,
        trustedWorkspaces: Array.isArray(saved.config?.trustedWorkspaces) ? saved.config.trustedWorkspaces : [],
        recentWorkspaces: Array.isArray(saved.config?.recentWorkspaces) ? saved.config.recentWorkspaces : []
      },
      currentWorkspace: saved.currentWorkspace ?? null,
      tasks: Array.isArray(saved.tasks) ? saved.tasks : []
    };
  } catch {
    await persistState();
  }
}

function rememberWorkspace(workspacePath: string): void {
  state.config.recentWorkspaces = [
    workspacePath,
    ...(state.config.recentWorkspaces ?? []).filter((item) => item !== workspacePath)
  ].slice(0, 12);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "HDM",
    backgroundColor: "#f6f7f9",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function emitTask(task: Task): void {
  mainWindow?.webContents.send("task:updated", task);
}

function notifyTaskFinished(task: Task): void {
  if (!Notification.isSupported()) return;

  const succeeded = task.status === "completed";
  const taskIntro = task.prompt.replace(/\s+/g, " ").trim();
  const taskSummary = taskIntro.length > 96 ? `${taskIntro.slice(0, 96)}...` : taskIntro || task.title;
  const failureReason = task.error ? `\n原因：${task.error.replace(/\s+/g, " ").trim().slice(0, 120)}` : "";
  const notification = new Notification({
    title: succeeded ? `任务完成：${task.title}` : `任务失败：${task.title}`,
    body: `任务内容：${taskSummary}${succeeded ? "" : failureReason}`,
    silent: false
  });

  notification.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  notification.show();
}

function addEvent(task: Task, title: string, detail: string, tone: TaskEvent["tone"]): void {
  task.timeline.push({
    id: id("evt"),
    title,
    detail,
    tone,
    at: nowIso()
  });
}

function replaceTask(task: Task): void {
  state.tasks = [task, ...state.tasks.filter((item) => item.id !== task.id)].slice(0, 80);
}

function makeTaskTitle(prompt: string): string {
  const compact = prompt.replace(/\s+/g, " ").trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact || "未命名任务";
}

function decoratePrompt(input: RunTaskInput): string {
  const workspaceLine = input.workspacePath
    ? `Workspace 路径：${input.workspacePath}`
    : "Workspace 路径：未选择，请基于用户任务直接回答。";

  return [
    "你正在 Hermes AI Native Desktop 中运行。",
    workspaceLine,
    "请围绕该本地 Workspace 完成用户任务。输出应清晰、可执行，并在涉及文件修改时说明改动位置。",
    "",
    "用户任务：",
    input.prompt
  ].join("\n");
}

async function updateAndPersist(task: Task): Promise<void> {
  replaceTask(task);
  emitTask(task);
  await persistState();
}

async function checkHermesBinary(config: AppConfig): Promise<void> {
  await access(config.hermesPath, constants.X_OK);
}

function collectCommand(command: string, args: string[], cwd?: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env
    });
    let output = "";

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      output += error.message;
      resolve({ code: 1, output });
    });
    child.on("close", (code) => {
      resolve({ code, output });
    });
  });
}

function hermesHome(): string {
  return join(homedir(), ".hermes");
}

function apiKeyEnvVarForProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized.includes("deepseek")) return "DEEPSEEK_API_KEY";
  if (normalized.includes("anthropic") || normalized.includes("claude")) return "ANTHROPIC_API_KEY";
  if (normalized.includes("openrouter")) return "OPENROUTER_API_KEY";
  if (normalized.includes("ollama")) return "OLLAMA_API_KEY";
  if (normalized.includes("xai") || normalized.includes("x.ai")) return "XAI_API_KEY";
  if (normalized.includes("gemini") || normalized.includes("google")) return "GEMINI_API_KEY";
  if (normalized.includes("minimax")) return "MINIMAX_API_KEY";
  if (normalized.includes("kimi")) return "KIMI_API_KEY";
  return "OPENAI_API_KEY";
}

function isLocalOllamaBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) return false;
  try {
    const url = new URL(baseUrl);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.port === "11434";
  } catch {
    return false;
  }
}

function providerForHermes(provider: string, baseUrl?: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "ollama" || isLocalOllamaBaseUrl(baseUrl)) return "custom";
  return provider.trim();
}

function providerForUi(provider?: string, baseUrl?: string): string | undefined {
  if ((provider || "").trim().toLowerCase() === "custom" && isLocalOllamaBaseUrl(baseUrl)) {
    return "Ollama";
  }
  return provider;
}

function parseEnvValue(content: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=\\s*(.*)\\s*$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

async function getApiKeyStatus(provider: string): Promise<Pick<AppConfig, "apiKeyConfigured" | "apiKeyEnvVar">> {
  const apiKeyEnvVar = apiKeyEnvVarForProvider(provider);
  let apiKeyConfigured = Boolean(process.env[apiKeyEnvVar]?.trim());

  try {
    const envContent = await readFile(join(hermesHome(), ".env"), "utf8");
    apiKeyConfigured = apiKeyConfigured || Boolean(parseEnvValue(envContent, apiKeyEnvVar));
  } catch {
    // Missing .env simply means there is no persisted key yet.
  }

  return { apiKeyConfigured, apiKeyEnvVar };
}

async function writeHermesEnvValue(key: string, value: string): Promise<void> {
  const envPath = join(hermesHome(), ".env");
  await mkdir(dirname(envPath), { recursive: true });

  let content = "";
  try {
    content = await readFile(envPath, "utf8");
  } catch {
    content = "";
  }

  const line = `${key}=${JSON.stringify(value)}`
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=.*$`, "m");
  const nextContent = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}${content.trimEnd() ? "\n" : ""}${line}\n`;

  await writeFile(envPath, nextContent, { encoding: "utf8", mode: 0o600 });
  process.env[key] = value;
}

function normalizeOllamaApiBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl || state.config.baseUrl || "http://127.0.0.1:11434").trim();
  if (!raw) return "http://127.0.0.1:11434";

  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/v1\/?$/i, "").replace(/\/api\/tags\/?$/i, "") || "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "http://127.0.0.1:11434";
  }
}

function parseOllamaListOutput(output: string): string[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => Boolean(name && name !== "NAME"));
}

async function listOllamaModels(baseUrl?: string): Promise<string[]> {
  const apiBaseUrl = normalizeOllamaApiBaseUrl(baseUrl);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2200);
    const response = await fetch(`${apiBaseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
      const models = (payload.models || [])
        .map((model) => model.name || model.model || "")
        .filter(Boolean);
      if (models.length > 0) return Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
    }
  } catch {
    // Fall back to the Ollama CLI below.
  }

  const result = await collectCommand("ollama", ["list"]);
  if (result.code !== 0) return [];
  return Array.from(new Set(parseOllamaListOutput(result.output))).sort((a, b) => a.localeCompare(b));
}

async function findRecentHermesRequestError(sinceIso: string): Promise<string | null> {
  const sessionsDir = join(hermesHome(), "sessions");
  const since = new Date(sinceIso).getTime() - 5000;

  try {
    const entries = await readdir(sessionsDir, { withFileTypes: true });
    const dumpFiles = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith("request_dump_") && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, 8);

    for (const fileName of dumpFiles) {
      try {
        const raw = await readFile(join(sessionsDir, fileName), "utf8");
        const dump = JSON.parse(raw) as {
          timestamp?: string;
          error?: {
            message?: string;
            response_text?: string;
            body?: { message?: string };
          };
        };
        const at = dump.timestamp ? new Date(dump.timestamp).getTime() : 0;
        if (at && at < since) continue;

        const message = dump.error?.body?.message || dump.error?.message || dump.error?.response_text;
        if (message?.trim()) return message.trim();
      } catch {
        // Ignore malformed or concurrently-written dumps.
      }
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeCronJob(job: Record<string, unknown>): HermesCronJob | null {
  if (!job.id) return null;

  const schedule = job.schedule as { value?: string } | string | undefined;
  const enabled = job.enabled !== false;
  let jobState: HermesCronJob["state"] = "active";
  if (job.state === "paused" || !enabled) jobState = "paused";
  if (job.state === "completed") jobState = "completed";

  return {
    id: String(job.id),
    name: (job.name as string) || "(unnamed)",
    schedule: (job.schedule_display as string) || (typeof schedule === "object" ? schedule?.value : schedule) || "?",
    prompt: (job.prompt as string) || "",
    state: jobState,
    enabled,
    nextRunAt: (job.next_run_at as string) || null,
    lastRunAt: (job.last_run_at as string) || null,
    lastStatus: (job.last_status as string) || null,
    lastError: (job.last_error as string) || null,
    repeat: (job.repeat as HermesCronJob["repeat"]) || null,
    deliver: Array.isArray(job.deliver) ? (job.deliver as string[]) : job.deliver ? [String(job.deliver)] : ["local"],
    skills: Array.isArray(job.skills) ? (job.skills as string[]) : job.skill ? [String(job.skill)] : [],
    script: (job.script as string) || null
  };
}

async function listCronJobs(): Promise<HermesCronJob[]> {
  const filePath = join(hermesHome(), "cron", "jobs.json");

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { jobs?: Record<string, unknown>[] } | Record<string, unknown>[];
    const rows = Array.isArray(parsed) ? parsed : parsed.jobs || [];
    return rows
      .map((job) => normalizeCronJob(job))
      .filter((job): job is HermesCronJob => Boolean(job))
      .sort((a, b) => (a.nextRunAt || "").localeCompare(b.nextRunAt || ""));
  } catch {
    const result = await collectCommand(state.config.hermesPath, ["cron", "list", "--all"]);
    if (result.code !== 0 && !result.output.includes("No scheduled jobs")) {
      throw new Error(result.output.trim() || "读取 Hermes 定时任务失败。");
    }
    return [];
  }
}

async function createCronJob(input: CreateCronJobInput): Promise<HermesCronJob[]> {
  const schedule = input.schedule.trim();
  const prompt = input.prompt.trim();

  if (!schedule) {
    throw new Error("定时规则不能为空。");
  }
  if (!prompt && !input.script?.trim()) {
    throw new Error("Prompt 或脚本至少填写一个。");
  }

  await checkHermesBinary(state.config);

  const args = ["cron", "create", schedule];
  if (input.name?.trim()) args.push("--name", input.name.trim());
  if (input.deliver?.trim()) args.push("--deliver", input.deliver.trim());
  if (input.repeat?.trim()) args.push("--repeat", input.repeat.trim());
  for (const skill of input.skills ?? []) {
    const trimmed = skill.trim();
    if (trimmed) args.push("--skill", trimmed);
  }
  if (input.script?.trim()) args.push("--script", input.script.trim());
  if (input.noAgent) args.push("--no-agent");
  if (input.workdir?.trim()) args.push("--workdir", input.workdir.trim());
  if (prompt) args.push("--", prompt);

  const result = await collectCommand(state.config.hermesPath, args);
  if (result.code !== 0) {
    throw new Error(result.output.trim() || "创建 Hermes 定时任务失败。");
  }

  return listCronJobs();
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function parseSkillFrontmatter(content: string): Pick<HermesSkill, "name" | "description"> {
  const result = { name: "", description: "" };

  if (!content.startsWith("---")) {
    result.name = content.match(/^#\s+(.+)/m)?.[1]?.trim() || "";
    result.description = content.match(/^(?!#)(?!---).+/m)?.[0]?.trim().slice(0, 180) || "";
    return result;
  }

  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) return result;

  const frontmatter = content.slice(3, endIndex);
  result.name = frontmatter.match(/^\s*name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim() || "";
  result.description = frontmatter.match(/^\s*description:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim() || "";
  return result;
}

async function scanSkillFiles(): Promise<HermesSkill[]> {
  const skillsDir = join(hermesHome(), "skills");
  const skills: HermesSkill[] = [];

  try {
    const categories = await readdir(skillsDir, { withFileTypes: true });
    for (const categoryEntry of categories) {
      if (!categoryEntry.isDirectory() || categoryEntry.name.startsWith(".")) continue;

      const categoryPath = join(skillsDir, categoryEntry.name);
      const directSkillPath = join(categoryPath, "SKILL.md");
      try {
        const content = await readFile(directSkillPath, "utf8");
        const meta = parseSkillFrontmatter(content.slice(0, 5000));
        skills.push({
          id: categoryEntry.name,
          name: meta.name || categoryEntry.name,
          category: "",
          source: "local",
          trust: "local",
          status: "enabled",
          description: meta.description,
          path: categoryPath
        });
        continue;
      } catch {
        // Most Hermes skills are stored as skills/<category>/<skill>/SKILL.md.
      }

      const entries = await readdir(categoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const skillPath = join(categoryPath, entry.name);
        try {
          const content = await readFile(join(skillPath, "SKILL.md"), "utf8");
          const meta = parseSkillFrontmatter(content.slice(0, 5000));
          skills.push({
            id: `${categoryEntry.name}/${entry.name}`,
            name: meta.name || entry.name,
            category: categoryEntry.name,
            source: "local",
            trust: "local",
            status: "enabled",
            description: meta.description,
            path: skillPath
          });
        } catch {
          // Ignore folders that are not skills.
        }
      }
    }
  } catch {
    return [];
  }

  return skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function parseSkillsTable(output: string): Array<Pick<HermesSkill, "name" | "category" | "source" | "trust" | "status">> {
  const rows: Array<Pick<HermesSkill, "name" | "category" | "source" | "trust" | "status">> = [];

  for (const line of stripAnsi(output).split(/\r?\n/)) {
    if (!line.includes("│")) continue;
    const cells = line
      .split("│")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 5 || cells[0] === "Name") continue;

    rows.push({
      name: cells[0],
      category: cells[1],
      source: cells[2],
      trust: cells[3],
      status: cells[4]
    });
  }

  return rows;
}

async function listSkills(): Promise<HermesSkill[]> {
  const scanned = await scanSkillFiles();
  const byExactKey = new Map(scanned.map((skill) => [`${skill.category}/${skill.name}`, skill]));

  const result = await collectCommand(state.config.hermesPath, ["skills", "list"]);
  if (result.code !== 0) {
    if (scanned.length > 0) return scanned;
    throw new Error(result.output.trim() || "读取 Hermes 技能失败。");
  }

  const cliRows = parseSkillsTable(result.output);
  if (cliRows.length === 0) return scanned;

  return cliRows.map((row, index) => {
    const prefix = row.name.replace(/…$/u, "");
    const local =
      byExactKey.get(`${row.category}/${row.name}`) ||
      scanned.find((skill) => skill.category === row.category && skill.name.startsWith(prefix)) ||
      scanned.find((skill) => skill.name === row.name);

    return {
      id: local?.id || `${row.category || "root"}/${row.name}/${index}`,
      name: local?.name || row.name,
      category: row.category || local?.category || "",
      source: row.source,
      trust: row.trust,
      status: row.status,
      description: local?.description || "",
      path: local?.path
    };
  });
}

function parseHermesStatus(output: string): Pick<AppConfig, "provider" | "model"> {
  const provider = output.match(/Provider:\s*([^\n]+)/i)?.[1]?.trim();
  const model = output.match(/(?:Current model|Model):\s*([^\n]+)/i)?.[1]?.trim();
  return { provider, model };
}

function parseHermesConfig(output: string): Pick<AppConfig, "provider" | "model" | "baseUrl"> {
  const modelLine = output.match(/Model:\s*(\{[^\n]+\})/i)?.[1] ?? "";
  const provider = modelLine.match(/'provider':\s*'([^']*)'/)?.[1]?.trim();
  const model = modelLine.match(/'default':\s*'([^']*)'/)?.[1]?.trim();
  const baseUrl = modelLine.match(/'base_url':\s*'([^']*)'/)?.[1]?.trim();
  return { provider: providerForUi(provider, baseUrl), model, baseUrl };
}

async function refreshHermesConfig(): Promise<Pick<AppConfig, "provider" | "model" | "baseUrl" | "apiKeyConfigured" | "apiKeyEnvVar">> {
  const result = await collectCommand(state.config.hermesPath, ["config", "show"]);
  if (result.code !== 0) {
    throw new Error(result.output.trim() || "读取 Hermes 配置失败。");
  }
  const parsed = parseHermesConfig(result.output);
  return {
    ...parsed,
    ...(await getApiKeyStatus(parsed.provider || state.config.provider || ""))
  };
}

async function checkHermes(): Promise<HermesCheckResult> {
  try {
    await checkHermesBinary(state.config);
    const result = await collectCommand(state.config.hermesPath, ["status"]);
    const parsed = {
      ...parseHermesStatus(result.output),
      ...(await refreshHermesConfig())
    };
    state.config = { ...state.config, ...parsed };
    await persistState();

    if (result.code === 0) {
      return {
        ok: true,
        message: result.output.trim() || "Hermes 可用",
        provider: parsed.provider,
        model: parsed.model,
        baseUrl: parsed.baseUrl,
        apiKeyConfigured: parsed.apiKeyConfigured,
        apiKeyEnvVar: parsed.apiKeyEnvVar
      };
    }

    return {
      ok: false,
      message: result.output.trim() || "Hermes status 返回非零状态。"
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "无法检测 Hermes。"
    };
  }
}

async function syncHermesModelConfig(input: ModelConfigInput): Promise<AppState> {
  const provider = input.provider.trim();
  const model = input.model.trim();
  const baseUrl = input.baseUrl.trim();
  const apiKey = input.apiKey?.trim() ?? "";
  const hermesProvider = providerForHermes(provider, baseUrl);

  if (!provider || !model) {
    throw new Error("Provider 和 Model 不能为空。");
  }

  await checkHermesBinary(state.config);

  const updates: Array<[string, string]> = [
    ["model.provider", hermesProvider],
    ["model.default", model],
    ["model.base_url", baseUrl]
  ];

  for (const [key, value] of updates) {
    const result = await collectCommand(state.config.hermesPath, ["config", "set", key, value]);
    if (result.code !== 0) {
      throw new Error(result.output.trim() || `写入 Hermes 配置失败：${key}`);
    }
  }

  const apiKeyEnvVar = apiKeyEnvVarForProvider(provider);
  if (apiKey) {
    await writeHermesEnvValue(apiKeyEnvVar, apiKey);
  }

  state.config = {
    ...state.config,
    provider,
    model,
    baseUrl,
    apiKeyConfigured: apiKey ? true : state.config.apiKeyConfigured,
    apiKeyEnvVar
  };

  const refreshed = await refreshHermesConfig();
  state.config = { ...state.config, ...refreshed };
  await persistState();
  return state;
}

async function runTask(input: RunTaskInput): Promise<Task> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("任务内容不能为空。");
  }

  const task: Task = {
    id: id("task"),
    title: makeTaskTitle(prompt),
    prompt,
    workspacePath: input.workspacePath,
    status: "running",
    createdAt: nowIso(),
    model: state.config.model,
    provider: state.config.provider,
    logs: [],
    timeline: [],
    artifacts: []
  };

  addEvent(task, "创建任务", "已记录用户任务，并准备传入 Hermes。", "done");
  addEvent(task, "启动 Hermes Runner", "通过本机 Hermes CLI one-shot 模式执行。", "active");
  await updateAndPersist(task);

  try {
    await checkHermesBinary(state.config);
  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : "Hermes 可执行文件不可用。";
    addEvent(task, "Hermes 不可用", task.error, "failed");
    await updateAndPersist(task);
    return task;
  }

  const decoratedPrompt = decoratePrompt(input);
  const child = spawn(state.config.hermesPath, ["-z", decoratedPrompt], {
    cwd: input.workspacePath || undefined,
    env: process.env
  });

  runningTasks.set(task.id, child);

  const appendLog = async (chunk: Buffer, source: "stdout" | "stderr"): Promise<void> => {
    const text = chunk.toString();
    task.logs.push(`[${source}] ${text}`);
    await updateAndPersist(task);
  };

  child.stdout.on("data", (chunk: Buffer) => {
    void appendLog(chunk, "stdout");
  });

  child.stderr.on("data", (chunk: Buffer) => {
    void appendLog(chunk, "stderr");
  });

  child.on("error", async (error) => {
    runningTasks.delete(task.id);
    task.status = "failed";
    task.error = error.message;
    task.completedAt = nowIso();
    addEvent(task, "执行失败", error.message, "failed");
    await updateAndPersist(task);
  });

  child.on("close", async (code) => {
    runningTasks.delete(task.id);

    if (task.status === "cancelled") {
      await updateAndPersist(task);
      return;
    }

    const rawOutput = task.logs
      .map((line) => line.replace(/^\[(stdout|stderr)\]\s*/, ""))
      .join("")
      .trim();

    task.completedAt = nowIso();

    if (code === 0) {
      const requestError = rawOutput ? null : await findRecentHermesRequestError(task.createdAt);

      if (requestError) {
        task.status = "failed";
        task.error = requestError;
        addEvent(task, "执行失败", requestError, "failed");
      } else {
        task.status = "completed";
        task.result = rawOutput || "Hermes 执行完成，但没有返回文本。";
        addEvent(task, "任务完成", "Hermes 已返回结果，任务记录和产物已保存。", "done");

        const createdAt = nowIso();
        const artifacts: Artifact[] = [
          {
            id: id("artifact"),
            name: `${task.title}.md`,
            kind: "result",
            content: task.result,
            createdAt
          },
          {
            id: id("artifact"),
            name: `${task.title}.log`,
            kind: "log",
            content: task.logs.join(""),
            createdAt
          }
        ];
        task.artifacts = artifacts;
      }
    } else {
      task.status = "failed";
      task.error = rawOutput || `Hermes 进程以状态 ${code ?? "unknown"} 退出。`;
      addEvent(task, "执行失败", task.error, "failed");
    }

    await updateAndPersist(task);
    notifyTaskFinished(task);
  });

  return task;
}

async function cancelTask(taskId: string): Promise<Task | null> {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return null;

  const child = runningTasks.get(taskId);
  if (child) {
    child.kill("SIGTERM");
    runningTasks.delete(taskId);
  }

  task.status = "cancelled";
  task.completedAt = nowIso();
  addEvent(task, "任务已取消", "用户取消了当前 Hermes 执行。", "failed");
  await updateAndPersist(task);
  return task;
}

app.whenReady().then(async () => {
  await loadState();
  createWindow();

  ipcMain.handle("app:get-state", () => state);

  ipcMain.handle("workspace:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "选择 Workspace",
      properties: ["openDirectory", "createDirectory"]
    });

    if (!result.canceled && result.filePaths[0]) {
      state.currentWorkspace = result.filePaths[0];
      rememberWorkspace(result.filePaths[0]);
      await persistState();
    }

    return state;
  });

  ipcMain.handle("workspace:set", async (_event, workspacePath: string) => {
    await access(workspacePath, constants.R_OK);
    state.currentWorkspace = workspacePath;
    rememberWorkspace(workspacePath);
    await persistState();
    return state;
  });

  ipcMain.handle("config:update", async (_event, config: Partial<AppConfig>) => {
    state.config = { ...state.config, ...config };
    await persistState();
    return state;
  });

  ipcMain.handle("hermes:check", () => checkHermes());
  ipcMain.handle("hermes:sync-model-config", (_event, config: ModelConfigInput) => syncHermesModelConfig(config));
  ipcMain.handle("ollama:models", (_event, baseUrl?: string) => listOllamaModels(baseUrl));
  ipcMain.handle("hermes:cron:list", () => listCronJobs());
  ipcMain.handle("hermes:cron:create", (_event, input: CreateCronJobInput) => createCronJob(input));
  ipcMain.handle("hermes:skills:list", () => listSkills());
  ipcMain.handle("task:run", (_event, input: RunTaskInput) => runTask(input));
  ipcMain.handle("task:cancel", (_event, taskId: string) => cancelTask(taskId));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  for (const child of runningTasks.values()) {
    child.kill("SIGTERM");
  }
  runningTasks.clear();
});
