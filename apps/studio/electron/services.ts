import "./env-setup.js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { FlowDocument } from "@flowweave/flow-dsl";
import type { PageSnapshotSummary } from "@flowweave/page-intelligence";
import {
  ProjectKnowledgeRepository,
  type ExecutionResult as KnowledgeExecutionResult,
  type ProjectEnvironment,
} from "@flowweave/project-knowledge";
import { executeFlow, type ExecutionResult as RuntimeExecutionResult } from "@flowweave/runtime";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { isChromiumInstalled } from "./env-setup.js";
import type {
  ExecutionStepLog,
  ExecutionSummary,
  RunFlowOptions,
  RunFlowVariableValue,
  StudioStepDiagnostic,
  StudioExecution,
  StudioExecutionRunContext,
  StudioFlowVersion,
  StudioProject,
  StudioProjectEnvironment,
} from "../src/shared/studio-api-types.js";
import {
  buildExecutionFragilityIssues,
  resolveExecutionFlow,
} from "../src/shared/execution-fragility.js";
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
const projectKnowledgeRepository = new ProjectKnowledgeRepository();

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const loginFixtureUrl = pathToFileURL(
  join(repoRoot, "examples/fixtures/login.html"),
).href;

const SEED_PROJECT_NAME = "登录演示";
const SEED_FLOW_ID = "flow_login_fixture";

function toStudioProjectEnvironment(
  environment: ProjectEnvironment,
): StudioProjectEnvironment {
  return {
    name: environment.name,
    baseUrl: environment.baseUrl,
    isDefault: environment.isDefault,
    storageStatePath: environment.storageStatePath,
  };
}

function buildFallbackEnvironments(baseUrl?: string): StudioProjectEnvironment[] {
  if (!baseUrl) {
    return [];
  }
  return [
    {
      name: "默认环境",
      baseUrl,
      isDefault: true,
    },
  ];
}

function loadProjectEnvironments(
  projectId: string,
  fallbackBaseUrl?: string,
): StudioProjectEnvironment[] {
  const environment = projectKnowledgeRepository.getDefaultEnvironment(projectId);
  if (environment) {
    return [toStudioProjectEnvironment(environment)];
  }
  return buildFallbackEnvironments(fallbackBaseUrl);
}

function mapProject(project: {
  id: string;
  name: string;
  createdAt: string;
  baseUrl?: string;
}): StudioProject {
  const environments = loadProjectEnvironments(project.id, project.baseUrl);
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    baseUrl: environments[0]?.baseUrl ?? project.baseUrl,
    environments,
  };
}

function normalizeOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

type ResolvedRunEnvironment = {
  name: string;
  baseUrl?: string;
  storageStatePath?: string;
};

function resolveRunEnvironment(
  projectId: string,
  options: RunFlowServiceOptions,
): ResolvedRunEnvironment {
  const stored = projectKnowledgeRepository.getDefaultEnvironment(projectId);
  const name = normalizeOptionalString(options.environmentName) ?? stored?.name ?? "默认环境";
  const baseUrl = normalizeOptionalString(options.baseUrl) ?? stored?.baseUrl;
  const storageStatePath =
    normalizeOptionalString(options.storageStatePath) ?? stored?.storageStatePath;
  const shouldPersist =
    options.environmentName !== undefined ||
    options.baseUrl !== undefined ||
    options.storageStatePath !== undefined;

  if (shouldPersist && baseUrl) {
    projectKnowledgeRepository.saveEnvironment(
      projectId,
      name,
      baseUrl,
      true,
      storageStatePath,
    );
  }

  return {
    name,
    baseUrl,
    storageStatePath,
  };
}

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
    return mapProject(first);
  }
  const project = await apiCreateProject(SEED_PROJECT_NAME);
  projectKnowledgeRepository.saveEnvironment(project.id, "默认环境", loginFixtureUrl, true);
  await apiSaveFlow(project.id, buildLoginFixtureFlow(project.id));
  return mapProject({ ...project, baseUrl: loginFixtureUrl });
}

export async function listProjects(): Promise<StudioProject[]> {
  await ensureSeedProject();
  const projects = await apiListProjects();
  return projects.map((project) => mapProject(project));
}

export async function createProject(name: string): Promise<StudioProject> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("项目名称不能为空");
  }
  const project = await apiCreateProject(trimmed);
  return mapProject(project);
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

function readJsonArtifact<T>(filePath?: string): T | undefined {
  if (!filePath || !existsSync(filePath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

function resolveStepLabel(
  flow: FlowDocument | undefined,
  stepIndex: number,
  fallback: string,
): string {
  const step = flow?.steps[stepIndex];
  return step?.label ?? step?.type ?? fallback;
}

function inferPageSnapshotPath(step: {
  stepIndex: number;
  screenshotPath?: string;
  diagnosticPath?: string;
}): string | undefined {
  const artifactPath = step.diagnosticPath ?? step.screenshotPath;
  if (!artifactPath) {
    return undefined;
  }
  const candidate = join(dirname(artifactPath), `page-${step.stepIndex}.json`);
  return existsSync(candidate) ? candidate : undefined;
}

function readStepArtifacts(
  step: Pick<ExecutionStepLog, "stepIndex" | "screenshotPath" | "diagnosticPath">,
  pageSnapshots = new Map<number, { filePath: string; summary: PageSnapshotSummary }>(),
): Pick<ExecutionStepLog, "diagnostic" | "pageSnapshot" | "pageSnapshotPath"> {
  const pageSnapshot = pageSnapshots.get(step.stepIndex);
  const pageSnapshotPath = pageSnapshot?.filePath ?? inferPageSnapshotPath(step);

  return {
    diagnostic: readJsonArtifact<StudioStepDiagnostic>(step.diagnosticPath),
    pageSnapshotPath,
    pageSnapshot:
      pageSnapshot?.summary ?? readJsonArtifact<PageSnapshotSummary>(pageSnapshotPath),
  };
}

function mapRuntimeSteps(
  result: RuntimeExecutionResult,
  flow?: FlowDocument,
): ExecutionStepLog[] {
  const pageSnapshots = new Map(
    (result.pageSnapshots ?? []).map((snapshot) => [
      snapshot.stepIndex,
      { filePath: snapshot.filePath, summary: snapshot.summary },
    ]),
  );

  return result.steps.map((step) => {
    const mappedStep: ExecutionStepLog = {
      stepIndex: step.stepIndex,
      stepId: step.stepId,
      label: resolveStepLabel(flow, step.stepIndex, step.type),
      status: step.status === "success" ? "passed" : "failed",
      message: step.message,
      startedAt: step.startedAt,
      finishedAt: step.endedAt,
      durationMs: step.durationMs,
      screenshotPath: step.screenshotPath,
      diagnosticPath: step.diagnosticPath,
    };

    return {
      ...mappedStep,
      ...readStepArtifacts(mappedStep, pageSnapshots),
    };
  });
}

function toKnowledgeExecution(
  runtime: RuntimeExecutionResult,
  flowId: string,
  flowSnapshot: FlowDocument,
  runContext?: StudioExecutionRunContext,
): KnowledgeExecutionResult {
  const finishedAt = new Date().toISOString();
  return {
    executionId: runtime.executionId,
    flowId,
    status: runtime.status === "success" ? "success" : "failed",
    startedAt: runtime.steps[0]?.startedAt,
    finishedAt,
    flowSnapshot,
    runContext,
    steps: runtime.steps.map((step) => ({
      stepIndex: step.stepIndex,
      stepId: step.stepId,
      status: step.status === "success" ? "passed" : "failed",
      durationMs: step.durationMs,
      errorMessage: step.message,
      screenshotPath: step.screenshotPath,
      diagnosticPath: step.diagnosticPath,
    })),
  };
}

function toRunContext(
  environment: ResolvedRunEnvironment,
  variables?: Record<string, RunFlowVariableValue>,
): StudioExecutionRunContext {
  return {
    environmentName: environment.name,
    baseUrl: environment.baseUrl,
    storageStatePath: environment.storageStatePath,
    variables,
  };
}

export type RunFlowServiceOptions = RunFlowOptions;

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
  const environment = resolveRunEnvironment(projectId, options);

  if (!isChromiumInstalled()) {
    throw new Error(
      "未检测到 Playwright Chromium。请在项目根目录执行：\npnpm --filter @flowweave/runtime exec playwright install chromium\n完成后请完全退出并重新打开 Studio。",
    );
  }

  const runtimeResult = await executeFlow(flow, {
    headless: !showBrowser,
    executionId,
    artifactDir,
    baseUrl: environment.baseUrl,
    storageStatePath: environment.storageStatePath,
    variables: options.variables,
    environmentName: environment.name,
  });
  const runContext = toRunContext(environment, options.variables);
  await apiSaveExecution(projectId, toKnowledgeExecution(runtimeResult, flow.id, flow, runContext));

  for (const snap of runtimeResult.pageSnapshots ?? []) {
    await apiSavePageSnapshot(projectId, snap.summary, snap.filePath);
  }

  const record: StudioExecution = {
    executionId: runtimeResult.executionId,
    projectId,
    flowId: flow.id,
    status: runtimeResult.status === "success" ? "passed" : "failed",
    steps: mapRuntimeSteps(runtimeResult, flow),
    startedAt,
    finishedAt: new Date().toISOString(),
    environmentName: runContext.environmentName,
    runContext,
    fragilityIssues: buildExecutionFragilityIssues(flow, runContext),
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
  flow?: FlowDocument,
): StudioExecution {
  const startedAt = stored.startedAt ?? new Date(0).toISOString();
  const runContext = stored.runContext;
  const executionFlow = resolveExecutionFlow(stored.flowSnapshot, flow);
  return {
    executionId: stored.executionId,
    projectId: stored.projectId,
    flowId: stored.flowId,
    status: mapKnowledgeStatus(stored.status),
    startedAt,
    finishedAt: stored.finishedAt,
    environmentName: runContext?.environmentName,
    runContext,
    steps: stored.steps.map((step) => {
      const mappedStep: ExecutionStepLog = {
        stepIndex: step.stepIndex,
        stepId: step.stepId,
        label: resolveStepLabel(executionFlow, step.stepIndex, step.stepId),
        status: step.status,
        message: step.errorMessage,
        durationMs: step.durationMs,
        startedAt,
        finishedAt: stored.finishedAt,
        screenshotPath: step.screenshotPath,
        diagnosticPath: step.diagnosticPath,
      };

      return {
        ...mappedStep,
        ...readStepArtifacts(mappedStep),
      };
    }),
    fragilityIssues: buildExecutionFragilityIssues(executionFlow, runContext),
  };
}

export async function getExecution(executionId: string): Promise<StudioExecution | null> {
  const cached = executions.get(executionId);
  if (cached) {
    return cached;
  }
  const stored = await apiGetExecution(executionId);
  if (stored) {
    let flow: FlowDocument | undefined;
    if (!stored.flowSnapshot) {
      try {
        flow = await apiGetFlow(stored.projectId, stored.flowId);
      } catch {
        flow = undefined;
      }
    }

    const record = fromKnowledgeExecution(stored, flow);
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
    environmentName: item.runContext?.environmentName,
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
