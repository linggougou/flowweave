import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import Database from "better-sqlite3";

const execId = process.argv[2];
if (!execId) {
  console.error("Usage: tsx scripts/inspect-execution.ts <executionId>");
  process.exit(1);
}

const root = join(homedir(), ".flowweave", "projects");
let found = false;

for (const dir of readdirSync(root)) {
  const dbPath = join(root, dir, "store.sqlite");
  if (!existsSync(dbPath)) continue;

  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare("SELECT * FROM executions WHERE id = ?").get(execId) as
    | { id: string; flow_id: string; status: string }
    | undefined;
  if (!row) {
    db.close();
    continue;
  }

  found = true;
  console.log("projectId:", dir);
  console.log("execution:", row);

  const steps = db
    .prepare("SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY step_index")
    .all(execId) as Array<{
    step_index: number;
    step_id: string;
    status: string;
    error_message: string | null;
  }>;
  for (const s of steps) {
    console.log(
      `  step ${s.step_index}: ${s.step_id} ${s.status} ${s.error_message ?? ""}`,
    );
  }

  const flowRow = db
    .prepare("SELECT id, name, document_json FROM flows WHERE id = ?")
    .get(row.flow_id) as { id: string; name: string; document_json: string } | undefined;

  if (flowRow) {
    const doc = JSON.parse(flowRow.document_json) as {
      steps: Array<{
        type: string;
        id?: string;
        url?: string;
        target?: { strategies: Array<Record<string, unknown>> };
      }>;
    };
    console.log("\nflow:", flowRow.name, flowRow.id);
    for (const [i, s] of doc.steps.entries()) {
      const strategies = s.target?.strategies ?? [];
      console.log(`${i + 1}. ${s.type}`, JSON.stringify(strategies, null, 0));
    }
  }

  db.close();
}

if (!found) {
  console.log("execution not found");
  process.exit(1);
}
