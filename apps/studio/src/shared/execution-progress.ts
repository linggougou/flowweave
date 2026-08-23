import type { StudioExecutionProgressEvent } from "./studio-api-types.js";

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
