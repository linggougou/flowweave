import { beforeEach, describe, expect, it, vi } from "vitest";

import { IPC_CHANNELS } from "./ipc-channels.js";

const exposeInMainWorldMock = vi.fn();
const invokeMock = vi.fn();
const onMock = vi.fn();
const removeListenerMock = vi.fn();

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: exposeInMainWorldMock },
  ipcRenderer: {
    invoke: invokeMock,
    on: onMock,
    removeListener: removeListenerMock,
  },
}));

describe("preload 执行控制桥", () => {
  beforeEach(async () => {
    exposeInMainWorldMock.mockReset();
    invokeMock.mockReset();
    onMock.mockReset();
    removeListenerMock.mockReset();
    vi.resetModules();
    await import("./preload.js");
  });

  it("只暴露固定进度频道，并返回可清理 listener 的函数", () => {
    const api = exposeInMainWorldMock.mock.calls[0]?.[1] as {
      onExecutionProgress: (listener: (event: unknown) => void) => () => void;
    };
    const listener = vi.fn();
    const cleanup = api.onExecutionProgress(listener);
    const wrapped = onMock.mock.calls[0]?.[1] as (_event: unknown, payload: unknown) => void;
    const progress = { type: "started", executionId: "exec_preload" };

    expect(onMock).toHaveBeenCalledWith(IPC_CHANNELS.executionProgress, wrapped);
    wrapped({}, progress);
    expect(listener).toHaveBeenCalledWith(progress);

    cleanup();
    expect(removeListenerMock).toHaveBeenCalledWith(IPC_CHANNELS.executionProgress, wrapped);
  });

  it("取消只允许通过固定 cancelExecution invoke", async () => {
    const api = exposeInMainWorldMock.mock.calls[0]?.[1] as {
      cancelExecution: (executionId: string) => Promise<unknown>;
    };

    await api.cancelExecution("exec_preload");

    expect(invokeMock).toHaveBeenCalledWith(IPC_CHANNELS.cancelExecution, "exec_preload");
  });

  it("导入导出桥只接受业务 ID，不向 renderer 暴露任意读写路径", async () => {
    const api = exposeInMainWorldMock.mock.calls[0]?.[1] as {
      nativeFilePortability: boolean;
      importFlowFile: (projectId: string) => Promise<unknown>;
      exportFlowFile: (projectId: string, flowId: string) => Promise<unknown>;
    };

    expect(api.nativeFilePortability).toBe(true);

    await api.importFlowFile("project_preload");
    await api.exportFlowFile("project_preload", "flow_preload");

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      IPC_CHANNELS.importFlowFile,
      "project_preload",
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      IPC_CHANNELS.exportFlowFile,
      "project_preload",
      "flow_preload",
    );
    expect(Object.keys(api)).not.toContain("readFile");
    expect(Object.keys(api)).not.toContain("writeFile");
  });
});
