import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { FlowDocument } from "@flowweave/flow-dsl";
import {
  ProjectKnowledgeRepository,
  type ExecutionResult as KnowledgeExecutionResult,
  type ExecutionWithProject,
  type ProjectRef,
} from "@flowweave/project-knowledge";
import { analyzeFlowFragility } from "@flowweave/page-intelligence";
import { executeFlow, type ExecutionResult as RuntimeExecutionResult } from "@flowweave/runtime";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type {
  ExecutionStepLog,
  ExecutionSummary,
  StudioExecution,
  StudioFlowVersion,
  StudioProject,
} from "../src/shared/studio-api-types.js";

const repo = new ProjectKnowledgeRepository();
const executions = new Map<string, StudioExecution>();

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const loginFixtureUrl = pathToFileURL(
  join(repoRoot, "examples/fixtures/login.html"),
).href;

const SEED_PROJECT_NAME = "登录演示";
const SEED_FLOW_ID = "flow_login_fixture";

function buildLoginFixtureFlow(projectId: string): FlowDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: SEED_FLOW_ID,
    projectId,
    name: "登录 Fixture 流程",
    variables: [],
    steps: [
      {
        id: "s1",
        type: "navigate",
        url: loginFixtureUrl,
        waitUntil: "domcontentloaded",
      },
      {
        id: "s2",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#username" }] },
        value: "demo",
      },
      {
        id: "s3",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#password" }] },
        value: "secret",
      },
      {
        id: "s4",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "#submit" }] },
      },
    ],
    meta: {
      createdAt: now,
      updatedAt: now,
      source: "manual",
    },
  };
}

function ensureSeedProject(): ProjectRef {
  const existing = repo.listProjects();
  if (existing.length > 0) {
    const first = existing[0]!;
    const flows = repo.listFlows(first.id);
    if (flows.length === 0) {
      repo.saveFlow(first.id, buildLoginFixtureFlow(first.id));
    }
    return first;
  }
  const project = repo.createProject(SEED_PROJECT_NAME);
  repo.ensureDefaultEnvironment(project.id, "本地 Fixture", loginFixtureUrl);
  repo.saveFlow(project.id, buildLoginFixtureFlow(project.id));
  return project;
}

function mapProject(p: ProjectRef): StudioProject {
  const env = repo.getDefaultEnvironment(p.id);
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    baseUrl: env?.baseUrl,
  };
}

export async function listProjects(): Promise<StudioProject[]> {
  const seed = ensureSeedProject();
  repo.ensureDefaultEnvironment(seed.id, "本地 Fixture", loginFixtureUrl);
  return repo.listProjects().map(mapProject);
}

function resolveFlowForRun(projectId: string, flowId?: string): FlowDocument {
  if (flowId) {
    const doc = repo.getFlowInProject(projectId, flowId);
    if (!doc) {
      throw new Error(`未找到 Flow：${flowId}`);
    }
    return doc;
  }

  const flows = repo.listFlows(projectId);
  const first = flows[0];
  if (first) {
    const doc = repo.getFlowInProject(projectId, first.id);
    if (doc) {
      return doc;
    }
  }
  const flow = buildLoginFixtureFlow(projectId);
  repo.saveFlow(projectId, flow);
  return flow;
}

function mapRuntimeSteps(result: RuntimeExecutionResult): ExecutionStepLog[] {
  return result.steps.map((step) => ({
    stepIndex: step.stepIndex,
    stepId: step.stepId,
    label: step.type,
    status: step.status === "success" ? "passed" : "failed",
    message: step.message,
    startedAt: step.startedAt,
    finishedAt: step.endedAt,
    durationMs: step.durationMs,
    screenshotPath: step.screenshotPath,
  }));
}

function toKnowledgeExecution(
  runtime: RuntimeExecutionResult,
  flowId: string,
): KnowledgeExecutionResult {
  const finishedAt = new Date().toISOString();
  return {
    executionId: runtime.executionId,
    flowId,
    status: runtime.status === "success" ? "success" : "failed",
    startedAt: runtime.steps[0]?.startedAt,
    finishedAt,
    steps: runtime.steps.map((step) => ({
      stepIndex: step.stepIndex,
      stepId: step.stepId,
      status: step.status === "success" ? "passed" : "failed",
      durationMs: step.durationMs,
      errorMessage: step.message,
      screenshotPath: step.screenshotPath,
    })),
  };
}

export async function runFlow(projectId: string, flowId?: string): Promise<StudioExecution> {
  const flow = resolveFlowForRun(projectId, flowId);
  const startedAt = new Date().toISOString();
  const executionId = randomUUID();
  const artifactDir = repo.allocateRunDirectory(projectId, executionId);

  const runtimeResult = await executeFlow(flow, {
    headless: true,
    executionId,
    artifactDir,
  });
  repo.saveExecution(projectId, toKnowledgeExecution(runtimeResult, flow.id));

  for (const snap of runtimeResult.pageSnapshots ?? []) {
    repo.savePageSnapshot(projectId, snap.summary, snap.filePath);
  }

  const record: StudioExecution = {
    executionId: runtimeResult.executionId,
    projectId,
    flowId: flow.id,
    status: runtimeResult.status === "success" ? "passed" : "failed",
    steps: mapRuntimeSteps(runtimeResult),
    startedAt,
    finishedAt: new Date().toISOString(),
    fragilityWarnings: analyzeFlowFragility(flow)
      .filter((i) => i.severity === "warning")
      .map((i) => ({ stepId: i.stepId, message: i.message })),
  };

  if (runtimeResult.error) {
    const last = record.steps.at(-1);
    if (last) {
      last.message = runtimeResult.error.message;
    }
  }

  executions.set(record.executionId, record);
  return record;
}

function mapKnowledgeStatus(status: KnowledgeExecutionResult["status"]): StudioExecution["status"] {
  if (status === "success") {
    return "passed";
  }
  return "failed";
}

function fromKnowledgeExecution(
  stored: ExecutionWithProject,
): StudioExecution {
  const startedAt = stored.startedAt ?? new Date(0).toISOString();
  return {
    executionId: stored.executionId,
    projectId: stored.projectId,
    flowId: stored.flowId,
    status: mapKnowledgeStatus(stored.status),
    startedAt,
    finishedAt: stored.finishedAt,
    steps: stored.steps.map((step) => ({
      stepIndex: step.stepIndex,
      stepId: step.stepId,
      label: step.stepId,
      status: step.status,
      message: step.errorMessage,
      durationMs: step.durationMs,
      startedAt,
      finishedAt: stored.finishedAt,
      screenshotPath: step.screenshotPath,
    })),
  };
}

export function getExecution(executionId: string): StudioExecution | null {
  const stored = repo.getExecution(executionId);
  if (stored) {
    const record = fromKnowledgeExecution(stored);
    executions.set(executionId, record);
    return record;
  }
  return executions.get(executionId) ?? null;
}

export function listExecutions(projectId: string): ExecutionSummary[] {
  return repo.listExecutions(projectId, 5).map((item) => ({
    executionId: item.executionId,
    flowId: item.flowId,
    status: mapKnowledgeStatus(item.status),
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
  }));
}

export function listFlows(projectId: string): Array<{ id: string; name: string }> {
  return repo.listFlows(projectId);
}

export function listFlowVersions(projectId: string, flowId: string): StudioFlowVersion[] {
  return repo.listFlowVersions(projectId, flowId);
}

export function getFlowVersion(projectId: string, versionId: string): FlowDocument | null {
  return repo.getFlowVersion(projectId, versionId);
}

export function restoreFlowVersion(projectId: string, versionId: string): FlowDocument {
  return repo.restoreFlowVersion(projectId, versionId);
}
