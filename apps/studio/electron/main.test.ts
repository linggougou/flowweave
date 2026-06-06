import { beforeEach, describe, expect, it, vi } from "vitest";

import { IPC_CHANNELS } from "./ipc-channels.js";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const mockRunFlow = vi.fn();

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

vi.mock("electron", () => ({
  app: mockApp,
  BrowserWindow: class {
    static getAllWindows() {
      return [];
    }

    webContents = {
      openDevTools: mockOpenDevTools,
    };

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
  listExecutions: vi.fn(),
  listFlows: vi.fn(),
  listFlowVersions: vi.fn(),
  renameFlow: vi.fn(),
  restoreFlowVersion: vi.fn(),
  runFlow: mockRunFlow,
}));

describe("electron main runFlow IPC", () => {
  beforeEach(async () => {
    handlers.clear();
    mockRunFlow.mockReset();
    mockShellOpenPath.mockReset();
    mockLoadURL.mockReset();
    mockLoadFile.mockReset();
    mockOpenDevTools.mockReset();
    mockApp.on.mockReset();
    mockApp.whenReady.mockClear();
    mockApp.getAppPath.mockClear();
    vi.resetModules();

    await import("./main.js");
    await Promise.resolve();
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

    await handler?.({}, "project_ipc", "flow_ipc", options);

    expect(mockRunFlow).toHaveBeenCalledWith("project_ipc", "flow_ipc", options);
  });
});
