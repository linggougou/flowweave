import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

export type ProjectDatabase = BetterSQLite3Database<typeof schema>;

const STORE_FILENAME = "store.sqlite";

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flows (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flow_id TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS execution_steps (
  id TEXT PRIMARY KEY NOT NULL,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  screenshot_path TEXT
);

CREATE TABLE IF NOT EXISTS project_environments (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS page_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  summary_json TEXT NOT NULL,
  snapshot_path TEXT,
  captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flows_project_id ON flows(project_id);
CREATE INDEX IF NOT EXISTS idx_page_snapshots_project_id ON page_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_executions_project_id ON executions(project_id);
CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id ON execution_steps(execution_id);
`;

/** 将 `~` 展开为本机 home 目录 */
export function expandHomePath(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/** 项目 SQLite 文件路径：`~/.flowweave/projects/<id>/store.sqlite` */
export function resolveProjectStorePath(
  projectId: string,
  dataDir = "~/.flowweave/projects",
): string {
  const root = expandHomePath(dataDir);
  return join(root, projectId, STORE_FILENAME);
}

/** 打开（或创建）项目数据库并初始化表结构 */
export function openProjectDatabase(
  projectId: string,
  dataDir = "~/.flowweave/projects",
): { db: ProjectDatabase; sqlite: Database.Database; storePath: string } {
  const storePath = resolveProjectStorePath(projectId, dataDir);
  mkdirSync(dirname(storePath), { recursive: true });

  const sqlite = new Database(storePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(INIT_SQL);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite, storePath };
}

/** 关闭数据库连接 */
export function closeProjectDatabase(sqlite: Database.Database): void {
  sqlite.close();
}
