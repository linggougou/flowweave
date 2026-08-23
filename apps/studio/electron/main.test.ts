import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IPC_CHANNELS } from "./ipc-channels.js";
import {
  createStudioContentSecurityPolicy,
  STUDIO_CSP_PLACEHOLDER,
} from "../csp-policy.js";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const appEventHandlers = new Map<string, (...args: unknown[]) => void>();
const mockRunFlow = vi.fn();
const mockImportFlowFromFile = vi.fn();
const mockExportFlowToFile = vi.fn();
const mockImportFlowDocument = vi.fn();
const mockGetFlowForExport = vi.fn();
const mockDeleteExecution = vi.fn();
const mockGetExecutionScreenshotPreview = vi.fn();
const mockAssertProjectExistsForFileOperation = vi.fn();
const mockCloseLocalApi = vi.fn(() => Promise.resolve());
const mockStartLocalApi = vi.fn(() =>
  Promise.resolve({
    status: "owned" as const,
    baseUrl: "http://127.0.0.1:3847",
    close: mockCloseLocalApi,
  }),
);
const mockRepository = {};

const mockApp = {
  whenReady: vi.fn(() => Promise.resolve()),
  on: vi.fn(),
  quit: vi.fn(),
  getAppPath: vi.fn(() => "/tmp/flowweave-app"),
};

const mockShowOpenDialog = vi.fn();
const mockShowSaveDialog = vi.fn();
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockOpenDevTools = vi.fn();
const mockWindowOn = vi.fn();
const mockSetWindowOpenHandler = vi.fn();
const mockWebContentsOn = vi.fn();
const mockSenderSend = vi.fn();
const browserWindowOptions: Array<Record<string, unknown>> = [];
const windowInstances: Array<{
  isDestroyed: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  webContents: {
    mainFrame: { url: string; parent: null };
    openDevTools: ReturnType<typeof vi.fn>;
    setWindowOpenHandler: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
}> = [];

vi.mock("electron", () => ({
  app: mockApp,
  BrowserWindow: class {
    static getAllWindows() {
      return windowInstances;
    }

    private readonly mainFrame = {
      url: "file:///tmp/flowweave-app/dist/index.html",
      parent: null,
    };

    webContents = {
      mainFrame: this.mainFrame,
      openDevTools: mockOpenDevTools,
      setWindowOpenHandler: mockSetWindowOpenHandler,
      on: mockWebContentsOn,
    };

    private readonly destroyed = vi.fn(() => false);
    private readonly focusWindow = vi.fn();

    constructor(options: Record<string, unknown>) {
      browserWindowOptions.push(options);
      windowInstances.push(this);
    }

    on = mockWindowOn;
    isDestroyed = this.destroyed;
    focus = this.focusWindow;

    async loadURL(url: string) {
      mockLoadURL(url);
    }

    async loadFile(filePath: string) {
      mockLoadFile(filePath);
    }
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  },
  dialog: {
    showOpenDialog: mockShowOpenDialog,
    showSaveDialog: mockShowSaveDialog,
  },
}));

vi.mock("./flow-portability-files.js", () => ({
  importFlowFromFile: mockImportFlowFromFile,
  exportFlowToFile: mockExportFlowToFile,
}));

vi.mock("./services.js", () => ({
  assertProjectExistsForFileOperation: mockAssertProjectExistsForFileOperation,
  createProject: vi.fn(),
  getExecution: vi.fn(),
  getExecutionScreenshotPreview: mockGetExecutionScreenshotPreview,
  getFlow: vi.fn(),
  getFlowForExport: mockGetFlowForExport,
  getFlowRunInput: vi.fn(),
  getFlowVersion: vi.fn(),
  importFlowDocument: mockImportFlowDocument,
  getProjectKnowledgeRepository: vi.fn(() => mockRepository),
  listExecutions: vi.fn(),
  listFlows: vi.fn(),
  listFlowVersions: vi.fn(),
  renameFlow: vi.fn(),
  restoreFlowVersion: vi.fn(),
  deleteExecution: mockDeleteExecution,
  runFlow: mockRunFlow,
}));

vi.mock("./local-api-service.js", () => ({
  startLocalKnowledgeApiService: mockStartLocalApi,
}));

describe("electron main runFlow IPC", () => {
  beforeEach(async () => {
    handlers.clear();
    appEventHandlers.clear();
    mockRunFlow.mockReset();
    mockImportFlowFromFile.mockReset();
    mockExportFlowToFile.mockReset();
    mockImportFlowDocument.mockReset();
    mockGetFlowForExport.mockReset();
    mockAssertProjectExistsForFileOperation.mockReset();
    mockAssertProjectExistsForFileOperation.mockResolvedValue(undefined);
    mockDeleteExecution.mockReset();
    mockGetExecutionScreenshotPreview.mockReset();
    mockShowOpenDialog.mockReset();
    mockShowSaveDialog.mockReset();
    mockLoadURL.mockReset();
    mockLoadFile.mockReset();
    mockOpenDevTools.mockReset();
    mockWindowOn.mockReset();
    mockSetWindowOpenHandler.mockReset();
    mockWebContentsOn.mockReset();
    mockSenderSend.mockReset();
    mockCloseLocalApi.mockClear();
    mockStartLocalApi.mockClear();
    browserWindowOptions.length = 0;
    windowInstances.length = 0;
    mockApp.on.mockReset();
    mockApp.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      appEventHandlers.set(event, handler);
    });
    mockApp.whenReady.mockClear();
    mockApp.getAppPath.mockClear();
    mockApp.quit.mockReset();
    vi.resetModules();

    await import("./main.js");
    await Promise.resolve();
    await Promise.resolve();
  });

  it("无活跃执行时会协调关闭 API 并只触发一次真正退出", async () => {
    expect(mockStartLocalApi).toHaveBeenCalledWith({ repo: mockRepository });
    const firstEvent = { preventDefault: vi.fn() };

    appEventHandlers.get("before-quit")?.(firstEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(mockCloseLocalApi).toHaveBeenCalledOnce();
      expect(mockApp.quit).toHaveBeenCalledOnce();
    });

    const finalEvent = { preventDefault: vi.fn() };
    appEventHandlers.get("before-quit")?.(finalEvent);

    expect(mockCloseLocalApi).toHaveBeenCalledOnce();
    expect(mockApp.quit).toHaveBeenCalledOnce();
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("退出时先取消并等待活跃 runFlow 完成，再关闭 API 且防止重复退出", async () => {
    let resolveRun: (() => void) | undefined;
    mockRunFlow.mockImplementation(
      (_projectId: string, _flowId: string, options: { executionId: string }) =>
        new Promise((resolve) => {
          resolveRun = () => resolve({ executionId: options.executionId, status: "cancelled" });
        }),
    );
    const runHandler = handlers.get(IPC_CHANNELS.runFlow);
    const runPromise = runHandler?.(
      { sender: { send: mockSenderSend } },
      "project_ipc",
      "flow_ipc",
      { showBrowser: false },
    ) as Promise<unknown>;
    await Promise.resolve();
    const serviceOptions = mockRunFlow.mock.calls[0]?.[2] as { signal: AbortSignal };
    const firstEvent = { preventDefault: vi.fn() };
    const repeatedEvent = { preventDefault: vi.fn() };

    appEventHandlers.get("before-quit")?.(firstEvent);
    appEventHandlers.get("before-quit")?.(repeatedEvent);
    await Promise.resolve();

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce();
    expect(serviceOptions.signal.aborted).toBe(true);
    expect(mockCloseLocalApi).not.toHaveBeenCalled();
    expect(mockApp.quit).not.toHaveBeenCalled();

    resolveRun?.();
    await runPromise;
    await vi.waitFor(() => {
      expect(mockCloseLocalApi).toHaveBeenCalledOnce();
      expect(mockApp.quit).toHaveBeenCalledOnce();
    });

    const finalEvent = { preventDefault: vi.fn() };
    appEventHandlers.get("before-quit")?.(finalEvent);
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
    expect(mockCloseLocalApi).toHaveBeenCalledOnce();
    expect(mockApp.quit).toHaveBeenCalledOnce();
  });

  it("退出协调开始后拒绝新的运行，避免漏出 drain 快照", async () => {
    const event = { preventDefault: vi.fn() };
    appEventHandlers.get("before-quit")?.(event);
    const runHandler = handlers.get(IPC_CHANNELS.runFlow);

    await expect(
      runHandler?.({ sender: { send: mockSenderSend } }, "project_ipc", "flow_ipc", {
        showBrowser: false,
      }),
    ).rejects.toThrow("应用正在退出");

    expect(mockRunFlow).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(mockCloseLocalApi).toHaveBeenCalledOnce();
      expect(mockApp.quit).toHaveBeenCalledOnce();
    });
  });

  it("完整透传 Studio 收集的运行上下文选项", async () => {
    mockRunFlow.mockResolvedValue({
      executionId: "exec_ipc_1",
      status: "passed",
    });

    const handler = handlers.get(IPC_CHANNELS.runFlow);
    expect(handler).toBeTypeOf("function");

    const options = {
      showBrowser: false,
      environmentName: "预发已登录",
      baseUrl: "https://staging.example.com/app",
      storageStatePath: "/tmp/flowweave/state.json",
      variables: {
        username: "alice",
        retryCount: 2,
        rememberMe: true,
      },
    };

    await handler?.({ sender: { send: mockSenderSend } }, "project_ipc", "flow_ipc", options);

    expect(mockRunFlow).toHaveBeenCalledWith(
      "project_ipc",
      "flow_ipc",
      expect.objectContaining(options),
    );
    expect(mockRunFlow.mock.calls[0]?.[2]).toMatchObject({
      executionId: expect.any(String),
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    });
  });

  it("拒绝非白名单运行参数和非基础类型变量", async () => {
    const handler = handlers.get(IPC_CHANNELS.runFlow);

    await expect(
      handler?.({ sender: { send: mockSenderSend } }, "project_ipc", "flow_ipc", {
        variables: { nested: { secret: "no" } },
      }),
    ).rejects.toThrow("variables.nested 无效");
    await expect(
      handler?.({ sender: { send: mockSenderSend } }, "project_ipc", "flow_ipc", {
        showBrowser: true,
        extra: "not-allowed",
      }),
    ).rejects.toThrow("运行参数包含不支持的字段");
    expect(mockRunFlow).not.toHaveBeenCalled();
  });

  it("运行异常返回渲染进程前会移除敏感变量值与堆栈行", async () => {
    mockRunFlow.mockRejectedValue(
      new Error("连接失败：do-not-render\n    at /private/runtime.js:10:2"),
    );
    const handler = handlers.get(IPC_CHANNELS.runFlow);

    const outcome = handler?.({ sender: { send: mockSenderSend } }, "project_ipc", "flow_ipc", {
      variables: { secret_password: "do-not-render" },
    });
    const error = await Promise.resolve(outcome).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("[已隐藏]");
    expect((error as Error).message).not.toContain("do-not-render");
    expect((error as Error).message).not.toContain("/private/runtime.js");
    expect((error as Error).stack).toBeUndefined();
  });

  it("按 executionId 转发进度，并允许幂等重复取消", async () => {
    let resolveRun: ((value: { executionId: string; status: "cancelled" }) => void) | undefined;
    mockRunFlow.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    );
    const runHandler = handlers.get(IPC_CHANNELS.runFlow);
    const cancelHandler = handlers.get(IPC_CHANNELS.cancelExecution);

    const runPromise = runHandler?.(
      { sender: { send: mockSenderSend } },
      "project_ipc",
      "flow_ipc",
      { showBrowser: false },
    ) as Promise<unknown>;
    await Promise.resolve();
    const serviceOptions = mockRunFlow.mock.calls[0]?.[2] as {
      executionId: string;
      signal: AbortSignal;
      onProgress: (event: unknown) => void;
    };
    const progress = {
      type: "started",
      executionId: serviceOptions.executionId,
      totalSteps: 1,
      completedSteps: 0,
      currentAction: "正在准备运行",
    };
    serviceOptions.onProgress(progress);

    await expect(cancelHandler?.({}, serviceOptions.executionId)).resolves.toEqual({
      accepted: true,
      alreadyCancelled: false,
    });
    await expect(cancelHandler?.({}, serviceOptions.executionId)).resolves.toEqual({
      accepted: true,
      alreadyCancelled: true,
    });
    expect(serviceOptions.signal.aborted).toBe(true);
    expect(mockSenderSend).toHaveBeenCalledWith(IPC_CHANNELS.executionProgress, progress);

    resolveRun?.({ executionId: serviceOptions.executionId, status: "cancelled" });
    await runPromise;
  });

  it("取消接口校验 executionId", async () => {
    const cancelHandler = handlers.get(IPC_CHANNELS.cancelExecution);

    await expect(cancelHandler?.({}, "")).rejects.toThrow("executionId 无效");
    await expect(cancelHandler?.({}, { id: "exec" })).rejects.toThrow("executionId 无效");
  });

  it("删除执行仅接受严格单段业务 ID，并拒绝活动执行", async () => {
    mockRunFlow.mockImplementation(
      (_projectId: string, _flowId: string, _options: { executionId: string }) =>
        new Promise(() => undefined),
    );
    const runHandler = handlers.get(IPC_CHANNELS.runFlow);
    void runHandler?.({ sender: { send: mockSenderSend } }, "project_ipc", "flow_ipc", {
      showBrowser: false,
    });
    await Promise.resolve();
    const executionId = (mockRunFlow.mock.calls[0]?.[2] as { executionId: string }).executionId;
    const deleteHandler = handlers.get(IPC_CHANNELS.deleteExecution);

    expect(() => deleteHandler?.({}, "../project", "exec_safe")).toThrow("projectId 无效");
    expect(() => deleteHandler?.({}, "project_ipc", "../exec")).toThrow("executionId 无效");
    expect(() => deleteHandler?.({}, "project_ipc", executionId)).toThrow("运行中的记录不能删除");
    expect(mockDeleteExecution).not.toHaveBeenCalled();
  });

  it("删除已完成执行时只向 service 透传两个业务 ID", async () => {
    mockDeleteExecution.mockResolvedValue({
      projectId: "project_ipc",
      executionId: "exec_ipc",
      status: "deleted",
      artifacts: "deleted",
    });
    const deleteHandler = handlers.get(IPC_CHANNELS.deleteExecution);

    await expect(
      deleteHandler?.({}, "project_ipc", "exec_ipc", "/renderer/not-allowed"),
    ).resolves.toMatchObject({ status: "deleted" });

    expect(mockDeleteExecution).toHaveBeenCalledWith("project_ipc", "exec_ipc");
  });

  it("删除异常返回 renderer 前移除内部路径与堆栈", async () => {
    mockDeleteExecution.mockRejectedValue(
      new Error("SQLITE_IOERR: /private/flowweave/project/store.sqlite\n at native.cc:1"),
    );
    const deleteHandler = handlers.get(IPC_CHANNELS.deleteExecution);
    const error = await Promise.resolve(deleteHandler?.({}, "project_ipc", "exec_ipc")).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("删除运行记录失败");
    expect((error as Error).message).not.toContain("/private/flowweave");
    expect((error as Error).stack).toBeUndefined();
  });

  it("导入导出 IPC 只接收业务 ID，额外路径参数不会进入文件服务", async () => {
    mockImportFlowFromFile.mockResolvedValue({ status: "cancelled" });
    mockExportFlowToFile.mockResolvedValue({ status: "cancelled" });
    const importHandler = handlers.get(IPC_CHANNELS.importFlowFile);
    const exportHandler = handlers.get(IPC_CHANNELS.exportFlowFile);

    await importHandler?.({}, "project_ipc", "/renderer/cannot-read.json");
    await exportHandler?.({}, "project_ipc", "flow_ipc", "/renderer/cannot-write.json");

    expect(mockImportFlowFromFile).toHaveBeenCalledWith(
      "project_ipc",
      expect.objectContaining({
        showOpenDialog: expect.any(Function),
        importFlow: mockImportFlowDocument,
      }),
    );
    expect(mockExportFlowToFile).toHaveBeenCalledWith(
      "project_ipc",
      "flow_ipc",
      expect.objectContaining({
        showSaveDialog: expect.any(Function),
        getFlow: expect.any(Function),
      }),
    );
    expect(JSON.stringify(mockImportFlowFromFile.mock.calls)).not.toContain("cannot-read");
    expect(JSON.stringify(mockExportFlowToFile.mock.calls)).not.toContain("cannot-write");
  });

  it("导入导出 IPC 会校验 projectId 和 flowId", async () => {
    const importHandler = handlers.get(IPC_CHANNELS.importFlowFile);
    const exportHandler = handlers.get(IPC_CHANNELS.exportFlowFile);

    await expect(importHandler?.({}, "")).rejects.toThrow("projectId 无效");
    await expect(exportHandler?.({}, "project_ipc", "")).rejects.toThrow("flowId 无效");
    expect(mockImportFlowFromFile).not.toHaveBeenCalled();
    expect(mockExportFlowToFile).not.toHaveBeenCalled();
  });

  it.each([
    ["上级路径", "../fw-g5-id-escape"],
    ["正斜线", "project/escape"],
    ["反斜线", "project\\escape"],
    ["点路径", "."],
    ["编码片段", "project%2fescape"],
    ["控制字符", "project\u0000escape"],
    ["原型对象", { toString: (): string => "project_ipc" }],
  ])("%s projectId 在任何 repo、文件或 dialog 副作用前拒绝", async (_label, projectId) => {
    const importHandler = handlers.get(IPC_CHANNELS.importFlowFile);
    const exportHandler = handlers.get(IPC_CHANNELS.exportFlowFile);
    const escapedPath = path.resolve(process.cwd(), "..", "fw-g5-id-escape");

    await expect(importHandler?.({}, projectId)).rejects.toThrow("projectId 无效");
    await expect(exportHandler?.({}, projectId, "flow_ipc")).rejects.toThrow("projectId 无效");

    expect(mockImportFlowFromFile).not.toHaveBeenCalled();
    expect(mockExportFlowToFile).not.toHaveBeenCalled();
    expect(mockGetFlowForExport).not.toHaveBeenCalled();
    expect(mockShowOpenDialog).not.toHaveBeenCalled();
    expect(mockShowSaveDialog).not.toHaveBeenCalled();
    expect(existsSync(escapedPath)).toBe(false);
  });

  it("安全但不存在的项目由导出专用读取在 dialog 前拒绝", async () => {
    mockExportFlowToFile.mockImplementation(async (_projectId, _flowId, dependencies) => {
      await dependencies.getFlow("ghost_project", "flow_ipc");
      return { status: "cancelled" };
    });
    mockGetFlowForExport.mockRejectedValue(new Error("目标项目不存在"));
    const exportHandler = handlers.get(IPC_CHANNELS.exportFlowFile);

    await expect(exportHandler?.({}, "ghost_project", "flow_ipc")).rejects.toThrow(
      "目标项目不存在",
    );

    expect(mockGetFlowForExport).toHaveBeenCalledWith("ghost_project", "flow_ipc");
    expect(mockShowSaveDialog).not.toHaveBeenCalled();
  });

  it("安全但不存在的项目在导入 dialog、文件读取与 importFlow 前拒绝", async () => {
    mockAssertProjectExistsForFileOperation.mockRejectedValue(new Error("目标项目不存在"));
    const importHandler = handlers.get(IPC_CHANNELS.importFlowFile);

    await expect(importHandler?.({}, "ghost_project")).rejects.toThrow("目标项目不存在");

    expect(mockAssertProjectExistsForFileOperation).toHaveBeenCalledWith("ghost_project");
    expect(mockImportFlowFromFile).not.toHaveBeenCalled();
    expect(mockShowOpenDialog).not.toHaveBeenCalled();
    expect(mockImportFlowDocument).not.toHaveBeenCalled();
  });

  it.each([
    ["import", "无法读取 /Users/alice/private/token.json: top-secret"],
    ["export", "SQLITE_CANTOPEN /private/projects/secret.sqlite"],
  ])("%s 原始错误不会向 renderer 泄露路径或敏感消息", async (operation, rawMessage) => {
    const handler = handlers.get(
      operation === "import" ? IPC_CHANNELS.importFlowFile : IPC_CHANNELS.exportFlowFile,
    );
    const failingService = operation === "import" ? mockImportFlowFromFile : mockExportFlowToFile;
    failingService.mockRejectedValue(new Error(rawMessage));

    const outcome = Promise.resolve(
      operation === "import"
        ? handler?.({}, "project_ipc")
        : handler?.({}, "project_ipc", "flow_ipc"),
    ).catch((error: unknown) => error);
    const error = await outcome;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(operation === "import" ? "导入" : "导出");
    expect((error as Error).message).not.toContain("/Users");
    expect((error as Error).message).not.toContain("/private");
    expect((error as Error).message).not.toContain("top-secret");
    expect((error as Error).stack).toBeUndefined();
  });

  it("截图预览 IPC 只接受严格业务对象，不向主进程透传 renderer 路径", async () => {
    const handler = handlers.get(IPC_CHANNELS.getExecutionScreenshotPreview);
    const window = windowInstances[0]!;
    mockGetExecutionScreenshotPreview.mockReturnValue({ status: "absent" });

    await expect(
      handler?.(
        { sender: window.webContents, senderFrame: window.webContents.mainFrame },
        {
          projectId: "project_ipc",
          executionId: "exec_ipc",
          stepIndex: 1,
          path: "/Users/alice/private/step-1.png",
        },
      ),
    ).rejects.toThrow("不支持的字段");
    expect(mockGetExecutionScreenshotPreview).not.toHaveBeenCalled();

    await expect(
      handler?.(
        { sender: window.webContents, senderFrame: window.webContents.mainFrame },
        { projectId: "project_ipc", executionId: "exec_ipc", stepIndex: 1 },
      ),
    ).resolves.toEqual({ status: "absent" });

    expect(mockGetExecutionScreenshotPreview).toHaveBeenCalledWith({
      projectId: "project_ipc",
      executionId: "exec_ipc",
      stepIndex: 1,
    });
  });

  it.each([
    ["非对象", "project_ipc"],
    ["数组", ["project_ipc", "exec_ipc", 1]],
    ["非法项目", { projectId: "../project", executionId: "exec_ipc", stepIndex: 1 }],
    ["非法执行", { projectId: "project_ipc", executionId: "exec/path", stepIndex: 1 }],
    ["超长项目", { projectId: "p".repeat(129), executionId: "exec_ipc", stepIndex: 1 }],
    ["负数步骤", { projectId: "project_ipc", executionId: "exec_ipc", stepIndex: -1 }],
    ["小数步骤", { projectId: "project_ipc", executionId: "exec_ipc", stepIndex: 1.5 }],
  ])("截图预览在 resolver 前拒绝%s请求", async (_label, request) => {
    const handler = handlers.get(IPC_CHANNELS.getExecutionScreenshotPreview);
    const window = windowInstances[0]!;

    await expect(
      handler?.(
        { sender: window.webContents, senderFrame: window.webContents.mainFrame },
        request,
      ),
    ).rejects.toThrow();
    expect(mockGetExecutionScreenshotPreview).not.toHaveBeenCalled();
  });

  it("截图预览拒绝非法原型对象，且彻底移除任意 openPath 频道", async () => {
    const handler = handlers.get(IPC_CHANNELS.getExecutionScreenshotPreview);
    const window = windowInstances[0]!;
    const request = Object.assign(Object.create({ inherited: true }), {
      projectId: "project_ipc",
      executionId: "exec_ipc",
      stepIndex: 1,
    });

    await expect(
      handler?.(
        { sender: window.webContents, senderFrame: window.webContents.mainFrame },
        request,
      ),
    ).rejects.toThrow("请求无效");
    expect(mockGetExecutionScreenshotPreview).not.toHaveBeenCalled();
    expect(Object.values(IPC_CHANNELS)).not.toContain("studio:open-path");
    expect(handlers.has("studio:open-path")).toBe(false);
  });

  it("截图预览只接受当前主窗口的 mainFrame 与精确文档来源", async () => {
    const handler = handlers.get(IPC_CHANNELS.getExecutionScreenshotPreview);
    const window = windowInstances[0]!;
    const request = { projectId: "project_ipc", executionId: "exec_ipc", stepIndex: 1 };
    const foreignSender = { ...window.webContents };
    const iframe = { url: window.webContents.mainFrame.url, parent: {} };

    await expect(
      handler?.({ sender: foreignSender, senderFrame: window.webContents.mainFrame }, request),
    ).rejects.toThrow("调用来源无效");
    await expect(
      handler?.({ sender: window.webContents, senderFrame: iframe }, request),
    ).rejects.toThrow("调用来源无效");

    const originalUrl = window.webContents.mainFrame.url;
    window.webContents.mainFrame.url = "file:///tmp/flowweave-app/dist/other.html";
    await expect(
      handler?.(
        { sender: window.webContents, senderFrame: window.webContents.mainFrame },
        request,
      ),
    ).rejects.toThrow("调用来源无效");
    window.webContents.mainFrame.url = originalUrl;
    expect(mockGetExecutionScreenshotPreview).not.toHaveBeenCalled();
  });

  it("截图 resolver 原始错误会映射为不含路径、errno 和堆栈的稳定错误", async () => {
    const handler = handlers.get(IPC_CHANNELS.getExecutionScreenshotPreview);
    const window = windowInstances[0]!;
    mockGetExecutionScreenshotPreview.mockRejectedValue(
      new Error("ENOENT /Users/alice/.flowweave/projects/private/step-1.png\n at native.cc:1"),
    );

    const error = await Promise.resolve(
      handler?.(
        { sender: window.webContents, senderFrame: window.webContents.mainFrame },
        { projectId: "project_ipc", executionId: "exec_ipc", stepIndex: 1 },
      ),
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("截图预览不可用");
    expect((error as Error).message).not.toContain("ENOENT");
    expect((error as Error).message).not.toContain("/Users");
    expect((error as Error).stack).toBeUndefined();
  });

  it("主窗口启用 sandbox 并拒绝新窗口", () => {
    const options = browserWindowOptions[0];

    expect(options).toBeDefined();
    expect(options?.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(mockSetWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function));
    const decision = mockSetWindowOpenHandler.mock.calls[0]?.[0]?.({
      url: "https://example.com",
    });
    expect(decision).toEqual({ action: "deny" });
    expect(mockWebContentsOn).toHaveBeenCalledWith("will-navigate", expect.any(Function));
    const navigationEvent = { preventDefault: vi.fn() };
    const navigationHandler = mockWebContentsOn.mock.calls.find(
      ([event]) => event === "will-navigate",
    )?.[1] as ((event: typeof navigationEvent) => void) | undefined;
    navigationHandler?.(navigationEvent);
    expect(navigationEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it("入口 CSP 禁止主动内容，仅允许受控 Blob 图片、固定本地 API 与开发 HMR", () => {
    const html = readFileSync("index.html", "utf8");
    const productionPolicy = createStudioContentSecurityPolicy("production");
    const developmentPolicy = createStudioContentSecurityPolicy("development");

    expect(html).toContain(STUDIO_CSP_PLACEHOLDER);
    expect(productionPolicy).toContain("script-src 'self'");
    expect(productionPolicy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(productionPolicy).not.toContain("unsafe-eval");
    expect(productionPolicy).toContain("img-src 'self' blob:");
    expect(productionPolicy).toContain("connect-src 'none'");
    expect(productionPolicy).not.toContain("127.0.0.1");
    expect(developmentPolicy).toContain(
      "connect-src 'self' http://127.0.0.1:3847 http://127.0.0.1:5173 ws://127.0.0.1:5173",
    );
    expect(developmentPolicy).not.toContain("*");
    for (const directive of [
      "object-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ]) {
      expect(productionPolicy).toContain(directive);
      expect(developmentPolicy).toContain(directive);
    }
  });
});
