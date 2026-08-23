import {
  parseFlowDocument,
  type FlowPortabilityWarning,
  type FlowPortabilityWarningCode,
} from "@flowweave/flow-dsl";

import { formatExportSuccessStatus } from "./export-feedback.js";
import type { ExportFlowResponse } from "./messages.js";

type ExportFlowSuccessResponse = Extract<ExportFlowResponse, { ok: true }>;

type ValidatedExportPayload = Pick<
  ExportFlowSuccessResponse,
  "json" | "filename" | "warnings" | "summary"
>;

export type ExportFlowDownloadResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

const bareFlowDocumentKeys = new Set([
  "schemaVersion",
  "id",
  "projectId",
  "name",
  "description",
  "variables",
  "steps",
  "meta",
]);

const flowPortabilityWarningCodes: ReadonlySet<FlowPortabilityWarningCode> = new Set([
  "secret-default-removed",
  "sensitive-variable-hardened",
  "password-value-variableized",
  "password-hint-removed",
  "upload-path-variableized",
  "url-userinfo-removed",
  "url-query-variableized",
  "url-fragment-variableized",
]);

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function snapshotPortabilityWarning(input: unknown): FlowPortabilityWarning | null {
  if (!isRecord(input)) return null;
  Object.keys(input);
  const code = input.code;
  const path = input.path;
  const message = input.message;
  const variableName = input.variableName;

  if (
    typeof code !== "string" ||
    !flowPortabilityWarningCodes.has(code as FlowPortabilityWarningCode) ||
    typeof path !== "string" ||
    path.length === 0 ||
    typeof message !== "string" ||
    message.length === 0 ||
    (variableName !== undefined && typeof variableName !== "string")
  ) {
    return null;
  }

  return variableName === undefined
    ? { code: code as FlowPortabilityWarningCode, path, message }
    : { code: code as FlowPortabilityWarningCode, path, message, variableName };
}

function isBareFlowDocumentJson(json: string): boolean {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    return false;
  }

  if (!isRecord(input)) return false;
  if (Object.keys(input).some((key) => !bareFlowDocumentKeys.has(key))) return false;

  try {
    parseFlowDocument(input);
    return true;
  } catch {
    return false;
  }
}

function validateExportFlowSuccess(input: Record<string, unknown>): ValidatedExportPayload | null {
  const json = input.json;
  const filename = input.filename;
  const warningsInput = input.warnings;
  const summaryInput = input.summary;

  if (typeof json !== "string" || typeof filename !== "string") return null;
  if (filename.trim().length === 0 || !Array.isArray(warningsInput)) return null;
  const warningsLength = warningsInput.length;
  const warnings: FlowPortabilityWarning[] = [];
  for (let index = 0; index < warningsLength; index += 1) {
    const warning = snapshotPortabilityWarning(warningsInput[index]);
    if (warning === null) return null;
    warnings.push(warning);
  }

  if (!isRecord(summaryInput)) return null;
  Object.keys(summaryInput);
  const warningCount = summaryInput.warningCount;
  const businessTextReviewRequired = summaryInput.businessTextReviewRequired;
  if (typeof warningCount !== "number" || !Number.isInteger(warningCount) || warningCount < 0) {
    return null;
  }
  if (warningCount !== warnings.length) return null;
  if (businessTextReviewRequired !== true) return null;
  if (!isBareFlowDocumentJson(json)) return null;

  return {
    json,
    filename,
    warnings,
    summary: { warningCount, businessTextReviewRequired },
  };
}

export function processExportFlowDownload(
  response: unknown,
  download: (filename: string, json: string) => void,
): ExportFlowDownloadResult {
  try {
    if (!isRecord(response)) {
      return { ok: false, error: "导出响应无效" };
    }
    Object.keys(response);
    const ok = response.ok;
    if (ok === false) {
      return { ok: false, error: "导出失败" };
    }
    if (ok !== true) {
      return { ok: false, error: "导出响应无效" };
    }

    const validated = validateExportFlowSuccess(response);
    if (validated === null) {
      return { ok: false, error: "导出响应无效" };
    }

    try {
      download(validated.filename, validated.json);
    } catch {
      return { ok: false, error: "下载未完成" };
    }

    return {
      ok: true,
      status: formatExportSuccessStatus(validated.summary),
    };
  } catch {
    return { ok: false, error: "导出响应无效" };
  }
}
