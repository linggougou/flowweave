import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./ipc-channels.js";
import type {
  RunFlowOptions,
  StudioApi,
  StudioExecutionProgressEvent,
} from "../src/shared/studio-api-types.js";

const studioApi: StudioApi = {
  listProjects: () => ipcRenderer.invoke(IPC_CHANNELS.listProjects),
  createProject: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.createProject, name),
  listFlows: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.listFlows, projectId),
  renameFlow: (projectId: string, flowId: string, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.renameFlow, projectId, flowId, name),
  getFlow: (projectId: string, flowId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFlow, projectId, flowId),
  getFlowRunInput: (projectId: string, flowId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFlowRunInput, projectId, flowId),
  runFlow: (projectId: string, flowId?: string, options?: RunFlowOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.runFlow, projectId, flowId, options),
  cancelExecution: (executionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelExecution, executionId),
  onExecutionProgress: (listener: (event: StudioExecutionProgressEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: StudioExecutionProgressEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.executionProgress, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.executionProgress, wrapped);
    };
  },
  getExecution: (executionId: string) => ipcRenderer.invoke(IPC_CHANNELS.getExecution, executionId),
  listExecutions: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.listExecutions, projectId),
  listFlowVersions: (projectId: string, flowId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.listFlowVersions, projectId, flowId),
  getFlowVersion: (projectId: string, versionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFlowVersion, projectId, versionId),
  restoreFlowVersion: (projectId: string, versionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.restoreFlowVersion, projectId, versionId),
  openPath: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.openPath, filePath),
};

contextBridge.exposeInMainWorld("flowweaveStudio", studioApi);
