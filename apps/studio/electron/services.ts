import "./env-setup.js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "electron";

import type { FlowDocument } from "@flowweave/flow-dsl";
import type { PageSnapshotSummary } from "@flowweave/page-intelligence";
import {
  ProjectKnowledgeRepository,
  type ExecutionResult as KnowledgeExecutionResult,
  type FlowImportResult,
  type ProjectEnvironment,
} from "@flowweave/project-knowledge";
import {
  executeFlow,
  type ExecutionOptions,
  type ExecutionResult as RuntimeExecutionResult,
} from "@flowweave/runtime";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { isChromiumInstalled } from "./env-setup.js";
import type {
  ExecutionStepLog,
  ExecutionSummary,
  RunFlowOptions,
  RunFlowVariableValue,
  StudioDiagnosticTargetHints,
  StudioStepDiagnostic,
  StudioDiagnosticStrategyAttempt,
  StudioExecution,
  StudioExecutionRunContext,
  StudioFlowVersion,
  StudioProject,
  StudioProjectEnvironment,
} from "../src/shared/studio-api-types.js";
import { resolveStudioResourcePaths } from "./resource-paths.js";
import { buildExecutionFragilityIssues } from "../src/shared/execution-fragility.js";
import {
  mapStoredExecutionToStudioExecution,
  shouldUseCachedExecution,
} from "../src/shared/execution-history.js";
import { toVariableInputString } from "../src/shared/run-input-state.js";
import {
  omitSensitiveVariables,
  redactSensitiveVariables,
} from "../src/shared/sensitive-variables.js";
import {
  apiAllocateRunDirectory,
  apiCreateProject,
  apiGetExecution,
  apiGetFlow,
  apiGetFlowVersion,
  apiImportFlow,
  apiListExecutions,
  apiListFlowVersions,
  apiListFlows,
  apiListProjects,
  apiRenameFlow,
  apiRestoreFlowVersion,
  apiSaveExecution,
  apiSaveFlow,
  apiSavePageSnapshot,
  configureLocalKnowledgeRepository,
} from "./knowledge-client.js";

const executions = new Map<string, StudioExecution>();
const studioResourcePaths = resolveStudioResourcePaths({
  isPackaged: app.isPackaged,
  moduleUrl: import.meta.url,
  resourcesPath: process.resourcesPath,
});
const projectKnowledgeRepository = new ProjectKnowledgeRepository({
  nativeBinding: studioResourcePaths.electronNativeBindingPath,
});

export function getProjectKnowledgeRepository(): ProjectKnowledgeRepository {
  return projectKnowledgeRepository;
}
if (app.isPackaged) {
  configureLocalKnowledgeRepository(projectKnowledgeRepository);
}
const loginFixtureUrl = pathToFileURL(studioResourcePaths.loginFixturePath).href;

const SEED_PROJECT_NAME = "登录演示";
const SEED_FLOW_ID = "flow_login_fixture";

function toStudioProjectEnvironment(environment: ProjectEnvironment): StudioProjectEnvironment {
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

function hasExplicitOption<K extends keyof RunFlowServiceOptions>(
  options: RunFlowServiceOptions,
  key: K,
): boolean {
  return Object.prototype.hasOwnProperty.call(options, key);
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
  const storedName = normalizeOptionalString(stored?.name) ?? "默认环境";
  const storedBaseUrl = normalizeOptionalString(stored?.baseUrl);
  const storedStorageStatePath = normalizeOptionalString(stored?.storageStatePath);
  const hasEnvironmentNameOverride = hasExplicitOption(options, "environmentName");
  const hasBaseUrlOverride = hasExplicitOption(options, "baseUrl");
  const hasStorageStatePathOverride = hasExplicitOption(options, "storageStatePath");

  const name = hasEnvironmentNameOverride
    ? (normalizeOptionalString(options.environmentName) ?? storedName)
    : storedName;
  const baseUrl = hasBaseUrlOverride ? normalizeOptionalString(options.baseUrl) : storedBaseUrl;
  const storageStatePath = hasStorageStatePathOverride
    ? normalizeOptionalString(options.storageStatePath)
    : storedStorageStatePath;
  const shouldPersist =
    hasEnvironmentNameOverride || hasBaseUrlOverride || hasStorageStatePathOverride;

  if (shouldPersist) {
    projectKnowledgeRepository.saveEnvironment(
      projectId,
      name,
      hasBaseUrlOverride ? (options.baseUrl?.trim() ?? "") : (storedBaseUrl ?? ""),
      true,
      hasStorageStatePathOverride ? storageStatePath : storedStorageStatePath,
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

function isStepType(value: unknown): value is NonNullable<ExecutionStepLog["stepType"]> {
  return typeof value === "string";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function normalizeStrategyAttempts(value: unknown): StudioDiagnosticStrategyAttempt[] {
  return Array.isArray(value) ? (value as StudioDiagnosticStrategyAttempt[]) : [];
}

function normalizeTargetHints(value: unknown): StudioDiagnosticTargetHints | undefined {
  return value && typeof value === "object" ? (value as StudioDiagnosticTargetHints) : undefined;
}

function normalizeStepDiagnostic(
  diagnostic: unknown,
  step: Pick<ExecutionStepLog, "stepId" | "stepIndex" | "stepType" | "message" | "diagnosticPath">,
): StudioStepDiagnostic | undefined {
  if (!diagnostic || typeof diagnostic !== "object") {
    return undefined;
  }

  const record = diagnostic as {
    kind?: string;
    stepId?: unknown;
    stepIndex?: unknown;
    stepType?: unknown;
    message?: unknown;
    errorCode?: unknown;
    cause?: unknown;
    url?: unknown;
    title?: unknown;
    strategyAttempts?: unknown;
    targetHints?: unknown;
  };
  const stepId = readString(record.stepId) ?? step.stepId;
  const stepIndex = readNumber(record.stepIndex) ?? step.stepIndex;
  const stepType = isStepType(record.stepType) ? record.stepType : step.stepType;
  const message = readString(record.message) ?? step.message;
  const errorCode = readString(record.errorCode);
  const cause = readString(record.cause);
  const url = readString(record.url);
  const title = readString(record.title);

  if (record.kind === "runtime-error") {
    if (!stepType || !message) {
      return undefined;
    }

    return {
      kind: "runtime-error",
      stepId,
      stepIndex,
      stepType,
      message,
      errorCode,
      cause,
      url,
      title,
    };
  }

  if (!Array.isArray(record.strategyAttempts)) {
    return undefined;
  }

  return {
    kind: "target-resolution",
    stepId,
    stepIndex,
    stepType,
    message,
    errorCode,
    cause,
    url,
    title,
    strategyAttempts: normalizeStrategyAttempts(record.strategyAttempts),
    targetHints: normalizeTargetHints(record.targetHints),
  };
}

function readStepArtifacts(
  step: Pick<
    ExecutionStepLog,
    "stepId" | "stepIndex" | "stepType" | "message" | "screenshotPath" | "diagnosticPath"
  >,
  pageSnapshots = new Map<number, { filePath: string; summary: PageSnapshotSummary }>(),
): Pick<ExecutionStepLog, "diagnostic" | "pageSnapshot" | "pageSnapshotPath"> {
  const pageSnapshot = pageSnapshots.get(step.stepIndex);
  const pageSnapshotPath = pageSnapshot?.filePath ?? inferPageSnapshotPath(step);

  return {
    diagnostic: normalizeStepDiagnostic(readJsonArtifact(step.diagnosticPath), step),
    pageSnapshotPath,
    pageSnapshot: pageSnapshot?.summary ?? readJsonArtifact<PageSnapshotSummary>(pageSnapshotPath),
  };
}

function mapRuntimeSteps(result: RuntimeExecutionResult, flow?: FlowDocument): ExecutionStepLog[] {
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
      stepType: step.type,
      status:
        step.status === "success" ? "passed" : step.status === "cancelled" ? "skipped" : "failed",
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
  startedAtFallback?: string,
): KnowledgeExecutionResult {
  const finishedAt = new Date().toISOString();
  return {
    executionId: runtime.executionId,
    flowId,
    status: runtime.status,
    startedAt: runtime.steps[0]?.startedAt ?? startedAtFallback,
    finishedAt,
    flowSnapshot,
    runContext,
    steps: runtime.steps.map((step) => ({
      stepIndex: step.stepIndex,
      stepId: step.stepId,
      status:
        step.status === "success" ? "passed" : step.status === "cancelled" ? "skipped" : "failed",
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
    variables: redactSensitiveVariables(variables),
  };
}

function ensureStorageStatePathExists(storageStatePath?: string): void {
  if (!storageStatePath) {
    return;
  }
  if (existsSync(storageStatePath)) {
    return;
  }
  throw new Error(`运行前检查未通过：Storage State 文件不存在：${storageStatePath}`);
}

function toStudioFlowRunInputVariables(
  variables?: Record<string, RunFlowVariableValue>,
): Record<string, string> | undefined {
  if (!variables) {
    return undefined;
  }
  const restorable = omitSensitiveVariables(variables);
  return Object.fromEntries(
    Object.entries(restorable ?? {}).map(([name, value]) => [name, toVariableInputString(value)]),
  );
}

export type RunFlowServiceOptions = RunFlowOptions &
  Pick<ExecutionOptions, "executionId" | "signal" | "onProgress">;

function mapRuntimeExecutionStatus(
  status: RuntimeExecutionResult["status"],
): StudioExecution["status"] {
  if (status === "success") {
    return "passed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return "failed";
}

export async function runFlow(
  projectId: string,
  flowId?: string,
  options: RunFlowServiceOptions = {},
): Promise<StudioExecution> {
  const flow = await resolveFlowForRun(projectId, flowId);
  const startedAt = new Date().toISOString();
  const executionId = options.executionId ?? randomUUID();
  const artifactDir = await apiAllocateRunDirectory(projectId, executionId);
  const showBrowser = options.showBrowser ?? true;
  const environment = resolveRunEnvironment(projectId, options);
  ensureStorageStatePathExists(environment.storageStatePath);

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
    signal: options.signal,
    onProgress: options.onProgress,
  });
  const runContext = toRunContext(environment, options.variables);
  await apiSaveExecution(
    projectId,
    toKnowledgeExecution(runtimeResult, flow.id, flow, runContext, startedAt),
  );

  for (const snap of runtimeResult.pageSnapshots ?? []) {
    await apiSavePageSnapshot(projectId, snap.summary, snap.filePath);
  }

  const record: StudioExecution = {
    executionId: runtimeResult.executionId,
    projectId,
    flowId: flow.id,
    status: mapRuntimeExecutionStatus(runtimeResult.status),
    steps: mapRuntimeSteps(runtimeResult, flow),
    startedAt,
    finishedAt: new Date().toISOString(),
    environmentName: runContext.environmentName,
    flowSnapshot: flow,
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

export async function getFlowRunInput(
  projectId: string,
  flowId: string,
): Promise<{
  executionId: string;
  finishedAt?: string;
  environmentName?: string;
  baseUrl?: string;
  storageStatePath?: string;
  variables?: Record<string, string>;
} | null> {
  const latest = projectKnowledgeRepository.getLatestExecutionForFlow(projectId, flowId);
  if (!latest?.runContext) {
    return null;
  }

  return {
    executionId: latest.executionId,
    finishedAt: latest.finishedAt,
    environmentName: latest.runContext.environmentName,
    baseUrl: latest.runContext.baseUrl,
    storageStatePath: latest.runContext.storageStatePath,
    variables: toStudioFlowRunInputVariables(latest.runContext.variables),
  };
}

function mapKnowledgeStatus(status: KnowledgeExecutionResult["status"]): StudioExecution["status"] {
  if (status === "success") {
    return "passed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return "failed";
}

export async function getExecution(executionId: string): Promise<StudioExecution | null> {
  const cached = executions.get(executionId);
  if (cached && shouldUseCachedExecution(cached)) {
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

    const record = mapStoredExecutionToStudioExecution(stored, {
      fallbackFlow: flow,
      decorateStep: (_step, mappedStep) => readStepArtifacts(mappedStep),
    });
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

export async function assertProjectExistsForFileOperation(projectId: string): Promise<void> {
  const projects = await apiListProjects();
  if (!projects.some((project) => project.id === projectId)) {
    throw new Error("目标项目不存在");
  }
}

export async function getFlowForExport(
  projectId: string,
  flowId: string,
): Promise<FlowDocument> {
  await assertProjectExistsForFileOperation(projectId);
  return apiGetFlow(projectId, flowId);
}

export async function importFlowDocument(
  projectId: string,
  input: unknown,
): Promise<FlowImportResult> {
  return apiImportFlow(projectId, input);
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
