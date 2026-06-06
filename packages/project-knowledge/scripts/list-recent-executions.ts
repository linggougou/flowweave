import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import Database from "better-sqlite3";

const root = join(homedir(), ".flowweave", "projects");

for (const dir of readdirSync(root)) {
  const dbPath = join(root, dir, "store.sqlite");
  if (!existsSync(dbPath)) continue;

  const db = new Database(dbPath, { readonly: true });
  const projects = db.prepare("SELECT id, name FROM projects").all() as Array<{
    id: string;
    name: string;
  }>;
  const projectName = projects[0]?.name ?? dir;

  const rows = db
    .prepare(
      "SELECT id, flow_id, status, started_at FROM executions ORDER BY started_at DESC LIMIT 8",
    )
    .all() as Array<{ id: string; flow_id: string; status: string; started_at: string }>;

  if (rows.length === 0) {
    db.close();
    continue;
  }

  console.log(`\n=== ${projectName} (${dir}) ===`);
  for (const r of rows) {
    console.log(r.id, r.status, r.started_at, r.flow_id.slice(0, 12));
    if (r.id.includes("056749e5") || r.id === "056749e5-42b0-4e23-a85c-f1751128fa88") {
      const steps = db
        .prepare(
          "SELECT step_index, step_id, status, error_message FROM execution_steps WHERE execution_id = ? ORDER BY step_index",
        )
        .all(r.id) as Array<{
        step_index: number;
        step_id: string;
        status: string;
        error_message: string | null;
      }>;
      for (const s of steps) {
        console.log(`  ${s.step_index} ${s.step_id} ${s.status} ${s.error_message ?? ""}`);
      }
    }
  }
  db.close();
}
