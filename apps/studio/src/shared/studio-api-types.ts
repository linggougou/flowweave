/** 渲染进程与 preload 共享的 Studio API 类型 */
import type { FlowDocument, NormalizedStep } from "@flowweave/flow-dsl";
import type { FragilityIssue, PageSnapshotSummary } from "@flowweave/page-intelligence";

export type RunFlowVariableValue = string | number | boolean;

export type StudioExecutionRunContext = {
  environmentName?: string;
  baseUrl?: string;
  storageStatePath?: string;
  variables?: Record<string, RunFlowVariableValue>;
};

export type StudioFlowRunInput = {
  executionId: string;
  finishedAt?: string;
  environmentName?: string;
  baseUrl?: string;
  storageStatePath?: string;
  variables?: Record<string, string>;
};

export type StudioRunPreflightIssue = {
  code:
    | "MISSING_BASE_URL"
    | "MISSING_REQUIRED_VARIABLE"
    | "STORAGE_STATE_PATH_NOT_FOUND";
  field: string;
  message: string;
};

export type StudioExecutionCompatibilityWarning = {
  code: "FLOW_SNAPSHOT_MISSING" | "RUN_CONTEXT_MISSING";
  severity: "warning";
  message: string;
};

export type StudioProjectEnvironment = {
  name: string;
  baseUrl: string;
  isDefault: boolean;
  storageStatePath?: string;
};

export type StudioProject = {
  id: string;
  name: string;
  createdAt: string;
  baseUrl?: string;
  environments: StudioProjectEnvironment[];
};

export type ExecutionStepLog = {
  stepIndex: number;
  stepId: string;
  label: string;
  stepType?: NormalizedStep["type"];
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  message?: string;
  durationMs?: number;
  startedAt: string;
  finishedAt?: string;
  screenshotPath?: string;
  diagnosticPath?: string;
  diagnostic?: StudioStepDiagnostic;
  pageSnapshotPath?: string;
  pageSnapshot?: PageSnapshotSummary;
};

export type StudioDiagnosticTargetHints = {
  tagName?: string;
  inputType?: string;
  nameAttr?: string;
  placeholder?: string;
  labelText?: string;
  textSample?: string;
  scopeText?: string;
  scopeKind?: "row" | "listitem" | "dialog" | "tabpanel" | "section" | "card";
};

export type StudioDiagnosticStrategyAttempt = {
  label: string;
  matchedCount: number;
  visibleCount?: number;
  success: boolean;
  error?: string;
};

export type StudioDiagnosticKind = "target-resolution" | "runtime-error";

export type StudioStepDiagnosticBase = {
  stepId: string;
  stepIndex: number;
  stepType?: NormalizedStep["type"];
  message?: string;
  errorCode?: string;
  cause?: string;
  url?: string;
  title?: string;
};

export type StudioTargetResolutionDiagnostic = StudioStepDiagnosticBase & {
  kind?: "target-resolution";
  strategyAttempts: StudioDiagnosticStrategyAttempt[];
  targetHints?: StudioDiagnosticTargetHints;
};

export type StudioRuntimeErrorDiagnostic = StudioStepDiagnosticBase & {
  kind: "runtime-error";
  stepType: NormalizedStep["type"];
  message: string;
};

export type StudioStepDiagnostic =
  | StudioTargetResolutionDiagnostic
  | StudioRuntimeErrorDiagnostic;

export function isRuntimeErrorDiagnostic(
  diagnostic: StudioStepDiagnostic | undefined,
): diagnostic is StudioRuntimeErrorDiagnostic {
  return diagnostic?.kind === "runtime-error";
}

export function isTargetResolutionDiagnostic(
  diagnostic: StudioStepDiagnostic | undefined,
): diagnostic is StudioTargetResolutionDiagnostic {
  return Boolean(diagnostic && diagnostic.kind !== "runtime-error");
}

export type StudioExecution = {
  executionId: string;
  projectId: string;
  flowId: string;
  status: "pending" | "running" | "passed" | "failed";
  steps: ExecutionStepLog[];
  startedAt: string;
  finishedAt?: string;
  environmentName?: string;
  flowSnapshot?: FlowDocument;
  runContext?: StudioExecutionRunContext;
  fragilityIssues?: FragilityIssue[];
};

export type RunFlowResult = {
  executionId: string;
  status: StudioExecution["status"];
};

/** 运行流程时的选项；showBrowser 为 true 时弹出 Playwright 浏览器窗口 */
export type RunFlowOptions = {
  showBrowser?: boolean;
  environmentName?: string;
  baseUrl?: string;
  storageStatePath?: string;
  variables?: Record<string, RunFlowVariableValue>;
};

export type ExecutionSummary = {
  executionId: string;
  flowId: string;
  status: StudioExecution["status"];
  startedAt?: string;
  finishedAt?: string;
  environmentName?: string;
};

export type StudioFlowRef = {
  id: string;
  name: string;
  createdAt: string;
};

export type StudioFlowVersion = {
  id: string;
  flowId: string;
  version: number;
  name: string;
  stepCount: number;
  createdAt: string;
  changeMessage?: string;
};

export type StudioApi = {
  listProjects: () => Promise<StudioProject[]>;
  createProject: (name: string) => Promise<StudioProject>;
  listFlows: (projectId: string) => Promise<StudioFlowRef[]>;
  renameFlow: (
    projectId: string,
    flowId: string,
    name: string,
  ) => Promise<StudioFlowRef>;
  getFlow: (projectId: string, flowId: string) => Promise<FlowDocument>;
  getFlowRunInput: (projectId: string, flowId: string) => Promise<StudioFlowRunInput | null>;
  runFlow: (
    projectId: string,
    flowId?: string,
    options?: RunFlowOptions,
  ) => Promise<RunFlowResult>;
  getExecution: (executionId: string) => Promise<StudioExecution | null>;
  listExecutions: (projectId: string) => Promise<ExecutionSummary[]>;
  listFlowVersions: (projectId: string, flowId: string) => Promise<StudioFlowVersion[]>;
  getFlowVersion: (projectId: string, versionId: string) => Promise<FlowDocument | null>;
  restoreFlowVersion: (projectId: string, versionId: string) => Promise<FlowDocument>;
  openPath: (filePath: string) => Promise<{ ok: true }>;
};

declare global {
  interface Window {
    flowweaveStudio: StudioApi;
  }
}

export {};
