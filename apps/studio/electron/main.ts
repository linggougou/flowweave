import "./env-setup.js";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import type { RunFlowOptions } from "../src/shared/studio-api-types.js";
import { IPC_CHANNELS } from "./ipc-channels.js";
import {
  createProject,
  getExecution,
  getFlow,
  getFlowRunInput,
  getFlowVersion,
  listExecutions,
  listFlows,
  listFlowVersions,
  listProjects,
  renameFlow,
  restoreFlowVersion,
  runFlow,
} from "./services.js";

let mainWindow: BrowserWindow | null = null;

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.listProjects, () => listProjects());

  ipcMain.handle(IPC_CHANNELS.createProject, (_event, name: string) => {
    if (typeof name !== "string") {
      throw new Error("项目名称无效");
    }
    return createProject(name);
  });
  ipcMain.handle(IPC_CHANNELS.listFlows, (_event, projectId: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    return listFlows(projectId);
  });

  ipcMain.handle(
    IPC_CHANNELS.renameFlow,
    (_event, projectId: string, flowId: string, name: string) => {
      if (typeof projectId !== "string" || projectId.length === 0) {
        throw new Error("projectId 无效");
      }
      if (typeof flowId !== "string" || flowId.length === 0) {
        throw new Error("flowId 无效");
      }
      if (typeof name !== "string") {
        throw new Error("name 无效");
      }
      return renameFlow(projectId, flowId, name);
    },
  );

  ipcMain.handle(IPC_CHANNELS.getFlow, (_event, projectId: string, flowId: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    if (typeof flowId !== "string" || flowId.length === 0) {
      throw new Error("flowId 无效");
    }
    return getFlow(projectId, flowId);
  });

  ipcMain.handle(IPC_CHANNELS.getFlowRunInput, (_event, projectId: string, flowId: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    if (typeof flowId !== "string" || flowId.length === 0) {
      throw new Error("flowId 无效");
    }
    return getFlowRunInput(projectId, flowId);
  });

  ipcMain.handle(
    IPC_CHANNELS.runFlow,
    async (
      _event,
      projectId: string,
      flowId?: string,
      options?: RunFlowOptions,
    ) => {
      if (typeof projectId !== "string" || projectId.length === 0) {
        throw new Error("projectId 无效");
      }
      if (flowId !== undefined && (typeof flowId !== "string" || flowId.length === 0)) {
        throw new Error("flowId 无效");
      }
      const normalizedOptions: RunFlowOptions = {
        showBrowser:
          options && typeof options === "object" && options.showBrowser === false
            ? false
            : true,
        environmentName:
          options && typeof options === "object" ? options.environmentName : undefined,
        baseUrl: options && typeof options === "object" ? options.baseUrl : undefined,
        storageStatePath:
          options && typeof options === "object" ? options.storageStatePath : undefined,
        variables: options && typeof options === "object" ? options.variables : undefined,
      };
      const record = await runFlow(projectId, flowId, normalizedOptions);
      return {
        executionId: record.executionId,
        status: record.status,
      };
    },
  );

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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  mainWindow = new BrowserWindow({
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
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
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
