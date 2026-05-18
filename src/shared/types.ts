export type TaskStatus =
  | "queued"
  | "running"
  | "needs_permission"
  | "completed"
  | "failed"
  | "cancelled";

export type TimelineTone = "done" | "active" | "waiting" | "failed";

export type TaskEvent = {
  id: string;
  title: string;
  detail: string;
  tone: TimelineTone;
  at: string;
};

export type Artifact = {
  id: string;
  name: string;
  kind: "result" | "log" | "prompt" | "report";
  content: string;
  createdAt: string;
};

export type TaskAttachment = {
  id: string;
  name: string;
  path: string;
  kind: "image" | "file" | "directory";
  mimeType: string;
  size: number;
};

export type PastedImageInput = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type Task = {
  id: string;
  title: string;
  prompt: string;
  workspacePath: string | null;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
  model?: string;
  provider?: string;
  logs: string[];
  result?: string;
  error?: string;
  timeline: TaskEvent[];
  artifacts: Artifact[];
  attachments?: TaskAttachment[];
};

export type AppConfig = {
  hermesPath: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKeyConfigured?: boolean;
  apiKeyEnvVar?: string;
  trustedWorkspaces?: string[];
  recentWorkspaces?: string[];
};

export type ModelConfigInput = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
};

export type AppState = {
  config: AppConfig;
  currentWorkspace: string | null;
  tasks: Task[];
};

export type HermesCronJob = {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  state: "active" | "paused" | "completed";
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  repeat: { times: number | null; completed: number } | null;
  deliver: string[];
  skills: string[];
  script: string | null;
};

export type HermesSkill = {
  id: string;
  name: string;
  category: string;
  source: string;
  trust: string;
  status: string;
  description: string;
  path?: string;
};

export type CreateCronJobInput = {
  schedule: string;
  prompt: string;
  name?: string;
  deliver?: string;
  repeat?: string;
  skills?: string[];
  script?: string;
  noAgent?: boolean;
  workdir?: string;
};

export type RunTaskInput = {
  prompt: string;
  workspacePath: string | null;
  attachments?: TaskAttachment[];
};

export type HermesCheckResult = {
  ok: boolean;
  message: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKeyConfigured?: boolean;
  apiKeyEnvVar?: string;
};

export type DesktopApi = {
  getState: () => Promise<AppState>;
  chooseWorkspace: () => Promise<AppState>;
  chooseImages: () => Promise<TaskAttachment[]>;
  chooseFiles: () => Promise<TaskAttachment[]>;
  chooseFolders: () => Promise<TaskAttachment[]>;
  savePastedImage: (input: PastedImageInput) => Promise<TaskAttachment>;
  revealPath: (targetPath: string) => Promise<void>;
  setWorkspace: (workspacePath: string) => Promise<AppState>;
  updateConfig: (config: Partial<AppConfig>) => Promise<AppState>;
  syncHermesModelConfig: (config: ModelConfigInput) => Promise<AppState>;
  checkHermes: () => Promise<HermesCheckResult>;
  listOllamaModels: (baseUrl?: string) => Promise<string[]>;
  listCronJobs: () => Promise<HermesCronJob[]>;
  createCronJob: (input: CreateCronJobInput) => Promise<HermesCronJob[]>;
  listSkills: () => Promise<HermesSkill[]>;
  runTask: (input: RunTaskInput) => Promise<Task>;
  cancelTask: (taskId: string) => Promise<Task | null>;
  onTaskUpdated: (callback: (task: Task) => void) => () => void;
};
