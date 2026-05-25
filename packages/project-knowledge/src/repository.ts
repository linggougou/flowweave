import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";

import type { FlowDocument } from "@flowweave/flow-dsl";
import { parseFlowDocument } from "@flowweave/flow-dsl";
import { eq } from "drizzle-orm";

import {
  closeProjectDatabase,
  expandHomePath,
  openProjectDatabase,
  resolveProjectStorePath,
} from "./db/client.js";
import * as dbSchema from "./db/schema.js";
import type { ExecutionResult, ProjectRef } from "./types.js";

export type ProjectKnowledgeRepositoryOptions = {
  /** 覆盖默认数据目录，测试时传入临时目录 */
  dataDir?: string;
};

export class ProjectKnowledgeRepository {
  private readonly dataDir: string;

  constructor(options: ProjectKnowledgeRepositoryOptions = {}) {
    this.dataDir = expandHomePath(options.dataDir ?? "~/.flowweave/projects");
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

    return { id, name, createdAt: now };
  }

  saveFlow(projectId: string, flow: FlowDocument): void {
    const parsed = parseFlowDocument(flow);
    const document = {
      ...parsed,
      projectId,
    };

    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      const now = new Date().toISOString();
      const row = {
        id: document.id,
        projectId,
        name: document.name,
        documentJson: JSON.stringify(document),
        schemaVersion: document.schemaVersion,
        createdAt: document.meta.createdAt,
        updatedAt: now,
      };

      const existing = db
        .select({ id: dbSchema.flows.id })
        .from(dbSchema.flows)
        .where(eq(dbSchema.flows.id, document.id))
        .get();

      if (existing) {
        db.update(dbSchema.flows).set(row).where(eq(dbSchema.flows.id, document.id)).run();
      } else {
        db.insert(dbSchema.flows).values(row).run();
      }
    } finally {
      closeProjectDatabase(sqlite);
    }
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

  listFlows(projectId: string): Array<{ id: string; name: string }> {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir);
    try {
      return db
        .select({ id: dbSchema.flows.id, name: dbSchema.flows.name })
        .from(dbSchema.flows)
        .all();
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
}
