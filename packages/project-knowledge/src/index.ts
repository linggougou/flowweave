export const PROJECT_KNOWLEDGE_PHASE = "P2" as const;

export {
  getDefaultDataDir,
  resolveRunDirectory,
  assertSafeResourceId,
} from "./paths.js";
export type {
  ProjectRef,
  ProjectEnvironment,
  PageSnapshotRecord,
  FlowVersionRecord,
  FlowImportResult,
  ExecutionRunContext,
  ExecutionResult,
  ExecutionVariableValue,
  ExecutionWithProject,
  ExecutionDeletionResult,
  ExecutionScreenshotPreviewResult,
  StepLog,
} from "./types.js";
export { ProjectKnowledgeRepository } from "./repository.js";
export type { ProjectKnowledgeRepositoryOptions } from "./repository.js";
export {
  expandHomePath,
  openProjectDatabase,
  closeProjectDatabase,
  resolveProjectStorePath,
} from "./db/client.js";
export type { ProjectDatabaseNativeOptions } from "./db/client.js";
export * as projectKnowledgeSchema from "./db/schema.js";
