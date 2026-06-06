import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";

import type { FlowDocument } from "@flowweave/flow-dsl";
import { parseFlowDocument } from "@flowweave/flow-dsl";
import { and, asc, desc, eq, max } from "drizzle-orm";

import {
  closeProjectDatabase,
  expandHomePath,
  openProjectDatabase,
  resolveProjectStorePath,
} from "./db/client.js";
import { ensureRunDirectory } from "./paths.js";
import * as dbSchema from "./db/schema.js";
import type { PageSnapshotSummary } from "@flowweave/page-intelligence";

import type {
  ExecutionResult,
  ExecutionWithProject,
  FlowVersionRecord,
  PageSnapshotRecord,
  ProjectEnvironment,
  ProjectRef,
  StepLog,
} from "./types.js";

const EXECUTION_STATUSES = ["success", "failed", "cancelled"] as const;
const STEP_STATUSES = ["passed", "failed", "skipped"] as const;

function parseExecutionStatus(status: string): ExecutionResult["status"] {
  return EXECUTION_STATUSES.includes(status as ExecutionResult["status"])
    ? (status as ExecutionResult["status"])
    : "failed";
}

function parseStepStatus(status: string): StepLog["status"] {
  return STEP_STATUSES.includes(status as StepLog["status"])
    ? (status as StepLog["status"])
    : "failed";
}

export type ProjectKnowledgeRepositoryOptions = {
  /** 覆盖默认数据目录，测试时传入临时目录 */
  dataDir?: string;
};

export class ProjectKnowledgeRepository {
  private readonly dataDir: string;

  constructor(options: ProjectKnowledgeRepositoryOptions = {}) {
    this.dataDir = expandHomePath(options.dataDir ?? "~/.flowweave/projects");
  }

  /** 为单次执行创建 `runs/<executionId>/` 目录 */
  allocateRunDirectory(projectId: string, executionId: string): string {
    return ensureRunDirectory(this.dataDir, projectId, executionId);
  }

  createProject(name: string): ProjectRef {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { db, sqlite } = openProjectDatabase(id, this.dataDir);

    try {
      db.insert(dbSchema.projects)
        .values({
          id,
          name,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } finally {
      closeProjectDatabase(sqlite);
    }

    this.ensureDefaultEnvironment(id, "默认环境", "https://example.com");
    return { id, name, createdAt: now };
  }

  ensureDefaultEnvironment(projectId: string, name: string, baseUrl: string): ProjectEnvironment {
    const existing = this.getDefaultEnvironment(projectId);
    if (existing) {
      return existing;
    }
    return this.saveEnvironment(projectId, name, baseUrl, true);
  }

  saveEnvironment(
    projectId: string,
    name: string,
    baseUrl: string,
    isDefault = false,
  ): ProjectEnvironment {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      if (isDefault) {
        db.update(dbSchema.projectEnvironments)
          .set({ isDefault: 0 })
          .where(eq(dbSchema.projectEnvironments.projectId, projectId))
          .run();
      }
      db.insert(dbSchema.projectEnvironments)
        .values({
          id,
          projectId,
          name,
          baseUrl,
          isDefault: isDefault ? 1 : 0,
          createdAt: now,
        })
        .run();
    } finally {
      closeProjectDatabase(sqlite);
    }
    return { id, projectId, name, baseUrl, isDefault };
  }

  getDefaultEnvironment(projectId: string): ProjectEnvironment | null {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      const row =
        db
          .select()
          .from(dbSchema.projectEnvironments)
          .where(
            and(
              eq(dbSchema.projectEnvironments.projectId, projectId),
              eq(dbSchema.projectEnvironments.isDefault, 1),
            ),
          )
          .get() ?? null;
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        projectId: row.projectId,
        name: row.name,
        baseUrl: row.baseUrl,
        isDefault: row.isDefault === 1,
      };
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  savePageSnapshot(
    projectId: string,
    summary: PageSnapshotSummary,
    snapshotPath?: string,
  ): PageSnapshotRecord {
    const id = randomUUID();
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      db.insert(dbSchema.pageSnapshots)
        .values({
          id,
          projectId,
          url: summary.url,
          title: summary.title,
          summaryJson: JSON.stringify(summary),
          snapshotPath: snapshotPath ?? null,
          capturedAt: summary.capturedAt,
        })
        .run();
    } finally {
      closeProjectDatabase(sqlite);
    }
    return {
      id,
      projectId,
      url: summary.url,
      title: summary.title,
      snapshotPath,
      capturedAt: summary.capturedAt,
    };
  }

  listPageSnapshots(projectId: string, limit = 20): PageSnapshotRecord[] {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      return db
        .select()
        .from(dbSchema.pageSnapshots)
        .where(eq(dbSchema.pageSnapshots.projectId, projectId))
        .orderBy(desc(dbSchema.pageSnapshots.capturedAt))
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          projectId: row.projectId,
          url: row.url,
          title: row.title ?? undefined,
          snapshotPath: row.snapshotPath ?? undefined,
          capturedAt: row.capturedAt,
        }));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  saveFlow(projectId: string, flow: FlowDocument, changeMessage?: string): void {
    const parsed = parseFlowDocument(flow);
    const document = {
      ...parsed,
      projectId,
    };
    const documentJson = JSON.stringify(document);

    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      const now = new Date().toISOString();
      const row = {
        id: document.id,
        projectId,
        name: document.name,
        documentJson,
        schemaVersion: document.schemaVersion,
        createdAt: document.meta.createdAt,
        updatedAt: now,
      };

      const existing = db
        .select()
        .from(dbSchema.flows)
        .where(eq(dbSchema.flows.id, document.id))
        .get();

      if (existing) {
        if (existing.documentJson !== documentJson) {
          this.appendFlowVersion(db, {
            projectId,
            flowId: document.id,
            documentJson: existing.documentJson,
            changeMessage: changeMessage ?? "保存前自动快照",
            createdAt: now,
          });
        }
        db.update(dbSchema.flows).set(row).where(eq(dbSchema.flows.id, document.id)).run();
      } else {
        db.insert(dbSchema.flows).values(row).run();
      }
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  getFlowInProject(projectId: string, flowId: string): FlowDocument | null {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      const row = db
        .select()
        .from(dbSchema.flows)
        .where(eq(dbSchema.flows.id, flowId))
        .get();
      if (!row) {
        return null;
      }
      return parseFlowDocument(JSON.parse(row.documentJson));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  listFlowVersions(projectId: string, flowId: string, limit = 50): FlowVersionRecord[] {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      return db
        .select()
        .from(dbSchema.flowVersions)
        .where(
          and(
            eq(dbSchema.flowVersions.projectId, projectId),
            eq(dbSchema.flowVersions.flowId, flowId),
          ),
        )
        .orderBy(desc(dbSchema.flowVersions.version))
        .limit(limit)
        .all()
        .map((row) => this.toFlowVersionRecord(row));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  getFlowVersion(projectId: string, versionId: string): FlowDocument | null {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      const row = db
        .select()
        .from(dbSchema.flowVersions)
        .where(
          and(
            eq(dbSchema.flowVersions.projectId, projectId),
            eq(dbSchema.flowVersions.id, versionId),
          ),
        )
        .get();
      if (!row) {
        return null;
      }
      return parseFlowDocument(JSON.parse(row.documentJson));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  restoreFlowVersion(projectId: string, versionId: string): FlowDocument {
    const document = this.getFlowVersion(projectId, versionId);
    if (!document) {
      throw new Error(`未找到版本: ${versionId}`);
    }
    this.saveFlow(projectId, document, "从版本恢复");
    return document;
  }

  private appendFlowVersion(
    db: ReturnType<typeof openProjectDatabase>["db"],
    input: {
      projectId: string;
      flowId: string;
      documentJson: string;
      changeMessage?: string;
      createdAt: string;
    },
  ): void {
    const maxRow = db
      .select({ value: max(dbSchema.flowVersions.version) })
      .from(dbSchema.flowVersions)
      .where(eq(dbSchema.flowVersions.flowId, input.flowId))
      .get();
    const nextVersion = (maxRow?.value ?? 0) + 1;

    db.insert(dbSchema.flowVersions)
      .values({
        id: randomUUID(),
        flowId: input.flowId,
        projectId: input.projectId,
        version: nextVersion,
        documentJson: input.documentJson,
        changeMessage: input.changeMessage ?? null,
        createdAt: input.createdAt,
      })
      .run();
  }

  private toFlowVersionRecord(
    row: typeof dbSchema.flowVersions.$inferSelect,
  ): FlowVersionRecord {
    const doc = parseFlowDocument(JSON.parse(row.documentJson));
    return {
      id: row.id,
      flowId: row.flowId,
      projectId: row.projectId,
      version: row.version,
      name: doc.name,
      stepCount: doc.steps.length,
      createdAt: row.createdAt,
      changeMessage: row.changeMessage ?? undefined,
    };
  }

  saveExecution(projectId: string, result: ExecutionResult): void {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      db.insert(dbSchema.executions)
        .values({
          id: result.executionId,
          projectId,
          flowId: result.flowId,
          status: result.status,
          startedAt: result.startedAt ?? null,
          finishedAt: result.finishedAt ?? null,
        })
        .run();

      if (result.steps.length > 0) {
        db.insert(dbSchema.executionSteps)
          .values(
            result.steps.map((step) => ({
              id: randomUUID(),
              executionId: result.executionId,
              stepIndex: step.stepIndex,
              stepId: step.stepId,
              status: step.status,
              durationMs: step.durationMs ?? null,
              errorMessage: step.errorMessage ?? null,
              screenshotPath: step.screenshotPath ?? null,
            })),
          )
          .run();
      }
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  listProjects(): ProjectRef[] {
    let entries: string[];
    try {
      entries = readdirSync(this.dataDir);
    } catch {
      return [];
    }

    const projects: ProjectRef[] = [];
    for (const entry of entries) {
      const storePath = resolveProjectStorePath(entry, this.dataDir);
      try {
        statSync(storePath);
      } catch {
        continue;
      }

      const { db, sqlite } = openProjectDatabase(entry, this.dataDir);
      try {
        const row = db.select().from(dbSchema.projects).get();
        if (row) {
          projects.push({
            id: row.id,
            name: row.name,
            createdAt: row.createdAt,
          });
        }
      } finally {
        closeProjectDatabase(sqlite);
      }
    }

    return projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  listFlows(projectId: string): Array<{ id: string; name: string; createdAt: string }> {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      return db
        .select({
          id: dbSchema.flows.id,
          name: dbSchema.flows.name,
          createdAt: dbSchema.flows.createdAt,
        })
        .from(dbSchema.flows)
        .orderBy(desc(dbSchema.flows.createdAt))
        .all();
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 仅更新 Flow 名称（不新增版本快照） */
  renameFlow(projectId: string, flowId: string, name: string): FlowDocument {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Flow 名称不能为空");
    }

    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      const row = db
        .select()
        .from(dbSchema.flows)
        .where(eq(dbSchema.flows.id, flowId))
        .get();
      if (!row) {
        throw new Error("Flow 不存在");
      }

      const document = parseFlowDocument(JSON.parse(row.documentJson));
      const now = new Date().toISOString();
      const updated: FlowDocument = {
        ...document,
        name: trimmed,
        meta: {
          ...document.meta,
          updatedAt: now,
        },
      };

      db.update(dbSchema.flows)
        .set({
          name: trimmed,
          documentJson: JSON.stringify(updated),
          updatedAt: now,
        })
        .where(eq(dbSchema.flows.id, flowId))
        .run();

      return updated;
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  getFlow(flowId: string): FlowDocument | null {
    let entries: string[];
    try {
      entries = readdirSync(this.dataDir);
    } catch {
      return null;
    }

    for (const entry of entries) {
      const storePath = resolveProjectStorePath(entry, this.dataDir);
      try {
        statSync(storePath);
      } catch {
        continue;
      }

      const { db, sqlite } = openProjectDatabase(entry, this.dataDir);
      try {
        const row = db
          .select()
          .from(dbSchema.flows)
          .where(eq(dbSchema.flows.id, flowId))
          .get();
        if (row) {
          return parseFlowDocument(JSON.parse(row.documentJson));
        }
      } finally {
        closeProjectDatabase(sqlite);
      }
    }

    return null;
  }

  listExecutions(projectId: string, limit = 50): ExecutionResult[] {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      const rows = db
        .select()
        .from(dbSchema.executions)
        .where(eq(dbSchema.executions.projectId, projectId))
        .orderBy(desc(dbSchema.executions.startedAt), desc(dbSchema.executions.finishedAt))
        .limit(limit)
        .all();

      return rows.map((row) => this.assembleExecution(db, row));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  getExecution(executionId: string): ExecutionWithProject | null {
    let entries: string[];
    try {
      entries = readdirSync(this.dataDir);
    } catch {
      return null;
    }

    for (const entry of entries) {
      const storePath = resolveProjectStorePath(entry, this.dataDir);
      try {
        statSync(storePath);
      } catch {
        continue;
      }

      const { db, sqlite } = openProjectDatabase(entry, this.dataDir);
      try {
        const row = db
          .select()
          .from(dbSchema.executions)
          .where(eq(dbSchema.executions.id, executionId))
          .get();
        if (row) {
          return {
            projectId: row.projectId,
            ...this.assembleExecution(db, row),
          };
        }
      } finally {
        closeProjectDatabase(sqlite);
      }
    }

    return null;
  }

  private assembleExecution(
    db: ReturnType<typeof openProjectDatabase>["db"],
    executionRow: typeof dbSchema.executions.$inferSelect,
  ): ExecutionResult {
    const stepRows = db
      .select()
      .from(dbSchema.executionSteps)
      .where(eq(dbSchema.executionSteps.executionId, executionRow.id))
      .orderBy(asc(dbSchema.executionSteps.stepIndex))
      .all();

    return {
      executionId: executionRow.id,
      flowId: executionRow.flowId,
      status: parseExecutionStatus(executionRow.status),
      startedAt: executionRow.startedAt ?? undefined,
      finishedAt: executionRow.finishedAt ?? undefined,
      steps: stepRows.map((step) => ({
        stepIndex: step.stepIndex,
        stepId: step.stepId,
        status: parseStepStatus(step.status),
        durationMs: step.durationMs ?? undefined,
        errorMessage: step.errorMessage ?? undefined,
        screenshotPath: step.screenshotPath ?? undefined,
      })),
    };
  }
}
