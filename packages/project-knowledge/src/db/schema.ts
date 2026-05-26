import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const flows = sqliteTable("flows", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  documentJson: text("document_json").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const flowVersions = sqliteTable("flow_versions", {
  id: text("id").primaryKey(),
  flowId: text("flow_id")
    .notNull()
    .references(() => flows.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  documentJson: text("document_json").notNull(),
  changeMessage: text("change_message"),
  createdAt: text("created_at").notNull(),
});

export const executions = sqliteTable("executions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  flowId: text("flow_id")
    .notNull()
    .references(() => flows.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export const projectEnvironments = sqliteTable("project_environments", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const pageSnapshots = sqliteTable("page_snapshots", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
  summaryJson: text("summary_json").notNull(),
  snapshotPath: text("snapshot_path"),
  capturedAt: text("captured_at").notNull(),
});

export const executionSteps = sqliteTable("execution_steps", {
  id: text("id").primaryKey(),
  executionId: text("execution_id")
    .notNull()
    .references(() => executions.id, { onDelete: "cascade" }),
  stepIndex: integer("step_index").notNull(),
  stepId: text("step_id").notNull(),
  status: text("status").notNull(),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  screenshotPath: text("screenshot_path"),
});
