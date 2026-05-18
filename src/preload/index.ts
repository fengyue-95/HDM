import { contextBridge, ipcRenderer } from "electron";
import type { AppConfig, CreateCronJobInput, DesktopApi, ModelConfigInput, PastedImageInput, RunTaskInput, Task } from "../shared/types";

const api: DesktopApi = {
  getState: () => ipcRenderer.invoke("app:get-state"),
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  chooseImages: () => ipcRenderer.invoke("images:choose"),
  chooseFiles: () => ipcRenderer.invoke("files:choose"),
  chooseFolders: () => ipcRenderer.invoke("folders:choose"),
  savePastedImage: (input: PastedImageInput) => ipcRenderer.invoke("images:save-pasted", input),
  revealPath: (targetPath: string) => ipcRenderer.invoke("path:reveal", targetPath),
  setWorkspace: (workspacePath: string) => ipcRenderer.invoke("workspace:set", workspacePath),
  updateConfig: (config: Partial<AppConfig>) => ipcRenderer.invoke("config:update", config),
  syncHermesModelConfig: (config: ModelConfigInput) => ipcRenderer.invoke("hermes:sync-model-config", config),
  checkHermes: () => ipcRenderer.invoke("hermes:check"),
  listOllamaModels: (baseUrl?: string) => ipcRenderer.invoke("ollama:models", baseUrl),
  listCronJobs: () => ipcRenderer.invoke("hermes:cron:list"),
  createCronJob: (input: CreateCronJobInput) => ipcRenderer.invoke("hermes:cron:create", input),
  listSkills: () => ipcRenderer.invoke("hermes:skills:list"),
  runTask: (input: RunTaskInput) => ipcRenderer.invoke("task:run", input),
  cancelTask: (taskId: string) => ipcRenderer.invoke("task:cancel", taskId),
  onTaskUpdated: (callback: (task: Task) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, task: Task) => callback(task);
    ipcRenderer.on("task:updated", listener);
    return () => ipcRenderer.removeListener("task:updated", listener);
  }
};

contextBridge.exposeInMainWorld("hermesDesktop", api);
