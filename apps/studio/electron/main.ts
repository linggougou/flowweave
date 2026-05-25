import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { IPC_CHANNELS } from "./ipc-channels.js";
import { getExecution, listProjects, runFlow } from "./services.js";

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.listProjects, () => listProjects());

  ipcMain.handle(IPC_CHANNELS.runFlow, async (_event, projectId: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    const record = await runFlow(projectId);
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
