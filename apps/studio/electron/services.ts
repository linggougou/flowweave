import "./env-setup.js";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionResult as KnowledgeExecutionResult } from "@flowweave/project-knowledge";
import { analyzeFlowFragility } from "@flowweave/page-intelligence";
import { executeFlow, type ExecutionResult as RuntimeExecutionResult } from "@flowweave/runtime";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { isChromiumInstalled } from "./env-setup.js";
import type {
  ExecutionStepLog,
  ExecutionSummary,
  StudioExecution,
  StudioFlowVersion,
  StudioProject,
} from "../src/shared/studio-api-types.js";
import {
  apiAllocateRunDirectory,
  apiCreateProject,
  apiGetExecution,
  apiGetFlow,
  apiGetFlowVersion,
  apiListExecutions,
  apiListFlowVersions,
  apiListFlows,
  apiListProjects,
  apiRenameFlow,
  apiRestoreFlowVersion,
  apiSaveExecution,
  apiSaveFlow,
  apiSavePageSnapshot,
} from "./knowledge-client.js";

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

async function ensureSeedProject(): Promise<StudioProject> {
  const existing = await apiListProjects();
  if (existing.length > 0) {
    const first = existing[0]!;
    const flows = await apiListFlows(first.id);
    if (flows.length === 0) {
      await apiSaveFlow(first.id, buildLoginFixtureFlow(first.id));
    }
    return {
      id: first.id,
      name: first.name,
      createdAt: first.createdAt,
      baseUrl: first.baseUrl,
    };
  }
  const project = await apiCreateProject(SEED_PROJECT_NAME);
  await apiSaveFlow(project.id, buildLoginFixtureFlow(project.id));
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    baseUrl: loginFixtureUrl,
  };
}

export async function listProjects(): Promise<StudioProject[]> {
  await ensureSeedProject();
  const projects = await apiListProjects();
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    baseUrl: p.baseUrl,
  }));
}

export async function createProject(name: string): Promise<StudioProject> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("项目名称不能为空");
  }
  const project = await apiCreateProject(trimmed);
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
  };
}

async function resolveFlowForRun(projectId: string, flowId?: string): Promise<FlowDocument> {
  if (flowId) {
    return apiGetFlow(projectId, flowId);
  }

  const flows = await apiListFlows(projectId);
  const first = flows[0];
  if (first) {
    return apiGetFlow(projectId, first.id);
  }
  const flow = buildLoginFixtureFlow(projectId);
  await apiSaveFlow(projectId, flow);
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

export type RunFlowServiceOptions = {
  /** 为 true 时显示 Playwright 浏览器窗口（headless: false） */
  showBrowser?: boolean;
};

export async function runFlow(
  projectId: string,
  flowId?: string,
  options: RunFlowServiceOptions = {},
): Promise<StudioExecution> {
  const flow = await resolveFlowForRun(projectId, flowId);
  const startedAt = new Date().toISOString();
  const executionId = randomUUID();
  const artifactDir = await apiAllocateRunDirectory(projectId, executionId);
  const showBrowser = options.showBrowser ?? true;

  if (!isChromiumInstalled()) {
    throw new Error(
      "未检测到 Playwright Chromium。请在项目根目录执行：\npnpm --filter @flowweave/runtime exec playwright install chromium\n完成后请完全退出并重新打开 Studio。",
    );
  }

  const runtimeResult = await executeFlow(flow, {
    headless: !showBrowser,
    executionId,
    artifactDir,
  });
  await apiSaveExecution(projectId, toKnowledgeExecution(runtimeResult, flow.id));

  for (const snap of runtimeResult.pageSnapshots ?? []) {
    await apiSavePageSnapshot(projectId, snap.summary, snap.filePath);
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
  stored: Awaited<ReturnType<typeof apiGetExecution>> & object,
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

export async function getExecution(executionId: string): Promise<StudioExecution | null> {
  const stored = await apiGetExecution(executionId);
  if (stored) {
    const record = fromKnowledgeExecution(stored);
    executions.set(executionId, record);
    return record;
  }
  return executions.get(executionId) ?? null;
}

export async function listExecutions(projectId: string): Promise<ExecutionSummary[]> {
  const items = await apiListExecutions(projectId);
  return items.slice(0, 5).map((item) => ({
    executionId: item.executionId,
    flowId: item.flowId,
    status: mapKnowledgeStatus(item.status),
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
  }));
}

export async function listFlows(
  projectId: string,
): Promise<Array<{ id: string; name: string; createdAt: string }>> {
  return apiListFlows(projectId);
}

export async function renameFlow(
  projectId: string,
  flowId: string,
  name: string,
): Promise<{ id: string; name: string; createdAt: string }> {
  const result = await apiRenameFlow(projectId, flowId, name);
  return {
    id: result.flowId,
    name: result.name,
    createdAt: result.createdAt,
  };
}

export async function getFlow(projectId: string, flowId: string): Promise<FlowDocument> {
  return apiGetFlow(projectId, flowId);
}

export async function listFlowVersions(
  projectId: string,
  flowId: string,
): Promise<StudioFlowVersion[]> {
  return apiListFlowVersions(projectId, flowId);
}

export async function getFlowVersion(
  projectId: string,
  versionId: string,
): Promise<FlowDocument | null> {
  return apiGetFlowVersion(projectId, versionId);
}

export async function restoreFlowVersion(
  projectId: string,
  versionId: string,
): Promise<FlowDocument> {
  return apiRestoreFlowVersion(projectId, versionId);
}
