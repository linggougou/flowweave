import { open, writeFile } from "node:fs/promises";
import { extname } from "node:path";

import {
  createPortableFlowDocument,
  parseFlowDocument,
  type FlowDocument,
} from "@flowweave/flow-dsl";
import type { FlowImportResult } from "@flowweave/project-knowledge";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

import type {
  StudioExportFlowFileResult,
  StudioImportFlowFileResult,
} from "../src/shared/studio-api-types.js";

export const FLOW_IMPORT_FILE_LIMIT_BYTES = 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;

type OpenDialogOptions = {
  title: string;
  properties: ["openFile"];
  filters: Array<{ name: string; extensions: string[] }>;
};

type SaveDialogOptions = {
  title: string;
  defaultPath: string;
  filters: Array<{ name: string; extensions: string[] }>;
};

type ImportFlowFileDependencies = {
  showOpenDialog: (
    options: OpenDialogOptions,
  ) => Promise<{ canceled: boolean; filePaths: string[] }>;
  importFlow: (projectId: string, input: unknown) => Promise<FlowImportResult>;
};

type ExportFlowFileDependencies = {
  showSaveDialog: (
    options: SaveDialogOptions,
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  getFlow: (projectId: string, flowId: string) => Promise<FlowDocument>;
  writeOutput?: (filePath: string, contents: string) => Promise<void>;
};

async function readFileWithinLimit(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, "r");
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (totalBytes <= FLOW_IMPORT_FILE_LIMIT_BYTES) {
      const remainingProbeBytes = FLOW_IMPORT_FILE_LIMIT_BYTES + 1 - totalBytes;
      const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, remainingProbeBytes));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      totalBytes += bytesRead;
      if (totalBytes > FLOW_IMPORT_FILE_LIMIT_BYTES) {
        throw new Error("Flow JSON 文件不能超过 1 MiB");
      }
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    await handle.close();
  }
}

function parseBareFlowDocument(contents: Buffer): FlowDocument {
  let input: unknown;
  try {
    input = JSON.parse(contents.toString("utf8"));
  } catch {
    throw new Error("Flow JSON 不是合法 JSON");
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Flow JSON 必须是 schemaVersion 1 的裸 FlowDocument");
  }
  const record = input as Record<string, unknown>;
  if ("flow" in record) {
    throw new Error("Flow JSON 必须是裸 FlowDocument，不能使用包装对象");
  }
  if (record.schemaVersion !== FLOW_SCHEMA_VERSION) {
    throw new Error("Flow JSON 仅支持 schemaVersion 1");
  }
  try {
    return parseFlowDocument(input);
  } catch {
    throw new Error("Flow JSON 必须是有效的 schemaVersion 1 裸 FlowDocument");
  }
}

function safeDefaultFileName(flowName: string): string {
  const withoutControlCharacters = Array.from(flowName.normalize("NFKC"), (character) =>
    character.codePointAt(0)! < 32 ? "-" : character,
  ).join("");
  const baseName = withoutControlCharacters
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  return `${baseName || "flow"}.json`;
}

export async function importFlowFromFile(
  projectId: string,
  dependencies: ImportFlowFileDependencies,
): Promise<StudioImportFlowFileResult> {
  const selection = await dependencies.showOpenDialog({
    title: "导入 Flow JSON",
    properties: ["openFile"],
    filters: [{ name: "Flow JSON", extensions: ["json"] }],
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return { status: "cancelled" };
  }
  if (selection.filePaths.length !== 1) {
    throw new Error("每次只能导入一个 Flow JSON 文件");
  }
  if (extname(selection.filePaths[0]!).toLowerCase() !== ".json") {
    throw new Error("导入文件必须是 .json 文件");
  }

  const contents = await readFileWithinLimit(selection.filePaths[0]!);
  const document = parseBareFlowDocument(contents);
  const result = await dependencies.importFlow(projectId, document);
  return { status: "imported", ...result };
}

export async function exportFlowToFile(
  projectId: string,
  flowId: string,
  dependencies: ExportFlowFileDependencies,
): Promise<StudioExportFlowFileResult> {
  const flow = await dependencies.getFlow(projectId, flowId);
  const portable = createPortableFlowDocument(flow);
  const selection = await dependencies.showSaveDialog({
    title: "导出 Flow JSON",
    defaultPath: safeDefaultFileName(flow.name),
    filters: [{ name: "Flow JSON", extensions: ["json"] }],
  });
  if (selection.canceled || !selection.filePath) {
    return { status: "cancelled" };
  }

  const contents = `${JSON.stringify(portable.document, null, 2)}\n`;
  const writeOutput =
    dependencies.writeOutput ??
    ((filePath: string, output: string) => writeFile(filePath, output, "utf8"));
  await writeOutput(selection.filePath, contents);
  return { status: "exported", warnings: portable.warnings };
}
