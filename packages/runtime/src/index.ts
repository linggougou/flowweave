export const RUNTIME_PHASE = "P1" as const;

export { executeFlow } from "./playwright-runner.js";
export type { ExecutionOptions } from "./types.js";
export type {
  ExecutionResult,
  ExecutionStatus,
  StepLog,
  StepLogStatus,
} from "./types.js";
