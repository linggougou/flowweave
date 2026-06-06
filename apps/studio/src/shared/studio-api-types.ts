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

export const studioActionStateResetCauses = [
  "fill-value-reset",
  "select-value-reset",
  "checked-state-reset",
] as const;

export type StudioActionStateResetCause = (typeof studioActionStateResetCauses)[number];

export type StudioRuntimeErrorCause = StudioActionStateResetCause | (string & {});

export type StudioActionStateResetDescriptor = {
  cause: StudioActionStateResetCause;
  label: string;
  title: string;
  explanation: string;
  suggestedAction: string;
};

const studioActionStateResetDescriptorMap: Record<
  StudioActionStateResetCause,
  StudioActionStateResetDescriptor
> = {
  "fill-value-reset": {
    cause: "fill-value-reset",
    label: "输入值被页面重置",
    title: "核对输入后是否被页面回写",
    explanation:
      "这通常说明字段是受控字段，页面会在 blur、格式化、接口回填或依赖字段变化后改写刚填入的值",
    suggestedAction:
      "检查该字段是否在 blur、格式化、接口回填或依赖字段变化后被脚本改写；必要时先补前置字段、等待联动完成，再重新录制到真实输入框。",
  },
  "select-value-reset": {
    cause: "select-value-reset",
    label: "下拉选项被页面重置",
    title: "核对下拉值是否被联动改回",
    explanation:
      "这通常说明页面在选择后又套用了默认值、联动规则或接口回填",
    suggestedAction:
      "确认录制值仍对应当前 option value，并检查该下拉是否会在加载默认值、上游字段变化或接口回填后自动改回；必要时在联动完成后重新录制选择步骤。",
  },
  "checked-state-reset": {
    cause: "checked-state-reset",
    label: "勾选状态被页面重置",
    title: "核对勾选状态是否被脚本撤销",
    explanation:
      "这通常说明页面在勾选后又触发了互斥规则、权限控制或异步回填",
    suggestedAction:
      "检查同组单选/复选互斥、权限开关、异步回填或前置字段校验是否在点击后把状态改回；必要时先完成前置步骤，再重新录制到真实勾选控件。",
  },
};

export type StudioDiagnosticKind = "target-resolution" | "runtime-error";

export type StudioStepDiagnosticBase = {
  stepId: string;
  stepIndex: number;
  stepType?: NormalizedStep["type"];
  message?: string;
  errorCode?: string;
  cause?: StudioRuntimeErrorCause;
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

export function isStudioActionStateResetCause(
  cause: string | undefined,
): cause is StudioActionStateResetCause {
  return (
    cause === "fill-value-reset" ||
    cause === "select-value-reset" ||
    cause === "checked-state-reset"
  );
}

export function getStudioActionStateResetDescriptor(
  cause: string | undefined,
): StudioActionStateResetDescriptor | undefined {
  if (!isStudioActionStateResetCause(cause)) {
    return undefined;
  }

  return studioActionStateResetDescriptorMap[cause];
}

export function formatStudioDiagnosticCause(cause: string | undefined): string | undefined {
  const descriptor = getStudioActionStateResetDescriptor(cause);
  if (descriptor) {
    return `${descriptor.label}（${descriptor.cause}）`;
  }

  return cause;
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
