import "./env-setup.js";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  RunFlowOptions,
  RunFlowVariableValue,
  StudioExecutionProgressEvent,
} from "../src/shared/studio-api-types.js";
import {
  isSensitiveVariableName,
  REDACTED_SENSITIVE_VALUE,
} from "../src/shared/sensitive-variables.js";
import { IPC_CHANNELS } from "./ipc-channels.js";
import {
  startLocalKnowledgeApiService,
  type LocalKnowledgeApiService,
} from "./local-api-service.js";
import {
  createProject,
  getExecution,
  getFlow,
  getFlowRunInput,
  getFlowVersion,
  getProjectKnowledgeRepository,
  listExecutions,
  listFlows,
  listFlowVersions,
  listProjects,
  renameFlow,
  restoreFlowVersion,
  runFlow,
} from "./services.js";

let mainWindow: BrowserWindow | null = null;
let localKnowledgeApiService: LocalKnowledgeApiService | null = null;
const activeExecutions = new Map<string, AbortController>();
const cancelledExecutionIds = new Set<string>();
const RUN_FLOW_OPTION_KEYS = new Set([
  "showBrowser",
  "environmentName",
  "baseUrl",
  "storageStatePath",
  "variables",
]);

function assertNonEmptyId(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) {
    throw new Error(`${name} 无效`);
  }
}

function normalizeOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length > 1_000_000) {
    throw new Error(`${name} 无效`);
  }
  return value;
}

function normalizeVariables(value: unknown): Record<string, RunFlowVariableValue> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error("variables 无效");
  }
  const entries = Object.entries(value);
  if (entries.length > 100) {
    throw new Error("variables 数量超限");
  }
  const normalized: Record<string, RunFlowVariableValue> = {};
  for (const [name, item] of entries) {
    if (!name || name.length > 128) {
      throw new Error("variables 名称无效");
    }
    if (
      (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") ||
      (typeof item === "string" && item.length > 1_000_000) ||
      (typeof item === "number" && !Number.isFinite(item))
    ) {
      throw new Error(`variables.${name} 无效`);
    }
    normalized[name] = item;
  }
  return normalized;
}

function normalizeRunFlowOptions(value: unknown): RunFlowOptions {
  if (value === undefined) {
    return { showBrowser: true };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("运行参数无效");
  }
  const record = value as Record<string, unknown>;
  const unsupported = Object.keys(record).filter((key) => !RUN_FLOW_OPTION_KEYS.has(key));
  if (unsupported.length > 0) {
    throw new Error("运行参数包含不支持的字段");
  }
  if (record.showBrowser !== undefined && typeof record.showBrowser !== "boolean") {
    throw new Error("showBrowser 无效");
  }
  return {
    showBrowser: record.showBrowser !== false,
    environmentName: normalizeOptionalString(record.environmentName, "environmentName"),
    baseUrl: normalizeOptionalString(record.baseUrl, "baseUrl"),
    storageStatePath: normalizeOptionalString(record.storageStatePath, "storageStatePath"),
    variables: normalizeVariables(record.variables),
  };
}

function rememberCancelledExecution(executionId: string): void {
  cancelledExecutionIds.add(executionId);
  if (cancelledExecutionIds.size > 1_000) {
    const oldest = cancelledExecutionIds.values().next().value as string | undefined;
    if (oldest) {
      cancelledExecutionIds.delete(oldest);
    }
  }
}

function buildRendererSafeRunError(
  error: unknown,
  variables?: Record<string, RunFlowVariableValue>,
): Error {
  let message = error instanceof Error ? error.message : "运行未完成，请检查运行环境和任务配置。";
  for (const [name, value] of Object.entries(variables ?? {})) {
    if (!isSensitiveVariableName(name)) {
      continue;
    }
    const text = String(value);
    if (text) {
      message = message.split(text).join(REDACTED_SENSITIVE_VALUE);
    }
  }
  message = message
    .split("\n")
    .filter((line) => !/^\s*at\s/.test(line))
    .join("\n")
    .slice(0, 2_000);
  const safeError = new Error(message || "运行未完成，请检查运行环境和任务配置。");
  safeError.stack = undefined;
  return safeError;
}

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
    async (_event, projectId: string, flowId?: string, options?: RunFlowOptions) => {
      assertNonEmptyId(projectId, "projectId");
      if (flowId !== undefined) {
        assertNonEmptyId(flowId, "flowId");
      }
      const normalizedOptions = normalizeRunFlowOptions(options);
      const executionId = randomUUID();
      const controller = new AbortController();
      activeExecutions.set(executionId, controller);
      try {
        const record = await runFlow(projectId, flowId, {
          ...normalizedOptions,
          executionId,
          signal: controller.signal,
          onProgress: (progress: StudioExecutionProgressEvent) => {
            if (progress.executionId !== executionId) {
              return;
            }
            if (typeof _event.sender.isDestroyed !== "function" || !_event.sender.isDestroyed()) {
              _event.sender.send(IPC_CHANNELS.executionProgress, progress);
            }
          },
        });
        return {
          executionId: record.executionId,
          status: record.status,
        };
      } catch (error) {
        throw buildRendererSafeRunError(error, normalizedOptions.variables);
      } finally {
        activeExecutions.delete(executionId);
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.cancelExecution, async (_event, executionId: string) => {
    assertNonEmptyId(executionId, "executionId");
    const controller = activeExecutions.get(executionId);
    if (!controller) {
      return {
        accepted: cancelledExecutionIds.has(executionId),
        alreadyCancelled: cancelledExecutionIds.has(executionId),
      };
    }
    const alreadyCancelled = controller.signal.aborted;
    if (!alreadyCancelled) {
      controller.abort();
      rememberCancelledExecution(executionId);
    }
    return { accepted: true, alreadyCancelled };
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

app.whenReady().then(async () => {
  registerIpcHandlers();
  try {
    localKnowledgeApiService = await startLocalKnowledgeApiService({
      repo: getProjectKnowledgeRepository(),
    });
  } catch (error: unknown) {
    console.error("织流本地同步服务启动失败：", error);
  }
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", () => {
  for (const [executionId, controller] of activeExecutions) {
    if (!controller.signal.aborted) {
      controller.abort();
      rememberCancelledExecution(executionId);
    }
  }
  const service = localKnowledgeApiService;
  localKnowledgeApiService = null;
  void service?.close().catch((error: unknown) => {
    console.error("织流本地同步服务关闭失败：", error);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
