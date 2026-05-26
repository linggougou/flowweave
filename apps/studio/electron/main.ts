import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { IPC_CHANNELS } from "./ipc-channels.js";
import {
  getExecution,
  getFlowVersion,
  listExecutions,
  listFlows,
  listFlowVersions,
  listProjects,
  restoreFlowVersion,
  runFlow,
} from "./services.js";

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.listProjects, () => listProjects());
  ipcMain.handle(IPC_CHANNELS.listFlows, (_event, projectId: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    return listFlows(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.runFlow, async (_event, projectId: string, flowId?: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    if (flowId !== undefined && (typeof flowId !== "string" || flowId.length === 0)) {
      throw new Error("flowId 无效");
    }
    const record = await runFlow(projectId, flowId);
    return {
      executionId: record.executionId,
      status: record.status,
    };
  });

  ipcMain.handle(IPC_CHANNELS.getExecution, (_event, executionId: string) => {
    if (typeof executionId !== "string" || executionId.length === 0) {
      throw new Error("executionId 无效");
    }
    return getExecution(executionId);
  });

  ipcMain.handle(IPC_CHANNELS.listExecutions, (_event, projectId: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    return listExecutions(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.listFlowVersions, (_event, projectId: string, flowId: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    if (typeof flowId !== "string" || flowId.length === 0) {
      throw new Error("flowId 无效");
    }
    return listFlowVersions(projectId, flowId);
  });

  ipcMain.handle(IPC_CHANNELS.getFlowVersion, (_event, projectId: string, versionId: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    if (typeof versionId !== "string" || versionId.length === 0) {
      throw new Error("versionId 无效");
    }
    return getFlowVersion(projectId, versionId);
  });

  ipcMain.handle(
    IPC_CHANNELS.restoreFlowVersion,
    (_event, projectId: string, versionId: string) => {
      if (typeof projectId !== "string" || projectId.length === 0) {
        throw new Error("projectId 无效");
      }
      if (typeof versionId !== "string" || versionId.length === 0) {
        throw new Error("versionId 无效");
      }
      return restoreFlowVersion(projectId, versionId);
    },
  );

  ipcMain.handle(IPC_CHANNELS.openPath, async (_event, filePath: string) => {
    if (typeof filePath !== "string" || filePath.length === 0) {
      throw new Error("路径无效");
    }
    const result = await shell.openPath(filePath);
    if (result) {
      throw new Error(result);
    }
    return { ok: true };
  });
}

async function createWindow(): Promise<void> {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "织流 Studio",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist-electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (devServerUrl) {
    await win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
