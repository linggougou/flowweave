import { describe, expect, it, vi } from "vitest";

import type { ExecutionResult } from "@flowweave/project-knowledge";
import { createExecutionDetailLoader } from "./execution-detail-loader.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function execution(executionId: string): ExecutionResult {
  return { executionId, flowId: "flow-a", status: "success", steps: [] };
}

describe("运行详情最新请求守卫", () => {
  it("较早请求慢响应时不会覆盖用户后来选择的记录", async () => {
    const oldRequest = deferred<ExecutionResult>();
    const newRequest = deferred<ExecutionResult>();
    const fetchExecution = vi.fn((executionId: string) =>
      executionId === "old" ? oldRequest.promise : newRequest.promise,
    );
    const onSuccess = vi.fn();
    const loader = createExecutionDetailLoader(fetchExecution);

    loader.load("old", { onSuccess, onError: vi.fn() });
    loader.load("new", { onSuccess, onError: vi.fn() });
    newRequest.resolve(execution("new"));
    await newRequest.promise;
    await Promise.resolve();
    oldRequest.resolve(execution("old"));
    await oldRequest.promise;
    await Promise.resolve();

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith("new", expect.objectContaining({ executionId: "new" }));
  });

  it("接口返回其他记录时按错误处理，不把错配详情交给界面", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const loader = createExecutionDetailLoader(async () => execution("unexpected"));

    loader.load("selected", { onSuccess, onError });
    await Promise.resolve();
    await Promise.resolve();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("selected", expect.any(Error));
  });
});
