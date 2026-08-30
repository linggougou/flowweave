import {
  FLOW_SCHEMA_VERSION_V1,
  FLOW_SCHEMA_VERSION_V2,
  FlowWeaveError,
  SUPPORTED_FLOW_SCHEMA_VERSIONS,
  type FlowWeaveErrorCode,
} from "@flowweave/shared";
import { flowDocumentSchema, type FlowDocumentV1 } from "./schema.js";
import {
  collectFlowBindingsV2,
  flowDocumentV2Schema,
  type FlowBindingV2,
  type FlowDocumentV2,
} from "./v2-schema.js";

export type AnyFlowDocument = FlowDocumentV1 | FlowDocumentV2;
export type SupportedFlowDocument = AnyFlowDocument;
export type FlowV2IssueSummary = {
  code: FlowWeaveErrorCode;
  path: (string | number)[];
  message: string;
};

export function parseFlowDocumentV1(input: unknown): FlowDocumentV1 {
  return flowDocumentSchema.parse(input);
}

export function parseFlowDocumentV2(input: unknown): FlowDocumentV2 {
  const result = flowDocumentV2Schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const issues: FlowV2IssueSummary[] = result.error.issues.map((issue) => ({
    code:
      issue.code === "custom" &&
      typeof issue.params?.flowCode === "string" &&
      issue.params.flowCode.startsWith("FLOW_")
        ? (issue.params.flowCode as FlowWeaveErrorCode)
        : "FLOW_V2_STRUCTURE_INVALID",
    path: issue.path,
    message: issue.message,
  }));
  const first = issues[0] ?? {
    code: "FLOW_V2_STRUCTURE_INVALID" as const,
    path: [],
    message: "v2 Flow 结构无效",
  };
  throw new FlowWeaveError(first.code, `v2 Flow 校验失败：${first.message}`, { issues });
}

export function parseFlowDocument(input: unknown): AnyFlowDocument {
  const schemaVersion =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (schemaVersion === FLOW_SCHEMA_VERSION_V1) {
    return parseFlowDocumentV1(input);
  }
  if (schemaVersion === FLOW_SCHEMA_VERSION_V2) {
    return parseFlowDocumentV2(input);
  }
  throw new FlowWeaveError("FLOW_SCHEMA_VERSION_UNSUPPORTED", "Flow schemaVersion 不受支持", {
    received:
      typeof schemaVersion === "string" || typeof schemaVersion === "number" ? schemaVersion : null,
    supported: [...SUPPORTED_FLOW_SCHEMA_VERSIONS],
  });
}

export function isFlowDocumentV1(document: AnyFlowDocument): document is FlowDocumentV1 {
  return document.schemaVersion === FLOW_SCHEMA_VERSION_V1;
}

export function isFlowDocumentV2(document: AnyFlowDocument): document is FlowDocumentV2 {
  return document.schemaVersion === FLOW_SCHEMA_VERSION_V2;
}

export type CompiledFlowDocumentV2 = {
  document: FlowDocumentV2;
  bindings: FlowBindingV2[];
};

export function compileFlowDocumentV2(input: unknown): CompiledFlowDocumentV2 {
  const document = parseFlowDocumentV2(input);
  return { document, bindings: collectFlowBindingsV2(document) };
}
