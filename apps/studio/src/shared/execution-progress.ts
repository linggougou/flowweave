import type { RunFlowResult, StudioExecutionProgressEvent } from "./studio-api-types.js";

export type ExecutionProgressState = {
  executionId: string;
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  totalSteps: number;
  completedSteps: number;
  currentStepIndex?: number;
  currentAction: string;
};

export function createExecutionProgressState(executionId: string): ExecutionProgressState {
  return {
    executionId,
    status: "idle",
    totalSteps: 0,
    completedSteps: 0,
    currentAction: "等待运行",
  };
}

export function reduceExecutionProgress(
  state: ExecutionProgressState,
  event: StudioExecutionProgressEvent,
): ExecutionProgressState {
  if (event.executionId !== state.executionId) {
    return state;
  }

  const status =
    event.type === "completed"
      ? "completed"
      : event.type === "failed"
        ? "failed"
        : event.type === "cancelled"
          ? "cancelled"
          : "running";
  const stepIndex = "stepIndex" in event ? event.stepIndex : undefined;

  return {
    ...state,
    status,
    totalSteps: event.totalSteps,
    completedSteps: event.completedSteps,
    currentStepIndex: stepIndex ?? state.currentStepIndex,
    currentAction: event.currentAction,
  };
}

function isTerminalStatus(status: ExecutionProgressState["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function finalizeExecutionProgress(
  state: ExecutionProgressState,
  result: RunFlowResult,
  totalSteps: number,
): ExecutionProgressState {
  if (state.executionId === result.executionId && isTerminalStatus(state.status)) {
    return state;
  }

  const status =
    result.status === "passed"
      ? "completed"
      : result.status === "cancelled"
        ? "cancelled"
        : result.status === "failed"
          ? "failed"
          : "running";
  const completedSteps =
    status === "completed"
      ? totalSteps
      : state.executionId === result.executionId
        ? state.completedSteps
        : 0;

  return {
    ...state,
    executionId: result.executionId,
    status,
    totalSteps,
    completedSteps,
    currentAction:
      status === "completed"
        ? "运行成功"
        : status === "cancelled"
          ? "已取消运行"
          : status === "failed"
            ? "运行失败"
            : state.currentAction,
  };
}

export function failExecutionProgressUnlessTerminal(
  state: ExecutionProgressState,
  currentAction: string,
): ExecutionProgressState {
  if (isTerminalStatus(state.status)) {
    return state;
  }
  return {
    ...state,
    status: "failed",
    currentAction,
  };
}
