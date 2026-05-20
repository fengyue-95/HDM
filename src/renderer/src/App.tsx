import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import {
  Activity,
  Archive,
  Bot,
  Brain,
  CalendarClock,
  Check,
  Code2,
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  ImagePlus,
  Layers3,
  Paperclip,
  type LucideIcon,
  Play,
  Plus,
  Puzzle,
  Search,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Workflow,
  X
} from "lucide-react";
import type {
  AppState,
  Artifact,
  CreateCronJobInput,
  DesktopApi,
  HermesCheckResult,
  HermesCronJob,
  HermesSkill,
  ModelConfigInput,
  Task,
  TaskAttachment,
  TaskEvent,
  TaskStatus
} from "../../shared/types";
import hermesIcon from "./assets/icon.png";

const defaultPrompt = "";
const previewWorkspace = "/Users/fengyue/Desktop/hermes-ai-native-desktop";
type ViewId = "workbench" | "workspaces" | "tasks" | "artifacts" | "routines" | "schedules" | "skills" | "settings";
type ArtifactPreview = Artifact & { taskTitle: string };
type RoutineTemplate = {
  id: string;
  name: string;
  description: string;
  prompt: string;
};
type PromptSuggestion = {
  id: string;
  label: string;
  prompt: string;
  Icon: LucideIcon;
};
type SlashCommand = {
  name: string;
  description: string;
  prompt?: string;
  view?: ViewId;
  clear?: boolean;
};
type ChatEntry = {
  id: string;
  role: "user" | "agent";
  title: string;
  content: string;
  attachments?: TaskAttachment[];
  status?: TaskStatus;
  at: string;
};
type ModelPreset = {
  provider: string;
  models: string[];
  baseUrl: string;
};

const modelPresets: ModelPreset[] = [
  {
    provider: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    baseUrl: "https://api.deepseek.com/v1"
  },
  {
    provider: "OpenAI",
    models: ["gpt-4.1", "gpt-4.1-mini", "o4-mini"],
    baseUrl: "https://api.openai.com/v1"
  },
  {
    provider: "OpenRouter",
    models: ["openai/gpt-4.1", "anthropic/claude-3.5-sonnet", "deepseek/deepseek-chat", "qwen/qwen3-coder"],
    baseUrl: "https://openrouter.ai/api/v1"
  },
  {
    provider: "Anthropic",
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
    baseUrl: "https://api.anthropic.com"
  },
  {
    provider: "Qwen",
    models: ["qwen3-coder-plus", "qwen3-coder", "qwen-plus", "qwen-max", "qwen-turbo"],
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  },
  {
    provider: "Ollama",
    models: ["qwen3.5:9b", "qwen2.5-coder", "qwen2.5vl:latest", "llama3.1", "mistral"],
    baseUrl: "http://127.0.0.1:11434/v1"
  },
  {
    provider: "Custom",
    models: [],
    baseUrl: ""
  }
];

const routineTemplates: RoutineTemplate[] = [
  {
    id: "project-review",
    name: "项目体检",
    description: "梳理结构、关键模块、风险点和下一步建议。",
    prompt: "阅读当前 Workspace，生成项目结构、关键模块、风险点和下一步建议。"
  },
  {
    id: "change-review",
    name: "变更审查",
    description: "检查潜在 bug、回归风险和测试缺口。",
    prompt: "检查当前 Workspace 中最近的代码变更，列出潜在问题、行为回归风险和需要补充的测试。"
  },
  {
    id: "mvp-plan",
    name: "MVP 计划",
    description: "把产品想法拆成模块、任务和验证方式。",
    prompt: "基于当前 Workspace 的 README 和代码，生成一份可执行的 MVP 开发计划，包含模块拆分、任务顺序和验证方式。"
  },
  {
    id: "release-note",
    name: "发布说明",
    description: "从当前结果和任务历史整理版本说明。",
    prompt: "基于当前 Workspace 和最近任务历史，整理一份面向使用者的发布说明，包含新增能力、修复和已知限制。"
  }
];

const promptSuggestions: PromptSuggestion[] = [
  {
    id: "review",
    label: "审查当前变更",
    prompt: "检查当前 Workspace 中最近的代码变更，列出潜在 bug、行为回归风险和需要补充的测试。",
    Icon: GitBranch
  },
  {
    id: "architecture",
    label: "梳理架构",
    prompt: "阅读当前 Workspace，梳理项目结构、核心模块、数据流和下一步改造建议。",
    Icon: Brain
  },
  {
    id: "prototype",
    label: "实现一个功能",
    prompt: "基于当前 Workspace 的代码风格，选择最小可行方案实现我接下来描述的功能，并完成必要验证。",
    Icon: Code2
  },
  {
    id: "release",
    label: "生成发布说明",
    prompt: "基于当前 Workspace 和最近任务历史，整理一份面向使用者的发布说明，包含新增能力、修复和已知限制。",
    Icon: FileText
  }
];

const slashCommands: SlashCommand[] = [
  { name: "/review", description: "审查当前 Workspace 的代码变更", prompt: routineTemplates[1].prompt },
  { name: "/plan", description: "生成一份可执行 MVP 计划", prompt: routineTemplates[2].prompt },
  { name: "/release", description: "整理发布说明", prompt: routineTemplates[3].prompt },
  { name: "/workspace", description: "打开工作区管理", view: "workspaces" },
  { name: "/cron", description: "打开 Hermes 定时任务", view: "schedules" },
  { name: "/skills", description: "打开 Hermes 技能库", view: "skills" },
  { name: "/settings", description: "打开 Hermes 设置", view: "settings" },
  { name: "/clear", description: "清空当前会话视图", clear: true }
];

function createPreviewApi(): DesktopApi {
  let previewState: AppState = {
    config: {
      hermesPath: "/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes",
      provider: "DeepSeek",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      apiKeyConfigured: false,
      apiKeyEnvVar: "DEEPSEEK_API_KEY",
      trustedWorkspaces: [],
      recentWorkspaces: [previewWorkspace]
    },
    currentWorkspace: previewWorkspace,
    tasks: []
  };
  const listeners = new Set<(task: Task) => void>();

  const emit = (task: Task): void => {
    listeners.forEach((listener) => listener(task));
  };

  return {
    getState: async () => previewState,
    chooseImages: async () => [
      {
        id: `preview_attachment_${Date.now()}`,
        name: "preview-image.png",
        path: "/Users/fengyue/Desktop/preview-image.png",
        kind: "image",
        mimeType: "image/png",
        size: 128_000
      }
    ],
    chooseFiles: async () => [
      {
        id: `preview_file_${Date.now()}`,
        name: "README.md",
        path: "/Users/fengyue/Desktop/hermes-ai-native-desktop/README.md",
        kind: "file",
        mimeType: "application/octet-stream",
        size: 24_000
      }
    ],
    chooseFolders: async () => [
      {
        id: `preview_folder_${Date.now()}`,
        name: "src",
        path: "/Users/fengyue/Desktop/hermes-ai-native-desktop/src",
        kind: "directory",
        mimeType: "inode/directory",
        size: 0
      }
    ],
    savePastedImage: async (input) => ({
      id: `preview_paste_${Date.now()}`,
      name: input.name || "pasted-image.png",
      path: "/Users/fengyue/Desktop/pasted-image.png",
      kind: "image",
      mimeType: input.mimeType,
      size: Math.max(1, input.dataUrl.length)
    }),
    revealPath: async () => undefined,
    chooseWorkspace: async () => {
      previewState = {
        ...previewState,
        currentWorkspace: previewWorkspace,
        config: {
          ...previewState.config,
          recentWorkspaces: [previewWorkspace]
        }
      };
      return previewState;
    },
    setWorkspace: async (workspacePath) => {
      previewState = {
        ...previewState,
        currentWorkspace: workspacePath,
        config: {
          ...previewState.config,
          recentWorkspaces: [workspacePath, ...(previewState.config.recentWorkspaces ?? []).filter((item) => item !== workspacePath)]
        }
      };
      return previewState;
    },
    updateConfig: async (config) => {
      previewState = { ...previewState, config: { ...previewState.config, ...config } };
      return previewState;
    },
    syncHermesModelConfig: async (config) => {
      previewState = {
        ...previewState,
        config: {
          ...previewState.config,
          provider: config.provider,
          model: config.model,
          baseUrl: config.baseUrl,
          apiKeyConfigured: Boolean(config.apiKey) || previewState.config.apiKeyConfigured,
          apiKeyEnvVar: apiKeyEnvVarForProvider(config.provider)
        }
      };
      return previewState;
    },
    checkHermes: async () => ({
      ok: true,
      message: "浏览器预览模式：Electron 内运行时会检测真实 Hermes。",
      provider: previewState.config.provider,
      model: previewState.config.model,
      baseUrl: previewState.config.baseUrl,
      apiKeyConfigured: previewState.config.apiKeyConfigured,
      apiKeyEnvVar: previewState.config.apiKeyEnvVar
    }),
    listOllamaModels: async () => ["llama3.1:latest", "qwen2.5-coder:latest", "mistral:latest"],
    listCronJobs: async () => [
      {
        id: "preview-cron-1",
        name: "每日代码巡检",
        schedule: "每天 09:30",
        prompt: "检查当前 Workspace 的关键变更和风险点。",
        state: "active",
        enabled: true,
        nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        repeat: null,
        deliver: ["local"],
        skills: ["codebase-inspection"],
        script: null
      }
    ],
    createCronJob: async (input) => [
      {
        id: `preview-cron-${Date.now()}`,
        name: input.name || "新定时任务",
        schedule: input.schedule,
        prompt: input.prompt,
        state: "active",
        enabled: true,
        nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        repeat: input.repeat ? { times: Number(input.repeat) || null, completed: 0 } : null,
        deliver: [input.deliver || "local"],
        skills: input.skills || [],
        script: input.script || null
      }
    ],
    listSkills: async () => [
      {
        id: "software-development/codebase-inspection",
        name: "codebase-inspection",
        category: "software-development",
        source: "builtin",
        trust: "builtin",
        status: "enabled",
        description: "Inspect a local codebase and summarize structure, risks, and next steps.",
        path: "/Users/fengyue/.hermes/skills/software-development/codebase-inspection"
      },
      {
        id: "github/github-code-review",
        name: "github-code-review",
        category: "github",
        source: "builtin",
        trust: "builtin",
        status: "enabled",
        description: "Review GitHub pull requests and code changes.",
        path: "/Users/fengyue/.hermes/skills/github/github-code-review"
      }
    ],
    runTask: async (input) => {
      const createdAt = new Date().toISOString();
      const task: Task = {
        id: `preview_${Date.now()}`,
        title: input.prompt.slice(0, 24) || "预览任务",
        prompt: input.prompt,
        workspacePath: input.workspacePath,
        status: "running",
        createdAt,
        provider: previewState.config.provider,
        model: previewState.config.model,
        attachments: input.attachments,
        logs: ["[stdout] 预览模式：真实 Hermes 调用会在 Electron 应用窗口中执行。\n"],
        timeline: [
          {
            id: "preview_evt_1",
            title: "创建任务",
            detail: "已记录用户任务，并准备传入 Hermes。",
            tone: "done",
            at: createdAt
          },
          {
            id: "preview_evt_2",
            title: "启动 Hermes Runner",
            detail: "浏览器预览中使用模拟结果；Electron 中会启动真实 CLI。",
            tone: "active",
            at: createdAt
          }
        ],
        artifacts: []
      };

      previewState = { ...previewState, tasks: [task, ...previewState.tasks] };
      emit(task);

      window.setTimeout(() => {
        const completedAt = new Date().toISOString();
        const completed: Task = {
          ...task,
          status: "completed",
          completedAt,
          result: "预览任务完成。桌面应用中会通过 Hermes CLI 返回真实结果，并保存为本地任务产物。",
          timeline: [
            ...task.timeline,
            {
              id: "preview_evt_3",
              title: "任务完成",
              detail: "预览结果已生成。",
              tone: "done",
              at: completedAt
            }
          ],
          artifacts: [
            {
              id: "preview_artifact_1",
              name: "预览任务.md",
              kind: "result",
              content: "预览任务完成。",
              createdAt: completedAt
            }
          ]
        };
        previewState = {
          ...previewState,
          tasks: [completed, ...previewState.tasks.filter((item) => item.id !== completed.id)]
        };
        emit(completed);
      }, 900);

      return task;
    },
    cancelTask: async (taskId) => {
      const task = previewState.tasks.find((item) => item.id === taskId);
      if (!task) return null;
      const cancelled: Task = {
        ...task,
        status: "cancelled",
        completedAt: new Date().toISOString()
      };
      previewState = {
        ...previewState,
        tasks: [cancelled, ...previewState.tasks.filter((item) => item.id !== taskId)]
      };
      emit(cancelled);
      return cancelled;
    },
    deleteTask: async (taskId) => {
      previewState = {
        ...previewState,
        tasks: previewState.tasks.filter((item) => item.id !== taskId)
      };
      return previewState;
    },
    onTaskUpdated: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
}

const desktopApi = window.hermesDesktop ?? createPreviewApi();

function apiKeyEnvVarForProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized.includes("qwen") || normalized.includes("alibaba") || normalized.includes("dashscope")) return "DASHSCOPE_API_KEY";
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

function formatTime(value?: string): string {
  if (!value) return "现在";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value?: string | null): string {
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusText(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    queued: "排队中",
    running: "运行中",
    needs_permission: "等待授权",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消"
  };
  return labels[status];
}

function statusTone(status: TaskStatus): string {
  if (status === "completed") return "green";
  if (status === "running") return "blue";
  if (status === "failed" || status === "cancelled") return "red";
  return "amber";
}

function shortPath(path: string | null): string {
  if (!path) return "尚未选择 Workspace";
  const parts = path.split("/");
  return parts.length > 3 ? `.../${parts.slice(-2).join("/")}` : path;
}

function imageFileUrl(path: string): string {
  return encodeURI(`file://${path}`).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentKindText(kind: TaskAttachment["kind"]): string {
  if (kind === "image") return "图片";
  if (kind === "directory") return "目录";
  return "文件";
}

function attachmentMeta(attachment: TaskAttachment): string {
  if (attachment.kind === "directory") return "目录";
  return `${attachmentKindText(attachment.kind)} · ${formatBytes(attachment.size)}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}

function joinLogs(task?: Task): string {
  return task?.logs.join("").replace(/^\[(stdout|stderr)\]\s*/gm, "").trim() || "任务运行后，Hermes 输出会实时显示在这里。";
}

function formatProcessLogs(task?: Task): string {
  const value = task?.logs.join("").trim();
  if (!value) return "等待 Hermes 输出...";
  return value;
}

function isOllamaProvider(provider: string): boolean {
  return provider.trim().toLowerCase() === "ollama";
}

export function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("workbench");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCheckingHermes, setIsCheckingHermes] = useState(false);
  const [isSavingModelConfig, setIsSavingModelConfig] = useState(false);
  const [statusMessage, setStatusMessage] = useState("正在载入本地工作台...");
  const [checkResult, setCheckResult] = useState<HermesCheckResult | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactPreview | null>(null);
  const [pathDraft, setPathDraft] = useState("");
  const [providerDraft, setProviderDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState("");
  const [isModelConfigOpen, setIsModelConfigOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    void desktopApi.getState().then((nextState) => {
      setState(nextState);
      setPathDraft(nextState.config.hermesPath);
      setProviderDraft(nextState.config.provider ?? "");
      setModelDraft(nextState.config.model ?? "");
      setBaseUrlDraft(nextState.config.baseUrl ?? "");
      setApiKeyDraft("");
      setActiveTaskId(nextState.tasks[0]?.id ?? null);
      setStatusMessage("本地工作台已就绪。");
    });

    const off = desktopApi.onTaskUpdated((task) => {
      setState((current) => {
        if (!current) return current;
        return {
          ...current,
          tasks: [task, ...current.tasks.filter((item) => item.id !== task.id)]
        };
      });
      setActiveTaskId((current) => current ?? task.id);
      setStatusMessage(`任务「${task.title}」${statusText(task.status)}。`);
    });

    return off;
  }, []);

  useEffect(() => {
    if (!state) return;
    void desktopApi.checkHermes().then((result) => {
      setCheckResult(result);
      setLastCheckedAt(new Date().toISOString());
      if (result.provider || result.model || result.baseUrl) {
        setState((current) =>
          current
            ? {
                ...current,
                config: {
                  ...current.config,
                  provider: result.provider ?? current.config.provider,
                  model: result.model ?? current.config.model,
                  baseUrl: result.baseUrl ?? current.config.baseUrl,
                  apiKeyConfigured: result.apiKeyConfigured ?? current.config.apiKeyConfigured,
                  apiKeyEnvVar: result.apiKeyEnvVar ?? current.config.apiKeyEnvVar
                }
              }
            : current
        );
        setProviderDraft(result.provider ?? "");
        setModelDraft(result.model ?? "");
        setBaseUrlDraft(result.baseUrl ?? "");
        setApiKeyDraft("");
      }
    });
  }, [state?.config.hermesPath]);

  useEffect(() => {
    if (!isOllamaProvider(providerDraft)) return;

    let cancelled = false;
    setIsLoadingOllamaModels(true);
    setOllamaModelsError("");

    const timer = window.setTimeout(() => {
      void desktopApi
        .listOllamaModels(baseUrlDraft)
        .then((models) => {
          if (cancelled) return;
          setOllamaModels(models);
          if (models.length === 0) {
            setOllamaModelsError("没有读取到本机 Ollama 模型，可确认 Ollama 是否已启动。");
            return;
          }
          setModelDraft((current) => (current && models.includes(current) ? current : models[0]));
        })
        .catch((error) => {
          if (cancelled) return;
          setOllamaModels([]);
          setOllamaModelsError(error instanceof Error ? error.message : "读取 Ollama 模型失败。");
        })
        .finally(() => {
          if (!cancelled) setIsLoadingOllamaModels(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [providerDraft, baseUrlDraft]);

  const activeTask = useMemo(() => {
    return activeTaskId ? state?.tasks.find((task) => task.id === activeTaskId) : undefined;
  }, [activeTaskId, state?.tasks]);

  const chatEntries = useMemo<ChatEntry[]>(() => {
    if (!activeTask) return [];

    const output = activeTask.result || activeTask.error || (activeTask.status === "running" ? "Hermes 正在执行，过程进度会在下方实时更新。" : joinLogs(activeTask));
    return [
      {
        id: `${activeTask.id}-user`,
        role: "user",
        title: "You",
        content: activeTask.prompt,
        attachments: activeTask.attachments,
        at: activeTask.createdAt
      },
      {
        id: `${activeTask.id}-agent`,
        role: "agent",
        title: activeTask.provider || "Hermes",
        content: output,
        status: activeTask.status,
        at: activeTask.completedAt || activeTask.createdAt
      }
    ];
  }, [activeTask]);

  const visibleSlashCommands = useMemo(() => {
    const value = prompt.trim();
    if (!value.startsWith("/") || value.includes(" ")) return [];
    return slashCommands.filter((command) => command.name.startsWith(value.toLowerCase()));
  }, [prompt]);

  const runningTask = state?.tasks.find((task) => task.status === "running");
  const artifacts = activeTask?.artifacts ?? [];
  const trustedWorkspaces = state?.config.trustedWorkspaces ?? [];
  const isWorkspaceTrusted = Boolean(state?.currentWorkspace && trustedWorkspaces.includes(state.currentWorkspace));
  const hasWorkspacePermission = !state?.currentWorkspace || permissionGranted || isWorkspaceTrusted;
  const canSendPrompt = Boolean(prompt.trim() || attachments.length);

  function addAttachments(selected: TaskAttachment[], label: string): void {
    if (!selected.length) return;
    setAttachments((current) => {
      const existing = new Set(current.map((item) => item.path));
      return [...current, ...selected.filter((item) => !existing.has(item.path))].slice(0, 12);
    });
    setStatusMessage(`已添加 ${selected.length} 个${label}。`);
    window.setTimeout(() => promptRef.current?.focus(), 0);
  }

  async function chooseImageAttachments(): Promise<void> {
    try {
      const selected = await desktopApi.chooseImages();
      addAttachments(selected, "图片");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "选择图片失败。");
    }
  }

  async function chooseFileAttachments(): Promise<void> {
    try {
      const selected = await desktopApi.chooseFiles();
      addAttachments(selected, "文件");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "选择文件失败。");
    }
  }

  async function chooseFolderAttachments(): Promise<void> {
    try {
      const selected = await desktopApi.chooseFolders();
      addAttachments(selected, "目录");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "选择目录失败。");
    }
  }

  async function handlePromptPaste(event: ClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;

    event.preventDefault();
    try {
      const pasted = await Promise.all(
        imageFiles.map(async (file, index) =>
          desktopApi.savePastedImage({
            name: file.name || `pasted-image-${index + 1}`,
            mimeType: file.type || "image/png",
            dataUrl: await fileToDataUrl(file)
          })
        )
      );
      addAttachments(pasted, "粘贴图片");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "粘贴图片失败。");
    }
  }

  async function revealAttachment(attachment: TaskAttachment): Promise<void> {
    try {
      await desktopApi.revealPath(attachment.path);
      setStatusMessage(`已打开${attachmentKindText(attachment.kind)}位置。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "打开附件位置失败。");
    }
  }

  function removeAttachment(id: string): void {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }

  function applyPrompt(value: string): void {
    setActiveView("workbench");
    setPrompt(value);
    window.setTimeout(() => promptRef.current?.focus(), 0);
  }

  function applySlashCommand(command: SlashCommand): void {
    if (command.clear) {
      setActiveTaskId(null);
      setPrompt("");
      setAttachments([]);
      setStatusMessage("当前会话视图已清空。");
      return;
    }
    if (command.view) {
      setActiveView(command.view);
      setPrompt("");
      return;
    }
    if (command.prompt) {
      applyPrompt(command.prompt);
    }
  }

  async function chooseWorkspace(): Promise<void> {
    const nextState = await desktopApi.chooseWorkspace();
    setState(nextState);
    setPermissionGranted(Boolean(nextState.currentWorkspace && nextState.config.trustedWorkspaces?.includes(nextState.currentWorkspace)));
    setStatusMessage(nextState.currentWorkspace ? `已选择 ${shortPath(nextState.currentWorkspace)}。` : "没有选择新的 Workspace。");
  }

  async function setWorkspace(workspacePath: string): Promise<void> {
    try {
      const nextState = await desktopApi.setWorkspace(workspacePath);
      setState(nextState);
      setPermissionGranted(Boolean(nextState.currentWorkspace && nextState.config.trustedWorkspaces?.includes(nextState.currentWorkspace)));
      setStatusMessage(`已切换 Workspace：${shortPath(workspacePath)}。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? `切换失败：${error.message}` : "切换 Workspace 失败。");
    }
  }

  async function trustCurrentWorkspace(): Promise<void> {
    if (!state?.currentWorkspace) return;

    const nextTrustedWorkspaces = Array.from(new Set([...(state.config.trustedWorkspaces ?? []), state.currentWorkspace]));
    const nextState = await desktopApi.updateConfig({ trustedWorkspaces: nextTrustedWorkspaces });
    setState(nextState);
    setPermissionGranted(true);
    setStatusMessage(`已信任 Workspace：${shortPath(state.currentWorkspace)}。`);
  }

  async function revokeWorkspaceTrust(workspacePath: string): Promise<void> {
    if (!state) return;

    const nextTrustedWorkspaces = (state.config.trustedWorkspaces ?? []).filter((workspace) => workspace !== workspacePath);
    const nextState = await desktopApi.updateConfig({ trustedWorkspaces: nextTrustedWorkspaces });
    setState(nextState);
    if (state.currentWorkspace === workspacePath) {
      setPermissionGranted(false);
    }
    setStatusMessage(`已取消信任 Workspace：${shortPath(workspacePath)}。`);
  }

  function startNewTask(): void {
    setActiveView("workbench");
    setActiveTaskId(null);
    setPrompt("");
    setAttachments([]);
    setStatusMessage("已创建新任务草稿。");
    window.setTimeout(() => promptRef.current?.focus(), 0);
  }

  async function saveHermesPath(): Promise<void> {
    if (!state || pathDraft.trim() === state.config.hermesPath) return;
    const nextState = await desktopApi.updateConfig({ hermesPath: pathDraft.trim() });
    setState(nextState);
    setStatusMessage("Hermes 路径已保存。");
  }

  async function syncModelConfig(config: ModelConfigInput): Promise<void> {
    setIsSavingModelConfig(true);
    setStatusMessage("正在同步 Hermes 模型配置...");

    try {
      const nextState = await desktopApi.syncHermesModelConfig(config);
      setState(nextState);
      setProviderDraft(nextState.config.provider ?? config.provider);
      setModelDraft(nextState.config.model ?? config.model);
      setBaseUrlDraft(nextState.config.baseUrl ?? config.baseUrl);
      setApiKeyDraft("");
      setStatusMessage("模型配置已同步到 Hermes 本地配置。");
      await runHermesCheck();
    } catch (error) {
      setStatusMessage(error instanceof Error ? `同步失败：${error.message}` : "同步 Hermes 模型配置失败。");
    } finally {
      setIsSavingModelConfig(false);
    }
  }

  function applyModelPreset(provider: string): void {
    if (provider === "Custom") {
      setProviderDraft("");
      setBaseUrlDraft("");
      return;
    }

    const preset = modelPresets.find((item) => item.provider.toLowerCase() === provider.toLowerCase());
    setProviderDraft(provider);
    if (!preset) return;
    setBaseUrlDraft(preset.baseUrl);
    if (preset.models.length > 0 && !preset.models.includes(modelDraft)) {
      setModelDraft(preset.models[0]);
    }
  }

  async function runHermesCheck(): Promise<void> {
    if (!state) return;

    setIsCheckingHermes(true);
    setStatusMessage("正在检测 Hermes 连接...");

    try {
      const nextPath = pathDraft.trim();
      if (nextPath && nextPath !== state.config.hermesPath) {
        const nextState = await desktopApi.updateConfig({ hermesPath: nextPath });
        setState(nextState);
      }

      const result = await desktopApi.checkHermes();
      const checkedAt = new Date().toISOString();
      setCheckResult(result);
      setLastCheckedAt(checkedAt);

      if (result.provider || result.model || result.baseUrl) {
        setState((current) =>
          current
            ? {
                ...current,
                config: {
                  ...current.config,
                  provider: result.provider ?? current.config.provider,
                  model: result.model ?? current.config.model,
                  baseUrl: result.baseUrl ?? current.config.baseUrl,
                  apiKeyConfigured: result.apiKeyConfigured ?? current.config.apiKeyConfigured,
                  apiKeyEnvVar: result.apiKeyEnvVar ?? current.config.apiKeyEnvVar
                }
              }
            : current
        );
        setProviderDraft(result.provider ?? "");
        setModelDraft(result.model ?? "");
        setBaseUrlDraft(result.baseUrl ?? "");
        setApiKeyDraft("");
      }

      setStatusMessage(result.ok ? `检测完成：Hermes 连接正常（${formatTime(checkedAt)}）。` : `检测失败：${result.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hermes 检测失败。";
      setCheckResult({ ok: false, message });
      setLastCheckedAt(new Date().toISOString());
      setStatusMessage(`检测失败：${message}`);
    } finally {
      setIsCheckingHermes(false);
    }
  }

  async function runTask(): Promise<void> {
    if (!state || !canSendPrompt) return;
    if (!hasWorkspacePermission) {
      setActiveView("workbench");
      setStatusMessage("请先允许或信任当前 Workspace。");
      return;
    }

    const taskPrompt = prompt.trim();
    const taskAttachments = attachments;
    setIsStarting(true);
    try {
      const task = await desktopApi.runTask({
        prompt: taskPrompt,
        workspacePath: state.currentWorkspace,
        attachments: taskAttachments
      });
      setActiveTaskId(task.id);
      setPrompt("");
      setAttachments([]);
      setStatusMessage(`任务「${task.title}」已启动。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "任务启动失败。");
    } finally {
      setIsStarting(false);
    }
  }

  async function cancelActiveTask(): Promise<void> {
    if (!runningTask) return;
    await desktopApi.cancelTask(runningTask.id);
  }

  async function deleteTask(task: Task): Promise<void> {
    const nextState = await desktopApi.deleteTask(task.id);
    setState(nextState);
    setActiveTaskId((current) => {
      if (current !== task.id) return current;
      return nextState.tasks[0]?.id ?? null;
    });
    setStatusMessage(`任务「${task.title}」已删除。`);
  }

  async function rerunTask(task: Task): Promise<void> {
    setActiveView("workbench");
    setPrompt(task.prompt);
    setActiveTaskId(task.id);
    setStatusMessage("任务内容已放回输入框，可以调整后再次运行。");
  }

  async function copyText(value: string, label: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    setStatusMessage(`已复制${label}。`);
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (prompt.trim().startsWith("/")) return;
      if (canSendPrompt) void runTask();
    }
  }

  if (!state) {
    return (
      <main className="boot">
        <div className="bootMark">H</div>
        <p>{statusMessage}</p>
      </main>
    );
  }

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brandMark" src={hermesIcon} alt="" />
          <div>
            <strong>HDM</strong>
            <span>Agent Workbench</span>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          <button className={activeView === "workbench" ? "active" : ""} type="button" onClick={() => setActiveView("workbench")}>
            <Bot size={18} /> 工作台
          </button>
          <button className={activeView === "workspaces" ? "active" : ""} type="button" onClick={() => setActiveView("workspaces")}>
            <FolderOpen size={18} /> 工作区
          </button>
          <button className={activeView === "tasks" ? "active" : ""} type="button" onClick={() => setActiveView("tasks")}>
            <History size={18} /> 任务历史
          </button>
          <button className={activeView === "artifacts" ? "active" : ""} type="button" onClick={() => setActiveView("artifacts")}>
            <Archive size={18} /> 产物
          </button>
          <button className={activeView === "routines" ? "active" : ""} type="button" onClick={() => setActiveView("routines")}>
            <Workflow size={18} /> 自动流程
          </button>
          <button className={activeView === "schedules" ? "active" : ""} type="button" onClick={() => setActiveView("schedules")}>
            <CalendarClock size={18} /> 定时任务
          </button>
          <button className={activeView === "skills" ? "active" : ""} type="button" onClick={() => setActiveView("skills")}>
            <Puzzle size={18} /> 技能
          </button>
          <button className={activeView === "settings" ? "active" : ""} type="button" onClick={() => setActiveView("settings")}>
            <Settings size={18} /> 设置
          </button>
        </nav>

        <section className="sideSection recentTasksSection">
          <div className="sectionLabel">最近任务</div>
          <div className="taskList">
            {state.tasks.length === 0 ? (
              <div className="empty">还没有任务记录。</div>
            ) : (
              state.tasks.map((task) => (
                <button
                  className={`taskItem ${task.id === activeTask?.id ? "selected" : ""}`}
                  key={task.id}
                  type="button"
                  onClick={() => {
                    setActiveTaskId(task.id);
                    setActiveView("tasks");
                  }}
                >
                  <strong>{task.title}</strong>
                  <span>
                    {statusText(task.status)} · {formatTime(task.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>本地 AI 工作台</h1>
            <p>把 Workspace、任务、权限和产物组织成一个可复用的执行闭环。</p>
          </div>
          <div className="toolbar">
            <span className={`pill ${checkResult?.ok ? "green" : "amber"}`}>
              <Activity size={14} /> {isCheckingHermes ? "检测中" : checkResult?.ok ? "Hermes 可用" : "待检测"}
            </span>
            {runningTask ? (
              <button className="button danger" type="button" onClick={cancelActiveTask}>
                <Square size={16} /> 停止
              </button>
            ) : (
              <button className="button primary" type="button" onClick={startNewTask}>
                <Play size={16} /> 新任务
              </button>
            )}
          </div>
        </header>

        {activeView === "workbench" ? (
          <section className="chatWorkbench">
            <div className="chatHeader">
              <div className="chatHeaderLeft">
                <strong>{activeTask ? activeTask.title : "New Hermes Session"}</strong>
                <span>{shortPath(state.currentWorkspace)} · {state.config.provider || "Hermes"} / {state.config.model || "default"}</span>
              </div>
              <div className="chatHeaderActions">
                <button className="iconButton" type="button" title="新任务" onClick={startNewTask}>
                  <Plus size={16} />
                </button>
                {activeTask && (
                  <button className="iconButton" type="button" title="清空当前会话视图" onClick={() => setActiveTaskId(null)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="chatMessages">
              {chatEntries.length === 0 ? (
                <div className="chatEmpty">
                  <div className="chatEmptyIcon">
                    <img src={hermesIcon} alt="" />
                  </div>
                  <h2>今天让 Hermes 处理什么？</h2>
                  <p>选择一个工作区，输入任务，Hermes 会在本地执行并把结果、日志和产物沉淀到历史里。</p>
                  <div className="suggestionGrid">
                    {promptSuggestions.map(({ id, label, prompt: suggestionPrompt, Icon }) => (
                      <button className="suggestionButton" key={id} type="button" onClick={() => applyPrompt(suggestionPrompt)}>
                        <Icon size={16} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {chatEntries.map((entry) => (
                    <article className={`messageRow ${entry.role}`} key={entry.id}>
                      <div className="messageAvatar">{entry.role === "user" ? "你" : "H"}</div>
                      <div className="messageBubble">
                        <div className="messageMeta">
                          <strong>{entry.title}</strong>
                          <span>{formatTime(entry.at)}</span>
                          {entry.status && <span className={`pill ${statusTone(entry.status)}`}>{statusText(entry.status)}</span>}
                        </div>
                        {entry.attachments?.length ? (
                          <div className="messageAttachments">
                            {entry.attachments.map((attachment) => (
                              <AttachmentPreview attachment={attachment} key={attachment.id} onReveal={() => void revealAttachment(attachment)} />
                            ))}
                          </div>
                        ) : null}
                        <pre>{entry.content}</pre>
                        {entry.role === "agent" && activeTask ? <TaskProgress task={activeTask} /> : null}
                      </div>
                    </article>
                  ))}
                </>
              )}
            </div>

            {state.currentWorkspace && !hasWorkspacePermission && (
              <div className="inlinePermission">
                <div>
                  <strong>需要授权读取 Workspace</strong>
                  <span>Hermes 将以 {shortPath(state.currentWorkspace)} 作为任务上下文运行。</span>
                </div>
                <div className="inlineActions">
                  <button className="button secondary" type="button" onClick={() => setPermissionGranted(true)}>
                    <ShieldCheck size={16} /> 允许本次
                  </button>
                  <button className="button primary" type="button" onClick={() => void trustCurrentWorkspace()}>
                    <Check size={16} /> 信任此目录
                  </button>
                </div>
              </div>
            )}

            <div className="chatInputArea">
              {visibleSlashCommands.length > 0 && (
                <div className="slashMenu">
                  <div className="slashMenuHeader">
                    <Terminal size={12} /> 快捷命令
                  </div>
                  {visibleSlashCommands.map((command) => (
                    <button className="slashMenuItem" key={command.name} type="button" onClick={() => applySlashCommand(command)}>
                      <strong>{command.name}</strong>
                      <span>{command.description}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="chatInputWrapper">
                {attachments.length > 0 && (
                  <div className="attachmentTray">
                    {attachments.map((attachment) => (
                      <AttachmentPreview
                        attachment={attachment}
                        key={attachment.id}
                        onRemove={() => removeAttachment(attachment.id)}
                        onReveal={() => void revealAttachment(attachment)}
                      />
                    ))}
                  </div>
                )}
                <div className="chatTextRow">
                  <button className="attachButton" type="button" title="添加图片" onClick={() => void chooseImageAttachments()} disabled={Boolean(runningTask) || isStarting}>
                    <ImagePlus size={17} />
                  </button>
                  <button className="attachButton" type="button" title="选择文件" onClick={() => void chooseFileAttachments()} disabled={Boolean(runningTask) || isStarting}>
                    <Paperclip size={17} />
                  </button>
                  <button className="attachButton" type="button" title="选择目录" onClick={() => void chooseFolderAttachments()} disabled={Boolean(runningTask) || isStarting}>
                    <FolderOpen size={17} />
                  </button>
                  <textarea
                    ref={promptRef}
                    aria-label="任务输入"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    onPaste={(event) => void handlePromptPaste(event)}
                    placeholder="输入文字任务，也可以粘贴图片或添加附件..."
                    rows={1}
                  />
                  {runningTask ? (
                    <button className="sendButton stop" type="button" title="停止" onClick={cancelActiveTask}>
                      <Square size={16} />
                    </button>
                  ) : (
                    <button className="sendButton" type="button" title="发送" onClick={runTask} disabled={isStarting || !canSendPrompt || prompt.trim().startsWith("/")}>
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </div>
              <div className="modelStrip">
                <span className={`pill ${checkResult?.ok ? "green" : "amber"}`}>
                  <Activity size={14} /> {isCheckingHermes ? "检测中" : checkResult?.ok ? "Hermes 可用" : "待检测"}
                </span>
                <button className="modelPill" type="button" onClick={() => setIsModelConfigOpen(true)}>
                  <Settings size={14} /> 模型配置
                </button>
                <button className="modelPill" type="button" onClick={() => setActiveView("workspaces")}>
                  <FolderOpen size={14} /> {state.currentWorkspace ? shortPath(state.currentWorkspace) : "选择 Workspace"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <SecondaryView
            view={activeView}
            state={state}
            activeTask={activeTask}
            artifacts={artifacts}
            pathDraft={pathDraft}
            setPathDraft={setPathDraft}
            chooseWorkspace={chooseWorkspace}
            setWorkspace={setWorkspace}
            saveHermesPath={saveHermesPath}
            checkHermes={runHermesCheck}
            isCheckingHermes={isCheckingHermes}
            syncModelConfig={syncModelConfig}
            isSavingModelConfig={isSavingModelConfig}
            providerDraft={providerDraft}
            modelDraft={modelDraft}
            baseUrlDraft={baseUrlDraft}
            apiKeyDraft={apiKeyDraft}
            ollamaModels={ollamaModels}
            isLoadingOllamaModels={isLoadingOllamaModels}
            ollamaModelsError={ollamaModelsError}
            setProviderDraft={setProviderDraft}
            setModelDraft={setModelDraft}
            setBaseUrlDraft={setBaseUrlDraft}
            setApiKeyDraft={setApiKeyDraft}
            applyModelPreset={applyModelPreset}
            checkResult={checkResult}
            lastCheckedAt={lastCheckedAt}
            statusMessage={statusMessage}
            trustCurrentWorkspace={trustCurrentWorkspace}
            revokeWorkspaceTrust={revokeWorkspaceTrust}
            openArtifact={setSelectedArtifact}
            openTask={(task) => {
              setActiveTaskId(task.id);
              setActiveView("tasks");
            }}
            revealAttachment={revealAttachment}
            deleteTask={deleteTask}
            rerunTask={rerunTask}
            startRoutine={(routinePrompt) => {
              setPrompt(routinePrompt);
              setActiveView("workbench");
              window.setTimeout(() => promptRef.current?.focus(), 0);
            }}
          />
        )}
      </main>

      {selectedArtifact && (
        <ArtifactModal
          artifact={selectedArtifact}
          onClose={() => setSelectedArtifact(null)}
          onCopied={() => setStatusMessage(`已复制产物「${selectedArtifact.name}」。`)}
        />
      )}

      {isModelConfigOpen && (
        <ModelConfigModal
          providerDraft={providerDraft}
          modelDraft={modelDraft}
          baseUrlDraft={baseUrlDraft}
          apiKeyDraft={apiKeyDraft}
          ollamaModels={ollamaModels}
          isLoadingOllamaModels={isLoadingOllamaModels}
          ollamaModelsError={ollamaModelsError}
          setProviderDraft={setProviderDraft}
          setModelDraft={setModelDraft}
          setBaseUrlDraft={setBaseUrlDraft}
          setApiKeyDraft={setApiKeyDraft}
          applyModelPreset={applyModelPreset}
          isSavingModelConfig={isSavingModelConfig}
          syncModelConfig={syncModelConfig}
          onClose={() => setIsModelConfigOpen(false)}
        />
      )}
    </div>
  );
}

function Timeline({ events }: { events: TaskEvent[] }): JSX.Element {
  if (events.length === 0) {
    return (
      <div className="timeline emptyTimeline">
        <div className="empty">运行任务后，这里会显示 Hermes 的执行阶段。</div>
      </div>
    );
  }

  return (
    <div className="timeline">
      {events.map((event) => (
        <div className="event" key={event.id}>
          <div className={`dot ${event.tone}`} />
          <div>
            <strong>{event.title}</strong>
            <span>{event.detail}</span>
          </div>
          <time>{formatTime(event.at)}</time>
        </div>
      ))}
    </div>
  );
}

function TaskProgress({ task }: { task: Task }): JSX.Element {
  return (
    <div className="taskProgress">
      <div className="taskProgressHeader">
        <Activity size={14} />
        <strong>执行过程</strong>
        <span>{task.timeline.length} 个阶段</span>
      </div>
      <Timeline events={task.timeline} />
      <details className="processLog" open={task.status === "running" || task.logs.length > 0}>
        <summary>进程输出</summary>
        <pre>{formatProcessLogs(task)}</pre>
      </details>
    </div>
  );
}

function AttachmentPreview({
  attachment,
  onRemove,
  onReveal
}: {
  attachment: TaskAttachment;
  onRemove?: () => void;
  onReveal?: () => void;
}): JSX.Element {
  const isImage = attachment.kind === "image";

  return (
    <div className="attachmentChip">
      {isImage ? (
        <img src={imageFileUrl(attachment.path)} alt={attachment.name} />
      ) : (
        <div className="attachmentIcon">{attachment.kind === "directory" ? <FolderOpen size={18} /> : <FileText size={18} />}</div>
      )}
      <span title={attachment.path}>
        <strong>{attachment.name}</strong>
        <small>{attachmentMeta(attachment)}</small>
      </span>
      {onReveal && (
        <button type="button" title="在 Finder 中打开" onClick={onReveal}>
          <FolderOpen size={14} />
        </button>
      )}
      {onRemove && (
        <button type="button" title="移除附件" onClick={onRemove}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function SecondaryView({
  view,
  state,
  activeTask,
  artifacts,
  pathDraft,
  setPathDraft,
  chooseWorkspace,
  setWorkspace,
  saveHermesPath,
  checkHermes,
  isCheckingHermes,
  syncModelConfig,
  isSavingModelConfig,
  providerDraft,
  modelDraft,
  baseUrlDraft,
  apiKeyDraft,
  ollamaModels,
  isLoadingOllamaModels,
  ollamaModelsError,
  setProviderDraft,
  setModelDraft,
  setBaseUrlDraft,
  setApiKeyDraft,
  applyModelPreset,
  checkResult,
  lastCheckedAt,
  statusMessage,
  trustCurrentWorkspace,
  revokeWorkspaceTrust,
  openArtifact,
  openTask,
  revealAttachment,
  deleteTask,
  rerunTask,
  startRoutine
}: {
  view: ViewId;
  state: AppState;
  activeTask?: Task;
  artifacts: Task["artifacts"];
  pathDraft: string;
  setPathDraft: (value: string) => void;
  chooseWorkspace: () => Promise<void>;
  setWorkspace: (workspacePath: string) => Promise<void>;
  saveHermesPath: () => Promise<void>;
  checkHermes: () => Promise<void>;
  isCheckingHermes: boolean;
  syncModelConfig: (config: ModelConfigInput) => Promise<void>;
  isSavingModelConfig: boolean;
  providerDraft: string;
  modelDraft: string;
  baseUrlDraft: string;
  apiKeyDraft: string;
  ollamaModels: string[];
  isLoadingOllamaModels: boolean;
  ollamaModelsError: string;
  setProviderDraft: (value: string) => void;
  setModelDraft: (value: string) => void;
  setBaseUrlDraft: (value: string) => void;
  setApiKeyDraft: (value: string) => void;
  applyModelPreset: (provider: string) => void;
  checkResult: HermesCheckResult | null;
  lastCheckedAt: string | null;
  statusMessage: string;
  trustCurrentWorkspace: () => Promise<void>;
  revokeWorkspaceTrust: (workspacePath: string) => Promise<void>;
  openArtifact: (artifact: ArtifactPreview) => void;
  openTask: (task: Task) => void;
  revealAttachment: (attachment: TaskAttachment) => Promise<void>;
  deleteTask: (task: Task) => Promise<void>;
  rerunTask: (task: Task) => Promise<void>;
  startRoutine: (prompt: string) => void;
}): JSX.Element {
  const [taskFilter, setTaskFilter] = useState<TaskStatus | "all">("all");
  const [artifactQuery, setArtifactQuery] = useState("");
  const [artifactKind, setArtifactKind] = useState<Artifact["kind"] | "all">("all");
  const [selectedRoutineId, setSelectedRoutineId] = useState(routineTemplates[0].id);
  const [cronJobs, setCronJobs] = useState<HermesCronJob[]>([]);
  const [isLoadingCron, setIsLoadingCron] = useState(false);
  const [cronError, setCronError] = useState("");
  const [isCronCreateOpen, setIsCronCreateOpen] = useState(false);
  const [isCreatingCron, setIsCreatingCron] = useState(false);
  const [cronCreateError, setCronCreateError] = useState("");
  const [cronDraft, setCronDraft] = useState<CreateCronJobInput>({
    schedule: "",
    prompt: "",
    name: "",
    deliver: "local",
    repeat: "",
    skills: [],
    script: "",
    noAgent: false,
    workdir: state.currentWorkspace || ""
  });
  const [cronSkillsDraft, setCronSkillsDraft] = useState("");
  const [skills, setSkills] = useState<HermesSkill[]>([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [skillSource, setSkillSource] = useState("all");
  const [skillStatus, setSkillStatus] = useState("all");

  async function copyModuleText(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
  }

  async function refreshCronJobs(): Promise<void> {
    setIsLoadingCron(true);
    setCronError("");
    try {
      setCronJobs(await desktopApi.listCronJobs());
    } catch (error) {
      setCronError(error instanceof Error ? error.message : "读取定时任务失败。");
    } finally {
      setIsLoadingCron(false);
    }
  }

  function openCronCreate(): void {
    setCronDraft({
      schedule: "",
      prompt: "",
      name: "",
      deliver: "local",
      repeat: "",
      skills: [],
      script: "",
      noAgent: false,
      workdir: state.currentWorkspace || ""
    });
    setCronSkillsDraft("");
    setCronCreateError("");
    setIsCronCreateOpen(true);
  }

  async function submitCronCreate(): Promise<void> {
    setIsCreatingCron(true);
    setCronCreateError("");
    try {
      const nextJobs = await desktopApi.createCronJob({
        ...cronDraft,
        skills: cronSkillsDraft
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean)
      });
      setCronJobs(nextJobs);
      setIsCronCreateOpen(false);
    } catch (error) {
      setCronCreateError(error instanceof Error ? error.message : "创建定时任务失败。");
    } finally {
      setIsCreatingCron(false);
    }
  }

  async function refreshSkills(): Promise<void> {
    setIsLoadingSkills(true);
    setSkillsError("");
    try {
      setSkills(await desktopApi.listSkills());
    } catch (error) {
      setSkillsError(error instanceof Error ? error.message : "读取技能失败。");
    } finally {
      setIsLoadingSkills(false);
    }
  }

  useEffect(() => {
    if (view === "schedules") void refreshCronJobs();
    if (view === "skills") void refreshSkills();
  }, [view]);

  const allArtifacts = state.tasks.flatMap((task) =>
    task.artifacts.map((artifact) => ({
      ...artifact,
      taskTitle: task.title
    }))
  );
  const trustedWorkspaces = state.config.trustedWorkspaces ?? [];
  const recentWorkspaces = state.config.recentWorkspaces ?? [];
  const filteredTasks = state.tasks.filter((task) => taskFilter === "all" || task.status === taskFilter);
  const visibleArtifacts = allArtifacts
    .filter((artifact) => artifactKind === "all" || artifact.kind === artifactKind)
    .filter((artifact) => {
      const query = artifactQuery.trim().toLowerCase();
      if (!query) return true;
      return `${artifact.name} ${artifact.kind} ${artifact.taskTitle} ${artifact.content}`.toLowerCase().includes(query);
    });
  const selectedRoutine = routineTemplates.find((routine) => routine.id === selectedRoutineId) ?? routineTemplates[0];
  const skillSources = Array.from(new Set(skills.map((skill) => skill.source).filter(Boolean)));
  const skillStatuses = Array.from(new Set(skills.map((skill) => skill.status).filter(Boolean)));
  const visibleSkills = skills.filter((skill) => {
    const query = skillQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      `${skill.name} ${skill.category} ${skill.source} ${skill.trust} ${skill.status} ${skill.description} ${skill.path || ""}`.toLowerCase().includes(query);
    return matchesQuery && (skillSource === "all" || skill.source === skillSource) && (skillStatus === "all" || skill.status === skillStatus);
  });

  if (view === "workspaces") {
    return (
      <section className="workbench pageView">
        <div className="workspaceLayout">
          <section className="infoCard wide">
            <span>当前 Workspace</span>
            <strong>{state.currentWorkspace || "尚未选择"}</strong>
            <p>{state.currentWorkspace ? "Hermes Runner 会以这个目录作为 cwd 和任务上下文。" : "请选择一个项目目录开始运行本地任务。"}</p>
            <div className="cardActions">
              <button className="button primary" type="button" onClick={chooseWorkspace}>
                <FolderOpen size={16} /> 选择 Workspace
              </button>
              {state.currentWorkspace && (
                trustedWorkspaces.includes(state.currentWorkspace) ? (
                  <button className="button secondary" type="button" onClick={() => void revokeWorkspaceTrust(state.currentWorkspace!)}>
                    <X size={16} /> 取消信任
                  </button>
                ) : (
                  <button className="button secondary" type="button" onClick={() => void trustCurrentWorkspace()}>
                    <ShieldCheck size={16} /> 信任当前目录
                  </button>
                )
              )}
            </div>
          </section>
          <section className="listPanel">
            <div className="panelTitle inlineTitle">最近 Workspace</div>
            {recentWorkspaces.length === 0 ? (
              <div className="empty">还没有最近目录。点击“选择 Workspace”添加一个。</div>
            ) : (
              recentWorkspaces.map((workspace) => (
                <button className={`historyRow ${workspace === state.currentWorkspace ? "selected" : ""}`} key={workspace} type="button" onClick={() => void setWorkspace(workspace)}>
                  <div>
                    <strong>{workspace.split("/").at(-1) || workspace}</strong>
                    <span>{workspace}</span>
                  </div>
                  <span className={`pill ${trustedWorkspaces.includes(workspace) ? "green" : "amber"}`}>
                    {trustedWorkspaces.includes(workspace) ? "已信任" : "未信任"}
                  </span>
                </button>
              ))
            )}
          </section>
          <section className="pageGrid">
            <div className="infoCard">
              <span>任务数量</span>
              <strong>{state.tasks.length}</strong>
              <p>当前本地历史中保存的任务记录。</p>
            </div>
            <div className="infoCard">
              <span>信任目录</span>
              <strong>{trustedWorkspaces.length}</strong>
              <p>可在设置页集中管理。</p>
            </div>
          </section>
        </div>
      </section>
    );
  }

  if (view === "tasks") {
    return (
      <section className="workbench pageView">
        <div className="taskHistoryLayout">
          <section className="listPanel">
            <div className="filterBar">
              {(["all", "running", "completed", "failed", "cancelled"] as Array<TaskStatus | "all">).map((status) => (
                <button className={`filterButton ${taskFilter === status ? "active" : ""}`} key={status} type="button" onClick={() => setTaskFilter(status)}>
                  {status === "all" ? "全部" : statusText(status)}
                </button>
              ))}
            </div>
            {filteredTasks.length === 0 ? (
              <div className="empty">这个筛选下还没有任务。</div>
            ) : (
              filteredTasks.map((task) => (
                <button className={`historyRow ${task.id === activeTask?.id ? "selected" : ""}`} key={task.id} type="button" onClick={() => openTask(task)}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.workspacePath || "无 Workspace"} · {formatTime(task.createdAt)}</span>
                  </div>
                  <span className={`pill ${statusTone(task.status)}`}>{statusText(task.status)}</span>
                </button>
              ))
            )}
          </section>
          <section className="panel resultPanel">
            <div className="panelTitle">
              <span>{activeTask?.title || "任务详情"}</span>
              {activeTask && (
                <div className="panelTitleActions">
                  <button className="button secondary compact" type="button" onClick={() => void rerunTask(activeTask)}>
                    <RotateCcw size={15} /> 复跑
                  </button>
                  <button className="button danger compact" type="button" onClick={() => void deleteTask(activeTask)}>
                    <Trash2 size={15} /> 删除
                  </button>
                </div>
              )}
            </div>
            {activeTask ? (
              <div className="taskDetail">
                <div className="detailGrid">
                  <div>
                    <span>状态</span>
                    <strong>{statusText(activeTask.status)}</strong>
                  </div>
                  <div>
                    <span>创建时间</span>
                    <strong>{formatTime(activeTask.createdAt)}</strong>
                  </div>
                  <div>
                    <span>产物</span>
                    <strong>{activeTask.artifacts.length}</strong>
                  </div>
                  <div>
                    <span>Workspace</span>
                    <div className="copyValue">
                      <strong title={activeTask.workspacePath || "尚未选择 Workspace"}>{shortPath(activeTask.workspacePath)}</strong>
                      {activeTask.workspacePath && (
                        <button className="copyButton" type="button" title="复制 Workspace 路径" onClick={() => void copyText(activeTask.workspacePath!, "Workspace 路径")}>
                          <Copy size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <section>
                  <h3>任务内容</h3>
                  <p>{activeTask.prompt}</p>
                </section>
                {activeTask.attachments?.length ? (
                  <section>
                    <h3>附件</h3>
                    <div className="detailAttachmentGrid">
                      {activeTask.attachments.map((attachment) => (
                        <AttachmentPreview attachment={attachment} key={attachment.id} onReveal={() => void revealAttachment(attachment)} />
                      ))}
                    </div>
                  </section>
                ) : null}
                <section>
                  <h3>结果</h3>
                  <pre>{activeTask.result || joinLogs(activeTask)}</pre>
                </section>
                {activeTask.artifacts.length > 0 && (
                  <section>
                    <h3>产物</h3>
                    <div className="compactArtifactList">
                      {activeTask.artifacts.map((artifact) => (
                        <button className="taskArtifactButton" key={artifact.id} type="button" onClick={() => openArtifact({ ...artifact, taskTitle: activeTask.title })}>
                          <strong>{artifact.name}</strong>
                          <span>{artifact.kind} · {formatTime(artifact.createdAt)}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="empty detailEmpty">选择一个任务查看详情。</div>
            )}
          </section>
        </div>
      </section>
    );
  }

  if (view === "artifacts") {
    return (
      <section className="workbench pageView artifactPage">
        <div className="artifactToolbar">
          <label className="searchField">
            <Search size={16} />
            <input value={artifactQuery} onChange={(event) => setArtifactQuery(event.target.value)} placeholder="搜索产物名称、任务或内容" />
          </label>
          <div className="filterBar">
            {(["all", "result", "log", "prompt", "report"] as Array<Artifact["kind"] | "all">).map((kind) => (
              <button className={`filterButton ${artifactKind === kind ? "active" : ""}`} key={kind} type="button" onClick={() => setArtifactKind(kind)}>
                {kind === "all" ? "全部" : kind}
              </button>
            ))}
          </div>
        </div>
        <div className="artifactGrid">
          {visibleArtifacts.length === 0 ? (
            <div className="empty">没有匹配的产物。完成任务后会自动生成结果和日志。</div>
          ) : (
            visibleArtifacts.map((artifact) => (
              <button className="artifactCard artifactButton" data-testid="artifact-card" key={artifact.id} type="button" onClick={() => openArtifact(artifact)}>
                <strong>{artifact.name}</strong>
                <span>{artifact.kind} · {formatTime(artifact.createdAt)}</span>
                <p>{artifact.taskTitle}</p>
                <small>{artifact.content.slice(0, 120) || "无内容"}</small>
              </button>
            ))
          )}
        </div>
      </section>
    );
  }

  if (view === "routines") {
    return (
      <section className="workbench pageView">
        <div className="routineLayout">
          <section className="routineGrid" aria-label="自动流程模板">
            {routineTemplates.map((routine) => (
              <button className={`routineCard ${routine.id === selectedRoutine.id ? "selected" : ""}`} key={routine.id} type="button" onClick={() => setSelectedRoutineId(routine.id)}>
                <Layers3 size={22} />
                <div>
                  <strong>{routine.name}</strong>
                  <span>{routine.description}</span>
                </div>
              </button>
            ))}
          </section>
          <section className="panel resultPanel routinePreview">
            <div className="panelTitle">
              <span>{selectedRoutine.name}</span>
              <button className="button primary compact" type="button" onClick={() => startRoutine(selectedRoutine.prompt)}>
                <Play size={15} /> 使用模板
              </button>
            </div>
            <div className="taskDetail">
              <section>
                <h3>模板说明</h3>
                <p>{selectedRoutine.description}</p>
              </section>
              <section>
                <h3>Prompt</h3>
                <pre>{selectedRoutine.prompt}</pre>
              </section>
            </div>
          </section>
        </div>
      </section>
    );
  }

  if (view === "schedules") {
    return (
      <>
        <section className="workbench pageView modulePage">
          <div className="moduleToolbar scheduleToolbar">
            <div className="moduleSummary">
              <span className="pill blue">
                <CalendarClock size={14} /> {cronJobs.length} 个定时任务
              </span>
              {cronError && <span className="pill red">{cronError}</span>}
            </div>
            <div className="moduleActions">
              <button className="button primary compact" type="button" onClick={openCronCreate}>
                <Plus size={15} /> 新增
              </button>
              <button className="button secondary compact" type="button" disabled={isLoadingCron} onClick={() => void refreshCronJobs()}>
                <RotateCcw size={15} /> {isLoadingCron ? "读取中..." : "刷新"}
              </button>
            </div>
          </div>
          <div className="moduleList">
            {cronJobs.length === 0 ? (
              <div className="moduleEmpty">
                <CalendarClock size={28} />
                <strong>{isLoadingCron ? "正在读取 Hermes 定时任务..." : "还没有定时任务"}</strong>
                <span>点击“新增”创建一个 Hermes cron 定时任务，创建后这里会显示下一次运行、状态和关联技能。</span>
              </div>
            ) : (
              cronJobs.map((job) => (
                <article className="moduleCard scheduleCard" key={job.id}>
                  <div className="moduleCardHead">
                    <div>
                      <strong>{job.name}</strong>
                      <span>{job.schedule}</span>
                    </div>
                    <span className={`pill ${job.state === "active" ? "green" : job.state === "paused" ? "amber" : "blue"}`}>
                      {job.state === "active" ? "运行中" : job.state === "paused" ? "已暂停" : "已完成"}
                    </span>
                  </div>
                  <div className="scheduleMetaGrid">
                    <div>
                      <span>下次运行</span>
                      <strong>{formatDateTime(job.nextRunAt)}</strong>
                    </div>
                    <div>
                      <span>上次运行</span>
                      <strong>{formatDateTime(job.lastRunAt)}</strong>
                    </div>
                    <div>
                      <span>投递</span>
                      <strong>{job.deliver.join(", ") || "local"}</strong>
                    </div>
                  </div>
                  <p>{job.prompt || "这个定时任务没有记录 prompt。"}</p>
                  <div className="tagRow">
                    {job.skills.length === 0 ? <span className="softTag">无技能绑定</span> : job.skills.map((skill) => <span className="softTag" key={skill}>{skill}</span>)}
                  </div>
                  <div className="cardActions">
                    <button className="button secondary compact" type="button" onClick={() => void copyModuleText(job.prompt || job.name)}>
                      <Copy size={15} /> 复制 Prompt
                    </button>
                    <button className="button secondary compact" type="button" onClick={() => void copyModuleText(job.id)}>
                      <Copy size={15} /> 复制 ID
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        {isCronCreateOpen && (
          <CronCreateModal
            draft={cronDraft}
            skillsDraft={cronSkillsDraft}
            error={cronCreateError}
            isCreating={isCreatingCron}
            onChange={(patch) => setCronDraft((current) => ({ ...current, ...patch }))}
            onSkillsChange={setCronSkillsDraft}
            onClose={() => setIsCronCreateOpen(false)}
            onSubmit={submitCronCreate}
          />
        )}
      </>
    );
  }

  if (view === "skills") {
    return (
      <section className="workbench pageView modulePage">
        <div className="moduleToolbar skillToolbar">
          <label className="searchField">
            <Search size={16} />
            <input value={skillQuery} onChange={(event) => setSkillQuery(event.target.value)} placeholder="搜索技能名称、分类或来源" />
          </label>
          <div className="filterBar">
            <button className={`filterButton ${skillSource === "all" ? "active" : ""}`} type="button" onClick={() => setSkillSource("all")}>
              全部来源
            </button>
            {skillSources.map((source) => (
              <button className={`filterButton ${skillSource === source ? "active" : ""}`} key={source} type="button" onClick={() => setSkillSource(source)}>
                {source}
              </button>
            ))}
            {skillStatuses.map((status) => (
              <button className={`filterButton ${skillStatus === status ? "active" : ""}`} key={status} type="button" onClick={() => setSkillStatus(skillStatus === status ? "all" : status)}>
                {status}
              </button>
            ))}
          </div>
          <button className="button secondary compact" type="button" disabled={isLoadingSkills} onClick={() => void refreshSkills()}>
            <RotateCcw size={15} /> {isLoadingSkills ? "读取中..." : "刷新"}
          </button>
        </div>
        <div className="moduleList skillGrid" data-testid="skills-list">
          {visibleSkills.length === 0 ? (
            <div className="moduleEmpty">
              <Puzzle size={28} />
              <strong>{isLoadingSkills ? "正在读取 Hermes 技能..." : "没有匹配的技能"}</strong>
              <span>{skillsError || `${skills.length} 个技能已读取，可调整搜索或筛选条件。`}</span>
            </div>
          ) : (
            visibleSkills.map((skill) => (
              <article className="moduleCard skillCard" key={skill.id}>
                <div className="moduleCardHead">
                  <div>
                    <strong>{skill.name}</strong>
                    <span>{skill.category || "未分类"}</span>
                  </div>
                  <span className={`pill ${skill.status === "enabled" ? "green" : "amber"}`}>{skill.status || "unknown"}</span>
                </div>
                <p>{skill.description || "这个技能没有描述信息。"}</p>
                <div className="tagRow">
                  <span className="softTag">{skill.source || "unknown"}</span>
                  <span className="softTag">{skill.trust || "unknown"}</span>
                </div>
                {skill.path && (
                  <div className="skillPath" title={skill.path}>
                    {skill.path}
                  </div>
                )}
                <div className="cardActions">
                  <button className="button secondary compact" type="button" onClick={() => void copyModuleText(skill.name)}>
                    <Copy size={15} /> 复制名称
                  </button>
                  {skill.path && (
                    <button className="button secondary compact" type="button" onClick={() => void copyModuleText(skill.path!)}>
                      <Copy size={15} /> 复制路径
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="workbench settingsView">
      <div className="settingsLayout">
        <section className="infoCard wide settingsWorkspaceCard">
          <span>当前 Workspace</span>
          <strong>{state.currentWorkspace || "尚未选择"}</strong>
          <p>{state.currentWorkspace ? "任务会以该目录作为 Hermes 的执行上下文。" : "请选择一个本地目录作为工作区。"}</p>
          <div className="cardActions">
            <button className="button primary" type="button" onClick={chooseWorkspace}>
              <FolderOpen size={16} /> 选择目录
            </button>
            {state.currentWorkspace && (
              trustedWorkspaces.includes(state.currentWorkspace) ? (
                <button className="button secondary" type="button" onClick={() => void revokeWorkspaceTrust(state.currentWorkspace!)}>
                  <X size={16} /> 取消信任
                </button>
              ) : (
                <button className="button secondary" type="button" onClick={() => void trustCurrentWorkspace()}>
                  <ShieldCheck size={16} /> 信任目录
                </button>
              )
            )}
          </div>
        </section>
        <section className="configPanel">
          <div className="panelTitle inlineTitle">模型配置</div>
          <ModelConfigFields
            providerDraft={providerDraft}
            modelDraft={modelDraft}
            baseUrlDraft={baseUrlDraft}
            apiKeyDraft={apiKeyDraft}
            apiKeyConfigured={Boolean(state.config.apiKeyConfigured)}
            apiKeyEnvVar={state.config.apiKeyEnvVar || apiKeyEnvVarForProvider(providerDraft)}
            ollamaModels={ollamaModels}
            isLoadingOllamaModels={isLoadingOllamaModels}
            ollamaModelsError={ollamaModelsError}
            setProviderDraft={setProviderDraft}
            setModelDraft={setModelDraft}
            setBaseUrlDraft={setBaseUrlDraft}
            setApiKeyDraft={setApiKeyDraft}
            applyModelPreset={applyModelPreset}
          />
          <div className="configHint">
            保存会同步写入 Hermes 本地配置和密钥文件。API Key 只在填入时更新，不会从本地回显。
          </div>
          <div className="cardActions">
            <button
              className="button primary"
              type="button"
              data-testid="sync-model-config"
              disabled={isSavingModelConfig || !providerDraft.trim() || !modelDraft.trim()}
              onClick={() => void syncModelConfig({ provider: providerDraft, model: modelDraft, baseUrl: baseUrlDraft, apiKey: apiKeyDraft })}
            >
              <Check size={16} /> {isSavingModelConfig ? "同步中..." : "保存并同步 Hermes"}
            </button>
            <button className="button secondary" type="button" disabled={isCheckingHermes} onClick={() => void checkHermes()}>
              <Activity size={16} /> 读取当前 Hermes 配置
            </button>
          </div>
        </section>
        <section className="pageGrid">
          <div className="infoCard">
            <span>当前 Provider</span>
            <strong>{state.config.provider || "Unknown"}</strong>
            <p>Hermes 配置中的 model.provider。</p>
          </div>
          <div className="infoCard">
            <span>当前 Model</span>
            <strong>{state.config.model || "default"}</strong>
            <p>Hermes 配置中的 model.default。</p>
          </div>
          <div className="infoCard wide">
            <span>当前 Base URL</span>
            <strong>{state.config.baseUrl || "未配置"}</strong>
            <p>Hermes 配置中的 model.base_url。</p>
          </div>
          <div className="infoCard wide">
            <span>API Key</span>
            <strong>{state.config.apiKeyConfigured ? "已配置" : "未配置"}</strong>
            <p>{apiKeyEnvVarForProvider(providerDraft || state.config.provider || "")}，密钥保存在 Hermes 的 .env 中。</p>
          </div>
        </section>
        <section className="settingsPage">
          <label className="field">
            <span>Hermes Path</span>
            <input value={pathDraft} onBlur={() => void saveHermesPath()} onChange={(event) => setPathDraft(event.target.value)} />
          </label>
          <button className="button secondary" type="button" onClick={() => void saveHermesPath()}>
            <Check size={16} /> 保存路径
          </button>
          <button
            className="button primary"
            type="button"
            data-testid="settings-check-hermes"
            disabled={isCheckingHermes}
            onClick={() => void checkHermes()}
          >
            <Activity size={16} /> {isCheckingHermes ? "检测中..." : "检测连接"}
          </button>
        </section>
        <section className="infoCard wide">
          <span>状态</span>
          <strong>{checkResult?.ok ? "Hermes 连接正常" : checkResult ? "Hermes 检测失败" : "尚未检测"}</strong>
          <p>{checkResult?.ok ? `最后检测：${lastCheckedAt ? formatTime(lastCheckedAt) : "刚刚"}` : checkResult?.message || statusMessage}</p>
        </section>
        <section className="listPanel">
          <div className="panelTitle inlineTitle">信任的 Workspace</div>
          {trustedWorkspaces.length === 0 ? (
            <div className="empty">还没有信任目录。可以在工作台或工作区页信任当前目录。</div>
          ) : (
            trustedWorkspaces.map((workspace) => (
              <div className="trustedRow" key={workspace}>
                <div>
                  <strong>{workspace.split("/").at(-1) || workspace}</strong>
                  <span>{workspace}</span>
                </div>
                <button className="button secondary compact" type="button" onClick={() => void revokeWorkspaceTrust(workspace)}>
                  <X size={15} /> 取消信任
                </button>
              </div>
            ))
          )}
        </section>
      </div>
    </section>
  );
}

function ModelConfigFields({
  providerDraft,
  modelDraft,
  baseUrlDraft,
  apiKeyDraft,
  apiKeyConfigured,
  apiKeyEnvVar,
  ollamaModels,
  isLoadingOllamaModels,
  ollamaModelsError,
  setProviderDraft,
  setModelDraft,
  setBaseUrlDraft,
  setApiKeyDraft,
  applyModelPreset
}: {
  providerDraft: string;
  modelDraft: string;
  baseUrlDraft: string;
  apiKeyDraft: string;
  apiKeyConfigured: boolean;
  apiKeyEnvVar: string;
  ollamaModels: string[];
  isLoadingOllamaModels: boolean;
  ollamaModelsError: string;
  setProviderDraft: (value: string) => void;
  setModelDraft: (value: string) => void;
  setBaseUrlDraft: (value: string) => void;
  setApiKeyDraft: (value: string) => void;
  applyModelPreset: (provider: string) => void;
}): JSX.Element {
  const selectedPreset = modelPresets.find((preset) => preset.provider.toLowerCase() === providerDraft.toLowerCase());
  const providerSelectValue = selectedPreset && providerDraft !== "Custom" ? selectedPreset.provider : "Custom";
  const isOllama = isOllamaProvider(providerSelectValue);
  const modelOptions = isOllama && ollamaModels.length > 0 ? ollamaModels : selectedPreset?.models ?? [];
  const effectiveApiKeyEnvVar = apiKeyEnvVarForProvider(providerSelectValue === "Custom" ? providerDraft : providerSelectValue);
  const hasMatchingApiKey = apiKeyConfigured && apiKeyEnvVar === effectiveApiKeyEnvVar;

  return (
    <div className="modelConfigGrid">
      <label className="field">
        <span>Provider</span>
        <select value={providerSelectValue} onChange={(event) => applyModelPreset(event.target.value)}>
          {modelPresets.map((preset) => (
            <option key={preset.provider} value={preset.provider}>
              {preset.provider}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Model</span>
        {isOllama && modelOptions.length > 0 ? (
          <select value={modelDraft && modelOptions.includes(modelDraft) ? modelDraft : modelOptions[0]} onChange={(event) => setModelDraft(event.target.value)}>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              list="hermes-model-options"
              value={modelDraft}
              onChange={(event) => setModelDraft(event.target.value)}
              placeholder={isLoadingOllamaModels ? "正在读取本机 Ollama 模型..." : modelOptions[0] || "输入模型名"}
            />
            <datalist id="hermes-model-options">
              {modelOptions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </>
        )}
        {isOllama && (
          <small className={ollamaModelsError ? "fieldNote warnText" : "fieldNote"}>
            {isLoadingOllamaModels ? "正在从本机 Ollama 读取模型..." : ollamaModelsError || `已读取 ${ollamaModels.length} 个本机模型`}
          </small>
        )}
      </label>
      <label className="field wideField">
        <span>Base URL</span>
        <input value={baseUrlDraft} onChange={(event) => setBaseUrlDraft(event.target.value)} placeholder="https://api.example.com/v1" />
      </label>
      <label className="field wideField">
        <span>API Key</span>
        <input
          type="password"
          value={apiKeyDraft}
          onChange={(event) => setApiKeyDraft(event.target.value)}
          placeholder={isOllama ? "本机 Ollama 通常不需要 API Key" : hasMatchingApiKey ? `${effectiveApiKeyEnvVar} 已配置，留空则不修改` : `写入 ${effectiveApiKeyEnvVar}`}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {providerSelectValue === "Custom" && (
        <label className="field">
          <span>Custom Provider</span>
          <input value={providerDraft} onChange={(event) => setProviderDraft(event.target.value)} placeholder="provider name" />
        </label>
      )}
    </div>
  );
}

function CronCreateModal({
  draft,
  skillsDraft,
  error,
  isCreating,
  onChange,
  onSkillsChange,
  onClose,
  onSubmit
}: {
  draft: CreateCronJobInput;
  skillsDraft: string;
  error: string;
  isCreating: boolean;
  onChange: (patch: Partial<CreateCronJobInput>) => void;
  onSkillsChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
}): JSX.Element {
  const canSubmit = Boolean(draft.schedule.trim() && (draft.prompt.trim() || draft.script?.trim()));

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="cronModal" role="dialog" aria-modal="true" aria-labelledby="cron-create-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modalHeader">
          <div>
            <h2 id="cron-create-title">新增定时任务</h2>
            <p>创建后会写入 Hermes Agent cron，并出现在定时任务列表。</p>
          </div>
          <button className="iconButton" aria-label="关闭新增定时任务" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="cronModalBody">
          <div className="cronFormGrid">
            <label className="field">
              <span>名称</span>
              <input value={draft.name || ""} onChange={(event) => onChange({ name: event.target.value })} placeholder="每日巡检" />
            </label>
            <label className="field">
              <span>定时规则</span>
              <input value={draft.schedule} onChange={(event) => onChange({ schedule: event.target.value })} placeholder="30m / every 2h / 0 9 * * *" />
            </label>
            <label className="field">
              <span>投递</span>
              <select value={draft.deliver || "local"} onChange={(event) => onChange({ deliver: event.target.value })}>
                <option value="local">local</option>
                <option value="origin">origin</option>
                <option value="telegram">telegram</option>
                <option value="discord">discord</option>
                <option value="signal">signal</option>
              </select>
            </label>
            <label className="field">
              <span>重复次数</span>
              <input value={draft.repeat || ""} onChange={(event) => onChange({ repeat: event.target.value })} placeholder="留空表示持续运行" />
            </label>
            <label className="field wideField">
              <span>工作目录</span>
              <input value={draft.workdir || ""} onChange={(event) => onChange({ workdir: event.target.value })} placeholder="/Users/fengyue/Desktop/project" />
            </label>
            <label className="field wideField">
              <span>技能</span>
              <input value={skillsDraft} onChange={(event) => onSkillsChange(event.target.value)} placeholder="codebase-inspection, github-code-review" />
            </label>
            <label className="field wideField">
              <span>Prompt</span>
              <textarea className="modalTextarea" value={draft.prompt} onChange={(event) => onChange({ prompt: event.target.value })} rows={5} placeholder="写下定时执行的任务内容" />
            </label>
            <label className="field wideField">
              <span>脚本</span>
              <input value={draft.script || ""} onChange={(event) => onChange({ script: event.target.value })} placeholder="~/.hermes/scripts/check.py" />
            </label>
            <label className="checkRow wideField">
              <input type="checkbox" checked={Boolean(draft.noAgent)} onChange={(event) => onChange({ noAgent: event.target.checked })} />
              <span>仅运行脚本，不调用 Agent</span>
            </label>
          </div>
          {error && <div className="errorBox">{error}</div>}
        </div>
        <footer className="modalFooter">
          <button className="button secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="button primary" type="button" disabled={isCreating || !canSubmit} onClick={() => void onSubmit()}>
            <Check size={16} /> {isCreating ? "创建中..." : "创建任务"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ModelConfigModal({
  providerDraft,
  modelDraft,
  baseUrlDraft,
  apiKeyDraft,
  ollamaModels,
  isLoadingOllamaModels,
  ollamaModelsError,
  setProviderDraft,
  setModelDraft,
  setBaseUrlDraft,
  setApiKeyDraft,
  applyModelPreset,
  isSavingModelConfig,
  syncModelConfig,
  onClose
}: {
  providerDraft: string;
  modelDraft: string;
  baseUrlDraft: string;
  apiKeyDraft: string;
  ollamaModels: string[];
  isLoadingOllamaModels: boolean;
  ollamaModelsError: string;
  setProviderDraft: (value: string) => void;
  setModelDraft: (value: string) => void;
  setBaseUrlDraft: (value: string) => void;
  setApiKeyDraft: (value: string) => void;
  applyModelPreset: (provider: string) => void;
  isSavingModelConfig: boolean;
  syncModelConfig: (config: ModelConfigInput) => Promise<void>;
  onClose: () => void;
}): JSX.Element {
  async function save(): Promise<void> {
    await syncModelConfig({ provider: providerDraft, model: modelDraft, baseUrl: baseUrlDraft, apiKey: apiKeyDraft });
    onClose();
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="modelModal" role="dialog" aria-modal="true" aria-labelledby="model-config-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modalHeader">
          <div>
            <h2 id="model-config-title">模型配置</h2>
            <p>选择预设或填写任意兼容 Hermes 的 Provider、Model 和 Base URL。</p>
          </div>
          <button className="iconButton" aria-label="关闭模型配置" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modelModalBody">
          <ModelConfigFields
            providerDraft={providerDraft}
            modelDraft={modelDraft}
            baseUrlDraft={baseUrlDraft}
            apiKeyDraft={apiKeyDraft}
            apiKeyConfigured={false}
            apiKeyEnvVar={apiKeyEnvVarForProvider(providerDraft)}
            ollamaModels={ollamaModels}
            isLoadingOllamaModels={isLoadingOllamaModels}
            ollamaModelsError={ollamaModelsError}
            setProviderDraft={setProviderDraft}
            setModelDraft={setModelDraft}
            setBaseUrlDraft={setBaseUrlDraft}
            setApiKeyDraft={setApiKeyDraft}
            applyModelPreset={applyModelPreset}
          />
        </div>
        <footer className="modalFooter">
          <button className="button secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="button primary" type="button" disabled={isSavingModelConfig || !providerDraft.trim() || !modelDraft.trim()} onClick={() => void save()}>
            <Check size={16} /> {isSavingModelConfig ? "保存中..." : "保存并同步"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ArtifactModal({
  artifact,
  onClose,
  onCopied
}: {
  artifact: ArtifactPreview;
  onClose: () => void;
  onCopied: () => void;
}): JSX.Element {
  async function copyContent(): Promise<void> {
    await navigator.clipboard.writeText(artifact.content);
    onCopied();
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="artifactModal" role="dialog" aria-modal="true" aria-labelledby="artifact-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modalHeader">
          <div>
            <h2 id="artifact-title">产物详情</h2>
            <p>{artifact.taskTitle} · {artifact.kind} · {formatTime(artifact.createdAt)}</p>
          </div>
          <button className="iconButton" aria-label="关闭产物详情" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="artifactMeta">
          <strong>{artifact.name}</strong>
        </div>
        <pre className="artifactContent">{artifact.content || "这个产物没有文本内容。"}</pre>
        <footer className="modalFooter">
          <button className="button secondary" type="button" onClick={() => void copyContent()}>
            <Check size={16} /> 复制内容
          </button>
          <button className="button primary" type="button" onClick={onClose}>
            关闭
          </button>
        </footer>
      </section>
    </div>
  );
}
