import "./env-setup.js";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "electron";

import type { AnyFlowDocument, FlowDocument } from "@flowweave/flow-dsl";
import type { PageSnapshotSummary } from "@flowweave/page-intelligence";
import {
  ProjectKnowledgeRepository,
  getDefaultDataDir,
  resolveRunDirectory,
  type ExecutionResult as KnowledgeExecutionResult,
  type FlowImportResult,
  type FlowRevisionRecord,
  type ProjectEnvironment,
} from "@flowweave/project-knowledge";
import {
  executeFlow,
  type ExecutionOptions,
  type ExecutionResult as RuntimeExecutionResult,
} from "@flowweave/runtime";
import { FLOW_SCHEMA_VERSION, FlowWeaveError } from "@flowweave/shared";
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
  StudioExecutionScreenshotPreviewRequest,
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
  apiDeleteExecution,
  apiGetExecution,
  apiExportFlow,
  apiGetFlow,
  apiGetFlowRevision,
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

const MAX_STRUCTURED_ARTIFACT_BYTES = 1_048_576;

function isSameFileIdentity(
  left: { dev: number | bigint; ino: number | bigint },
  right: { dev: number | bigint; ino: number | bigint },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/** 仅读取受控运行目录下的固定 JSON 文件；任何类型、链接或身份异常都 fail closed。 */
function readStructuredArtifact<T>(runDirectory: string, fileName: string): T | undefined {
  let descriptor: number | undefined;
  try {
    for (const directory of [
      dirname(dirname(dirname(runDirectory))),
      dirname(dirname(runDirectory)),
      dirname(runDirectory),
      runDirectory,
    ]) {
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return undefined;
    }
    const target = join(runDirectory, fileName);
    const pathStat = lstatSync(target);
    if (
      !pathStat.isFile() ||
      pathStat.isSymbolicLink() ||
      pathStat.nlink !== 1 ||
      pathStat.size <= 0 ||
      pathStat.size > MAX_STRUCTURED_ARTIFACT_BYTES
    ) {
      return undefined;
    }
    descriptor = openSync(
      target,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const openedStat = fstatSync(descriptor);
    if (
      !openedStat.isFile() ||
      openedStat.nlink !== 1 ||
      openedStat.size !== pathStat.size ||
      !isSameFileIdentity(openedStat, pathStat)
    ) {
      return undefined;
    }
    const bytes = Buffer.alloc(openedStat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (read === 0) return undefined;
      offset += read;
    }
    const afterReadStat = fstatSync(descriptor);
    const afterPathStat = lstatSync(target);
    if (
      afterReadStat.size !== openedStat.size ||
      !isSameFileIdentity(afterReadStat, openedStat) ||
      !isSameFileIdentity(afterPathStat, openedStat)
    ) {
      return undefined;
    }
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // 关闭失败时不向 renderer 暴露底层文件系统信息。
      }
    }
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
  step: Pick<ExecutionStepLog, "stepId" | "stepIndex" | "stepType" | "message">,
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

function normalizePageSnapshotSummary(value: unknown): PageSnapshotSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const readBoundedString = (field: string, maxLength: number): string | undefined => {
    const item = record[field];
    return typeof item === "string" && item.length <= maxLength ? item : undefined;
  };
  const readCount = (field: string): number | undefined => {
    const item = record[field];
    return Number.isSafeInteger(item) && (item as number) >= 0 && (item as number) <= 1_000_000
      ? (item as number)
      : undefined;
  };
  const url = readBoundedString("url", 16_384);
  const title = readBoundedString("title", 4_096);
  const capturedAt = readBoundedString("capturedAt", 128);
  const formCount = readCount("formCount");
  const buttonCount = readCount("buttonCount");
  const linkCount = readCount("linkCount");
  if (
    url === undefined ||
    title === undefined ||
    capturedAt === undefined ||
    formCount === undefined ||
    buttonCount === undefined ||
    linkCount === undefined
  ) {
    return undefined;
  }
  return { url, title, capturedAt, formCount, buttonCount, linkCount };
}

function readStepArtifacts(
  step: Pick<
    ExecutionStepLog,
    "stepId" | "stepIndex" | "stepType" | "message"
  >,
  runDirectory: string,
  pageSnapshots = new Map<number, PageSnapshotSummary>(),
): Pick<ExecutionStepLog, "diagnostic" | "pageSnapshot" | "hasDiagnostic" | "hasPageSnapshot"> {
  const pageSnapshot = normalizePageSnapshotSummary(pageSnapshots.get(step.stepIndex));
  const diagnostic = normalizeStepDiagnostic(
    readStructuredArtifact(runDirectory, `step-${step.stepIndex}-diagnostic.json`),
    step,
  );
  const normalizedPageSnapshot =
    pageSnapshot ??
    normalizePageSnapshotSummary(
      readStructuredArtifact(runDirectory, `page-${step.stepIndex}.json`),
    );

  return {
    hasDiagnostic: Boolean(diagnostic),
    diagnostic,
    hasPageSnapshot: Boolean(normalizedPageSnapshot),
    pageSnapshot: normalizedPageSnapshot,
  };
}

function mapRuntimeSteps(
  result: RuntimeExecutionResult,
  flow: FlowDocument | undefined,
  runDirectory: string,
): ExecutionStepLog[] {
  const pageSnapshots = new Map(
    (result.pageSnapshots ?? []).map((snapshot) => [
      snapshot.stepIndex,
      snapshot.summary,
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
      hasScreenshot: Boolean(step.screenshotPath),
    };

    return {
      ...mappedStep,
      ...readStepArtifacts(mappedStep, runDirectory, pageSnapshots),
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

function assertStudioRunSchemaVersion(flow: FlowDocument): void {
  const receivedSchemaVersion = (flow as { schemaVersion?: unknown }).schemaVersion;
  if (receivedSchemaVersion === FLOW_SCHEMA_VERSION) {
    return;
  }
  const safeReceivedVersion =
    typeof receivedSchemaVersion === "number" && Number.isFinite(receivedSchemaVersion)
      ? receivedSchemaVersion
      : receivedSchemaVersion === undefined
        ? "missing"
        : "invalid";
  throw new FlowWeaveError(
    "FLOW_SCHEMA_MISMATCH",
    `当前 Studio 运行入口仅支持 Flow Schema v${FLOW_SCHEMA_VERSION}`,
    {
      expectedVersion: FLOW_SCHEMA_VERSION,
      receivedVersion: safeReceivedVersion,
    },
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
  assertStudioRunSchemaVersion(flow);
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
    steps: mapRuntimeSteps(runtimeResult, flow, artifactDir),
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
      decorateStep: (_step, mappedStep) =>
        readStepArtifacts(
          mappedStep,
          resolveRunDirectory(getDefaultDataDir(), stored.projectId, stored.executionId),
        ),
    });
    executions.set(executionId, record);
    return record;
  }
  return executions.get(executionId) ?? null;
}

export function getExecutionScreenshotPreview(
  request: StudioExecutionScreenshotPreviewRequest,
) {
  return projectKnowledgeRepository.getExecutionScreenshotPreview(
    request.projectId,
    request.executionId,
    request.stepIndex,
  );
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

export async function deleteExecution(projectId: string, executionId: string) {
  const result = await apiDeleteExecution(projectKnowledgeRepository, projectId, executionId);
  executions.delete(executionId);
  return result;
}

export async function listFlows(
  projectId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    createdAt: string;
    revision: number;
    schemaVersion: number;
  }>
> {
  return apiListFlows(projectId);
}

export async function renameFlow(
  projectId: string,
  flowId: string,
  name: string,
  expectedRevision: number,
): Promise<{
  id: string;
  name: string;
  createdAt: string;
  revision: number;
  schemaVersion: number;
}> {
  const result = await apiRenameFlow(projectId, flowId, name, expectedRevision);
  return {
    id: result.flowId,
    name: result.name,
    createdAt: result.createdAt,
    revision: result.revision,
    schemaVersion: result.schemaVersion,
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
): Promise<AnyFlowDocument> {
  await assertProjectExistsForFileOperation(projectId);
  const revision = await apiGetFlowRevision(projectId, flowId);
  return revision.document.schemaVersion === FLOW_SCHEMA_VERSION
    ? revision.document
    : apiExportFlow(projectId, flowId);
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
  flowId: string,
  versionId: string,
): Promise<AnyFlowDocument | null> {
  return apiGetFlowVersion(projectId, flowId, versionId);
}

export async function restoreFlowVersion(
  projectId: string,
  flowId: string,
  versionId: string,
  expectedRevision: number,
): Promise<FlowRevisionRecord> {
  return apiRestoreFlowVersion(projectId, flowId, versionId, expectedRevision);
}
