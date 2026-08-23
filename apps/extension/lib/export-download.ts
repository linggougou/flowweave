import {
  parseFlowDocument,
  type FlowPortabilityWarning,
} from "@flowweave/flow-dsl";

import { formatExportSuccessStatus } from "./export-feedback.js";
import type { ExportFlowResponse } from "./messages.js";

type ExportFlowSuccessResponse = Extract<ExportFlowResponse, { ok: true }>;

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

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isPortabilityWarning(input: unknown): input is FlowPortabilityWarning {
  if (!isRecord(input)) return false;
  return (
    typeof input.code === "string" &&
    input.code.length > 0 &&
    typeof input.path === "string" &&
    input.path.length > 0 &&
    typeof input.message === "string" &&
    input.message.length > 0 &&
    (input.variableName === undefined || typeof input.variableName === "string")
  );
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

function validateExportFlowResponse(input: unknown): ExportFlowSuccessResponse | null {
  if (!isRecord(input) || input.ok !== true) return null;
  if (typeof input.json !== "string" || typeof input.filename !== "string") return null;
  if (input.filename.trim().length === 0 || !Array.isArray(input.warnings)) return null;
  if (!input.warnings.every(isPortabilityWarning)) return null;
  if (!isRecord(input.summary)) return null;

  const warningCount = input.summary.warningCount;
  if (typeof warningCount !== "number" || !Number.isInteger(warningCount) || warningCount < 0) {
    return null;
  }
  if (warningCount !== input.warnings.length) return null;
  if (input.summary.businessTextReviewRequired !== true) return null;
  if (!isBareFlowDocumentJson(input.json)) return null;

  return input as ExportFlowSuccessResponse;
}

export function processExportFlowDownload(
  response: unknown,
  download: (filename: string, json: string) => void,
): ExportFlowDownloadResult {
  if (isRecord(response) && response.ok === false) {
    return {
      ok: false,
      error:
        typeof response.error === "string" && response.error.trim().length > 0
          ? response.error
          : "导出失败",
    };
  }

  const validated = validateExportFlowResponse(response);
  if (validated === null) {
    return { ok: false, error: "导出响应无效" };
  }

  try {
    download(validated.filename, validated.json);
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? `导出失败：${error.message}` : "导出失败",
    };
  }

  return {
    ok: true,
    status: formatExportSuccessStatus(validated.summary),
  };
}
