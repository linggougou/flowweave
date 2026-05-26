import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./ipc-channels.js";
import type { RunFlowOptions, StudioApi } from "../src/shared/studio-api-types.js";

const studioApi: StudioApi = {
  listProjects: () => ipcRenderer.invoke(IPC_CHANNELS.listProjects),
  listFlows: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.listFlows, projectId),
  runFlow: (projectId: string, flowId?: string, options?: RunFlowOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.runFlow, projectId, flowId, options),
  getExecution: (executionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getExecution, executionId),
  listExecutions: (projectId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.listExecutions, projectId),
  listFlowVersions: (projectId: string, flowId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.listFlowVersions, projectId, flowId),
  getFlowVersion: (projectId: string, versionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFlowVersion, projectId, versionId),
  restoreFlowVersion: (projectId: string, versionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.restoreFlowVersion, projectId, versionId),
  openPath: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.openPath, filePath),
};

contextBridge.exposeInMainWorld("flowweaveStudio", studioApi);
