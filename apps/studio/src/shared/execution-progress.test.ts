import { describe, expect, it } from "vitest";

import {
  createExecutionProgressState,
  failExecutionProgressUnlessTerminal,
  finalizeExecutionProgress,
  reduceExecutionProgress,
} from "./execution-progress.js";

describe("执行进度模型", () => {
  it("把 started/step-started/step-finished/completed 映射为可展示状态", () => {
    let state = createExecutionProgressState("exec_progress");
    state = reduceExecutionProgress(state, {
      type: "started",
      executionId: "exec_progress",
      totalSteps: 2,
      completedSteps: 0,
      currentAction: "正在准备运行",
    });
    state = reduceExecutionProgress(state, {
      type: "step-started",
      executionId: "exec_progress",
      totalSteps: 2,
      completedSteps: 0,
      stepIndex: 0,
      stepId: "s1",
      stepType: "navigate",
      currentAction: "正在打开页面",
    });
    state = reduceExecutionProgress(state, {
      type: "step-finished",
      executionId: "exec_progress",
      totalSteps: 2,
      completedSteps: 1,
      stepIndex: 0,
      stepId: "s1",
      stepType: "navigate",
      stepStatus: "success",
      currentAction: "已完成页面打开",
    });
    state = reduceExecutionProgress(state, {
      type: "completed",
      executionId: "exec_progress",
      totalSteps: 2,
      completedSteps: 2,
      currentAction: "运行成功",
    });

    expect(state).toMatchObject({
      executionId: "exec_progress",
      status: "completed",
      totalSteps: 2,
      completedSteps: 2,
      currentStepIndex: 0,
      currentAction: "运行成功",
    });
  });

  it("忽略其他 executionId 的事件并把取消映射为 cancelled", () => {
    const initial = createExecutionProgressState("exec_current");
    const unchanged = reduceExecutionProgress(initial, {
      type: "started",
      executionId: "exec_other",
      totalSteps: 1,
      completedSteps: 0,
      currentAction: "正在准备运行",
    });
    const cancelled = reduceExecutionProgress(initial, {
      type: "cancelled",
      executionId: "exec_current",
      totalSteps: 3,
      completedSteps: 1,
      stepIndex: 1,
      currentAction: "已取消运行",
    });

    expect(unchanged).toBe(initial);
    expect(cancelled).toMatchObject({
      status: "cancelled",
      completedSteps: 1,
      currentStepIndex: 1,
      currentAction: "已取消运行",
    });
  });

  it("runFlow 返回后补齐终态，且结果刷新失败不覆盖真实完成状态", () => {
    const completed = finalizeExecutionProgress(
      createExecutionProgressState("pending"),
      { executionId: "exec_done", status: "passed" },
      3,
    );
    const afterRefreshFailure = failExecutionProgressUnlessTerminal(
      completed,
      "结果刷新失败",
    );

    expect(completed).toMatchObject({
      executionId: "exec_done",
      status: "completed",
      completedSteps: 3,
      totalSteps: 3,
      currentAction: "运行成功",
    });
    expect(afterRefreshFailure).toBe(completed);
  });

  it("真实运行失败前的读取异常会进入 failed，但取消状态不会被覆盖", () => {
    const pending = createExecutionProgressState("exec_pending");
    expect(failExecutionProgressUnlessTerminal(pending, "运行未完成")).toMatchObject({
      status: "failed",
      currentAction: "运行未完成",
    });

    const cancelled = finalizeExecutionProgress(
      pending,
      { executionId: "exec_pending", status: "cancelled" },
      3,
    );
    expect(failExecutionProgressUnlessTerminal(cancelled, "刷新失败")).toBe(cancelled);
  });
});
