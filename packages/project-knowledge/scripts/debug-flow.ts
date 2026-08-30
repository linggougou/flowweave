import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseFlowDocumentV1 } from "@flowweave/flow-dsl";
import { executeFlow } from "@flowweave/runtime";
import Database from "better-sqlite3";

const flowId = process.argv[2];
if (!flowId) {
  console.error("Usage: tsx scripts/debug-flow.ts <flowId> [projectId]");
  process.exit(1);
}

const projectId = process.argv[3] ?? "500109fa-6f81-4fd0-9c3c-d7d779e6eb65";
const dbPath = join(homedir(), ".flowweave", "projects", projectId, "store.sqlite");
const db = new Database(dbPath, { readonly: true });
const row = db.prepare("SELECT document_json FROM flows WHERE id = ?").get(flowId) as
  | { document_json: string }
  | undefined;
db.close();

if (!row) {
  console.error("flow not found");
  process.exit(1);
}

const flow = parseFlowDocumentV1(JSON.parse(row.document_json));
const artifactDir = join(homedir(), ".flowweave", "debug-run", flowId);
mkdirSync(artifactDir, { recursive: true });
writeFileSync(join(artifactDir, "flow.json"), JSON.stringify(flow, null, 2));

const result = await executeFlow(flow, { headless: true, artifactDir });

console.log(
  JSON.stringify(
    {
      status: result.status,
      error: result.error,
      steps: result.steps.map((s) => ({
        i: s.stepIndex,
        id: s.stepId,
        type: s.type,
        status: s.status,
        msg: s.message,
      })),
    },
    null,
    2,
  ),
);
