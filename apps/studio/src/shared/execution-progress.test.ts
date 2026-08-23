import { describe, expect, it } from "vitest";

import { createExecutionProgressState, reduceExecutionProgress } from "./execution-progress.js";

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
});
