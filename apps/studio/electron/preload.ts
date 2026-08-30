import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./ipc-channels.js";
import type {
  RunFlowOptions,
  StudioApi,
  StudioExecutionProgressEvent,
} from "../src/shared/studio-api-types.js";

const studioApi: StudioApi = {
  nativeFilePortability: true,
  nativeExecutionDeletion: true,
  nativeExecutionScreenshotPreview: true,
  listProjects: () => ipcRenderer.invoke(IPC_CHANNELS.listProjects),
  createProject: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.createProject, name),
  listFlows: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.listFlows, projectId),
  renameFlow: (projectId: string, flowId: string, name: string, expectedRevision: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.renameFlow, projectId, flowId, name, expectedRevision),
  getFlow: (projectId: string, flowId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFlow, projectId, flowId),
  importFlowFile: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.importFlowFile, projectId),
  exportFlowFile: (projectId: string, flowId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportFlowFile, projectId, flowId),
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
  getExecutionScreenshotPreview: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.getExecutionScreenshotPreview, request),
  listExecutions: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.listExecutions, projectId),
  deleteExecution: (projectId: string, executionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteExecution, projectId, executionId),
  listFlowVersions: (projectId: string, flowId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.listFlowVersions, projectId, flowId),
  getFlowVersion: (projectId: string, flowId: string, versionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFlowVersion, projectId, flowId, versionId),
  restoreFlowVersion: (
    projectId: string,
    flowId: string,
    versionId: string,
    expectedRevision: number,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.restoreFlowVersion,
      projectId,
      flowId,
      versionId,
      expectedRevision,
    ),
};

contextBridge.exposeInMainWorld("flowweaveStudio", studioApi);
