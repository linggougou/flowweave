export const RUNTIME_PHASE = "P1" as const;

export { executeFlow } from "./playwright-runner.js";
export type { ExecutionOptions } from "./types.js";
export type {
  BaseStepDiagnostic,
  DiagnosticCandidateSummary,
  ExecutionProgressEvent,
  ExecutionResult,
  ExecutionStatus,
  RuntimeErrorDiagnostic,
  RuntimePageSnapshot,
  StepDiagnostic,
  StepDiagnosticKind,
  StepLog,
  StepLogStatus,
  StrategyAttempt,
  TargetResolutionDiagnostic,
} from "./types.js";
