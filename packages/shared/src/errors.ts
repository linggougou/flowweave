export type FlowWeaveErrorCode =
  | "UNKNOWN"
  | "VALIDATION_FAILED"
  | "FLOW_SCHEMA_MISMATCH"
  | "RUNTIME_STEP_FAILED"
  | "PROJECT_NOT_FOUND";

export class FlowWeaveError extends Error {
  readonly code: FlowWeaveErrorCode;
  readonly details?: unknown;

  constructor(code: FlowWeaveErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "FlowWeaveError";
    this.code = code;
    this.details = details;
  }
}
