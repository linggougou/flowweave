import { beforeEach, describe, expect, it, vi } from "vitest";

import { IPC_CHANNELS } from "./ipc-channels.js";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const appEventHandlers = new Map<string, () => void>();
const mockRunFlow = vi.fn();
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

const mockShellOpenPath = vi.fn();
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockOpenDevTools = vi.fn();
const mockWindowOn = vi.fn();
const mockSenderSend = vi.fn();
const windowInstances: Array<{
  isDestroyed: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("electron", () => ({
  app: mockApp,
  BrowserWindow: class {
    static getAllWindows() {
      return windowInstances;
    }

    webContents = {
      openDevTools: mockOpenDevTools,
    };

    private readonly destroyed = vi.fn(() => false);
    private readonly focusWindow = vi.fn();

    constructor() {
      windowInstances.push({
        isDestroyed: this.destroyed,
        focus: this.focusWindow,
      });
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
  shell: {
    openPath: mockShellOpenPath,
  },
}));

vi.mock("./services.js", () => ({
  createProject: vi.fn(),
  getExecution: vi.fn(),
  getFlow: vi.fn(),
  getFlowRunInput: vi.fn(),
  getFlowVersion: vi.fn(),
  getProjectKnowledgeRepository: vi.fn(() => mockRepository),
  listExecutions: vi.fn(),
  listFlows: vi.fn(),
  listFlowVersions: vi.fn(),
  renameFlow: vi.fn(),
  restoreFlowVersion: vi.fn(),
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
    mockShellOpenPath.mockReset();
    mockLoadURL.mockReset();
    mockLoadFile.mockReset();
    mockOpenDevTools.mockReset();
    mockWindowOn.mockReset();
    mockSenderSend.mockReset();
    mockCloseLocalApi.mockClear();
    mockStartLocalApi.mockClear();
    windowInstances.length = 0;
    mockApp.on.mockReset();
    mockApp.on.mockImplementation((event: string, handler: () => void) => {
      appEventHandlers.set(event, handler);
    });
    mockApp.whenReady.mockClear();
    mockApp.getAppPath.mockClear();
    vi.resetModules();

    await import("./main.js");
    await Promise.resolve();
    await Promise.resolve();
  });

  it("ready 时启动本地同步服务并在退出前关闭", async () => {
    expect(mockStartLocalApi).toHaveBeenCalledWith({ repo: mockRepository });

    appEventHandlers.get("before-quit")?.();
    await Promise.resolve();

    expect(mockCloseLocalApi).toHaveBeenCalledOnce();
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
});
