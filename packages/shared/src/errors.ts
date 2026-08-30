export type FlowWeaveErrorCode =
  | "UNKNOWN"
  | "VALIDATION_FAILED"
  | "FLOW_SCHEMA_MISMATCH"
  | "FLOW_SCHEMA_VERSION_UNSUPPORTED"
  | "FLOW_V2_STRUCTURE_INVALID"
  | "FLOW_DUPLICATE_ID"
  | "FLOW_DUPLICATE_LABEL"
  | "FLOW_FIELD_REFERENCE_UNKNOWN"
  | "FLOW_FIELD_REFERENCE_FUTURE"
  | "FLOW_BINDING_TARGET_FORBIDDEN"
  | "FLOW_BINDING_MIXED_TEMPLATE_FORBIDDEN"
  | "FLOW_BINDING_TYPE_MISMATCH"
  | "FLOW_SENSITIVE_POLICY_INVALID"
  | "FLOW_SELECTION_CONTEXT_INVALID"
  | "FLOW_UPGRADE_BLOCKED"
  | "FLOW_REVISION_CONFLICT"
  | "FLOW_DOWNGRADE_UNSUPPORTED"
  | "FLOW_PERSISTENCE_FAILED"
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
