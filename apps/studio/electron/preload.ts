import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./ipc-channels.js";
import type { StudioApi } from "../src/shared/studio-api-types.js";

const studioApi: StudioApi = {
  listProjects: () => ipcRenderer.invoke(IPC_CHANNELS.listProjects),
  runFlow: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.runFlow, projectId),
  getExecution: (executionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getExecution, executionId),
  listExecutions: (projectId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.listExecutions, projectId),
};

contextBridge.exposeInMainWorld("flowweaveStudio", studioApi);
