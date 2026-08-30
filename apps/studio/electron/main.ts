import "./env-setup.js";
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  RunFlowOptions,
  RunFlowVariableValue,
  StudioExecutionScreenshotPreviewRequest,
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
  assertProjectExistsForFileOperation,
  createProject,
  deleteExecution,
  getExecution,
  getExecutionScreenshotPreview,
  getFlow,
  getFlowForExport,
  getFlowRunInput,
  getFlowVersion,
  getProjectKnowledgeRepository,
  importFlowDocument,
  listExecutions,
  listFlows,
  listFlowVersions,
  listProjects,
  renameFlow,
  restoreFlowVersion,
  runFlow,
} from "./services.js";
import { exportFlowToFile, importFlowFromFile } from "./flow-portability-files.js";

let mainWindow: BrowserWindow | null = null;
let localKnowledgeApiService: LocalKnowledgeApiService | null = null;
type ActiveExecution = {
  controller: AbortController;
  completion: Promise<void>;
  complete: () => void;
};

function createActiveExecution(): ActiveExecution {
  let complete: () => void = () => undefined;
  const completion = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return {
    controller: new AbortController(),
    completion,
    complete,
  };
}

const activeExecutions = new Map<string, ActiveExecution>();
const cancelledExecutionIds = new Set<string>();
let shutdownPromise: Promise<void> | null = null;
let allowFinalQuit = false;
let allowedRendererDocumentUrl: string | null = null;
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

function assertResourceId(value: unknown, name: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value)
  ) {
    throw new Error(`${name} 无效`);
  }
}

const SCREENSHOT_PREVIEW_REQUEST_KEYS = new Set(["projectId", "executionId", "stepIndex"]);

function normalizeScreenshotPreviewRequest(
  value: unknown,
): StudioExecutionScreenshotPreviewRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("截图预览请求无效");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("截图预览请求无效");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== SCREENSHOT_PREVIEW_REQUEST_KEYS.size ||
    keys.some((key) => !SCREENSHOT_PREVIEW_REQUEST_KEYS.has(key)) ||
    keys.some((key) => descriptors[key]?.get || descriptors[key]?.set)
  ) {
    throw new Error("截图预览请求包含不支持的字段");
  }
  const record = value as Record<string, unknown>;
  assertResourceId(record.projectId, "projectId");
  assertResourceId(record.executionId, "executionId");
  if (
    !Number.isSafeInteger(record.stepIndex) ||
    (record.stepIndex as number) < 0 ||
    (record.stepIndex as number) > 1_000_000
  ) {
    throw new Error("stepIndex 无效");
  }
  return {
    projectId: record.projectId,
    executionId: record.executionId,
    stepIndex: record.stepIndex as number,
  };
}

function buildRendererSafeScreenshotPreviewError(): Error {
  const safeError = new Error("截图预览不可用，请确认运行记录仍存在且产物未被修改。");
  safeError.stack = undefined;
  return safeError;
}

function assertTrustedMainFrame(event: IpcMainInvokeEvent): void {
  const window = mainWindow;
  const frame = event.senderFrame;
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    !frame ||
    frame !== window.webContents.mainFrame ||
    frame.parent !== null ||
    !allowedRendererDocumentUrl ||
    frame.url !== allowedRendererDocumentUrl
  ) {
    throw new Error("截图预览调用来源无效");
  }
}

function resolveRendererDocumentUrl(devServerUrl?: string): string {
  if (!devServerUrl) {
    return pathToFileURL(path.join(app.getAppPath(), "dist", "index.html")).href;
  }
  const parsed = new URL(devServerUrl);
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "5173" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Studio 开发服务器地址无效");
  }
  return `${parsed.origin}/`;
}

const SAFE_PORTABILITY_ERROR_MESSAGES = new Set([
  "Flow JSON 文件不能超过 1 MiB",
  "Flow JSON 不是合法 JSON",
  "Flow JSON 必须是 schemaVersion 1 的裸 FlowDocument",
  "Flow JSON 必须是裸 FlowDocument，不能使用包装对象",
  "Flow JSON 仅支持 schemaVersion 1",
  "Flow JSON 必须是有效的 schemaVersion 1 裸 FlowDocument",
  "导入文件必须是 .json 文件",
  "导入文件必须是普通 JSON 文件",
  "每次只能导入一个 Flow JSON 文件",
  "目标项目不存在",
  "Flow 不存在",
]);

function buildRendererSafePortabilityError(error: unknown, operation: "导入" | "导出"): Error {
  const rawMessage = error instanceof Error ? error.message : "";
  const message = SAFE_PORTABILITY_ERROR_MESSAGES.has(rawMessage)
    ? rawMessage
    : `${operation} Flow JSON 失败，请检查所选文件和目标项目后重试。`;
  const safeError = new Error(message);
  safeError.stack = undefined;
  return safeError;
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

function buildRendererSafeDeletionError(error: unknown): Error {
  const rawMessage = error instanceof Error ? error.message : "";
  const isSafeMessage =
    rawMessage === "目标项目不存在" ||
    rawMessage.startsWith("运行产物") ||
    rawMessage.startsWith("单次运行目录") ||
    rawMessage.startsWith("隔离运行产物失败") ||
    rawMessage.startsWith("删除执行记录失败");
  const safeError = new Error(
    isSafeMessage ? rawMessage : "删除运行记录失败，未变更其他记录；请检查本地产物后重试。",
  );
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
    (
      _event,
      projectId: string,
      flowId: string,
      name: string,
      expectedRevision: number,
    ) => {
      if (typeof projectId !== "string" || projectId.length === 0) {
        throw new Error("projectId 无效");
      }
      if (typeof flowId !== "string" || flowId.length === 0) {
        throw new Error("flowId 无效");
      }
      if (typeof name !== "string") {
        throw new Error("name 无效");
      }
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new Error("expectedRevision 无效");
      }
      return renameFlow(projectId, flowId, name, expectedRevision);
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

  ipcMain.handle(IPC_CHANNELS.importFlowFile, async (_event, projectId: string) => {
    assertResourceId(projectId, "projectId");
    try {
      await assertProjectExistsForFileOperation(projectId);
      return await importFlowFromFile(projectId, {
        showOpenDialog: (options) => dialog.showOpenDialog(options),
        importFlow: importFlowDocument,
      });
    } catch (error: unknown) {
      throw buildRendererSafePortabilityError(error, "导入");
    }
  });

  ipcMain.handle(IPC_CHANNELS.exportFlowFile, async (_event, projectId: string, flowId: string) => {
    assertResourceId(projectId, "projectId");
    assertResourceId(flowId, "flowId");
    try {
      return await exportFlowToFile(projectId, flowId, {
        showSaveDialog: (options) => dialog.showSaveDialog(options),
        getFlow: getFlowForExport,
      });
    } catch (error: unknown) {
      throw buildRendererSafePortabilityError(error, "导出");
    }
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
      if (shutdownPromise) {
        throw new Error("应用正在退出，无法开始新的运行");
      }
      assertNonEmptyId(projectId, "projectId");
      if (flowId !== undefined) {
        assertNonEmptyId(flowId, "flowId");
      }
      const normalizedOptions = normalizeRunFlowOptions(options);
      const executionId = randomUUID();
      const activeExecution = createActiveExecution();
      activeExecutions.set(executionId, activeExecution);
      try {
        const record = await runFlow(projectId, flowId, {
          ...normalizedOptions,
          executionId,
          signal: activeExecution.controller.signal,
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
        activeExecution.complete();
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.cancelExecution, async (_event, executionId: string) => {
    assertNonEmptyId(executionId, "executionId");
    const activeExecution = activeExecutions.get(executionId);
    if (!activeExecution) {
      return {
        accepted: cancelledExecutionIds.has(executionId),
        alreadyCancelled: cancelledExecutionIds.has(executionId),
      };
    }
    const alreadyCancelled = activeExecution.controller.signal.aborted;
    if (!alreadyCancelled) {
      activeExecution.controller.abort();
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

  ipcMain.handle(
    IPC_CHANNELS.getExecutionScreenshotPreview,
    async (event, request: unknown) => {
      assertTrustedMainFrame(event);
      const normalized = normalizeScreenshotPreviewRequest(request);
      try {
        return await getExecutionScreenshotPreview(normalized);
      } catch {
        throw buildRendererSafeScreenshotPreviewError();
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.listExecutions, (_event, projectId: string) => {
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("projectId 无效");
    }
    return listExecutions(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.deleteExecution, (_event, projectId: string, executionId: string) => {
    assertResourceId(projectId, "projectId");
    assertResourceId(executionId, "executionId");
    if (activeExecutions.has(executionId)) {
      throw new Error("运行中的记录不能删除，请先取消或等待运行结束");
    }
    return deleteExecution(projectId, executionId).catch((error: unknown) => {
      throw buildRendererSafeDeletionError(error);
    });
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

  ipcMain.handle(
    IPC_CHANNELS.getFlowVersion,
    (_event, projectId: string, flowId: string, versionId: string) => {
      if (typeof projectId !== "string" || projectId.length === 0) {
        throw new Error("projectId 无效");
      }
      if (typeof flowId !== "string" || flowId.length === 0) {
        throw new Error("flowId 无效");
      }
      if (typeof versionId !== "string" || versionId.length === 0) {
        throw new Error("versionId 无效");
      }
      return getFlowVersion(projectId, flowId, versionId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.restoreFlowVersion,
    (
      _event,
      projectId: string,
      flowId: string,
      versionId: string,
      expectedRevision: number,
    ) => {
      if (typeof projectId !== "string" || projectId.length === 0) {
        throw new Error("projectId 无效");
      }
      if (typeof flowId !== "string" || flowId.length === 0) {
        throw new Error("flowId 无效");
      }
      if (typeof versionId !== "string" || versionId.length === 0) {
        throw new Error("versionId 无效");
      }
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new Error("expectedRevision 无效");
      }
      return restoreFlowVersion(projectId, flowId, versionId, expectedRevision);
    },
  );

}

async function createWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  allowedRendererDocumentUrl = resolveRendererDocumentUrl(devServerUrl);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "织流 Studio",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist-electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.on("closed", () => {
    mainWindow = null;
    allowedRendererDocumentUrl = null;
  });

  if (devServerUrl) {
    await mainWindow.loadURL(allowedRendererDocumentUrl);
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

async function drainBeforeQuit(): Promise<void> {
  const pendingExecutions = [...activeExecutions.entries()];
  for (const [executionId, execution] of pendingExecutions) {
    if (!execution.controller.signal.aborted) {
      execution.controller.abort();
      rememberCancelledExecution(executionId);
    }
  }
  await Promise.allSettled(pendingExecutions.map(([, execution]) => execution.completion));

  const service = localKnowledgeApiService;
  localKnowledgeApiService = null;
  try {
    await service?.close();
  } catch (error: unknown) {
    console.error("织流本地同步服务关闭失败：", error);
  }

  allowFinalQuit = true;
  app.quit();
}

app.on("before-quit", (event) => {
  if (allowFinalQuit) {
    return;
  }
  event.preventDefault();
  shutdownPromise ??= drainBeforeQuit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
