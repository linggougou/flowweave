/** 渲染进程与 preload 共享的 Studio API 类型 */
import type {
  FlowDocument,
  FlowPortabilityWarning,
  NormalizedStep,
} from "@flowweave/flow-dsl";
import type { FragilityIssue, PageSnapshotSummary } from "@flowweave/page-intelligence";
import type { ExecutionProgressEvent } from "@flowweave/runtime";

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

export type StudioDiagnosticCandidateSummary = {
  index: number;
  visible: boolean;
  tagName?: string;
  inputType?: string;
  nameAttr?: string;
  placeholder?: string;
  labelText?: string;
  textSample?: string;
  scopeKind?: StudioDiagnosticTargetHints["scopeKind"];
  scopeText?: string;
  score: number;
  matchedHints: string[];
};

export type StudioDiagnosticStrategyAttempt = {
  label: string;
  matchedCount: number;
  visibleCount?: number;
  success: boolean;
  error?: string;
  selectedIndex?: number;
  ambiguityReason?: string;
  candidateSummaries?: StudioDiagnosticCandidateSummary[];
};

export const studioActionStateResetCauses = [
  "fill-value-reset",
  "select-value-reset",
  "checked-state-reset",
  "upload-files-reset",
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
  "upload-files-reset": {
    cause: "upload-files-reset",
    label: "上传文件被页面清空",
    title: "核对上传控件是否被页面重建",
    explanation:
      "这通常说明页面在选择文件后重渲染了 input[type=file]，或者把已选文件列表又清空了一次",
    suggestedAction:
      "确认录制是否命中真实 input[type=file]，并检查上传壳层、重绘或联动脚本是否在选中文件后重建控件；必要时等待重绘完成后重新录制到最终 file input。",
  },
};

export const studioRuntimeCauseCategories = [
  "detached",
  "intercepted",
  "not-ready",
  "not-editable",
  "unknown",
] as const;

export type StudioRuntimeCauseCategory = (typeof studioRuntimeCauseCategories)[number];

export type StudioRuntimeCauseDescriptor = {
  category: StudioRuntimeCauseCategory;
  label: string;
  title: string;
  explanation: string;
  suggestedAction: string;
};

const studioRuntimeCauseDescriptorMap: Record<
  StudioRuntimeCauseCategory,
  StudioRuntimeCauseDescriptor
> = {
  detached: {
    category: "detached",
    label: "目标节点已重挂载",
    title: "重新对准最终渲染后的控件",
    explanation:
      "这通常说明页面在点击、按键或上传前后重渲染了目标，原来的 DOM 节点已经脱离当前页面",
    suggestedAction:
      "如果这是切换 tab、drawer、dialog 或动作面板后的新控件，先等待最终表面 ready，再重新录制到最终渲染后的按钮、输入框或 file input。",
  },
  intercepted: {
    category: "intercepted",
    label: "目标被遮挡或点击面被拦截",
    title: "先清掉遮挡层再操作最终控件",
    explanation:
      "这通常说明目标上方还有遮罩、弹层、中转表面或其他浮层，点击事件没有真正落到目标上",
    suggestedAction:
      "先等待 loading、遮罩层或弹层切换完成，再点击最终可操作控件；如果页面是二段式确认，优先重录到最终 dialog 或 drawer 里的确认按钮。",
  },
  "not-ready": {
    category: "not-ready",
    label: "目标还没进入可操作状态",
    title: "补一条更明确的就绪等待",
    explanation:
      "这通常说明目标虽然已经存在，但还不可见、不可点、仍在 loading，或者仍处于禁用态",
    suggestedAction:
      "在动作前补 visible、hidden、ready 标志或 loading 消失的等待，再操作当前控件；如果按钮会延迟启用，也要先等禁用态解除。",
  },
  "not-editable": {
    category: "not-editable",
    label: "目标不是当前可编辑控件",
    title: "重新对准真实可编辑控件",
    explanation:
      "这通常说明当前命中的是只读壳层、自定义表面或非真实输入控件，而不是最终可编辑的节点",
    suggestedAction:
      "重新录制到真正的 input、textarea、contenteditable 或 input[type=file]，不要只点击外层按钮、图标或上传壳。",
  },
  unknown: {
    category: "unknown",
    label: "运行时根因仍不明确",
    title: "先打开诊断产物确认失败阶段",
    explanation:
      "runtime 已保留当前页、截图和 diagnostic JSON，但还不能把这次失败稳定归类到已知动作根因",
    suggestedAction:
      "先对照 diagnostic JSON、截图和页面快照，确认是节点重挂载、遮挡、等待不足还是目标类型变化，再决定补等待还是重录。",
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
  runtimeCauseCategory?: StudioRuntimeCauseCategory;
  recoveryTried?: boolean;
  recoveredAttemptCount?: number;
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
    cause === "checked-state-reset" ||
    cause === "upload-files-reset"
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

export function isStudioRuntimeCauseCategory(
  category: string | undefined,
): category is StudioRuntimeCauseCategory {
  return (
    category === "detached" ||
    category === "intercepted" ||
    category === "not-ready" ||
    category === "not-editable" ||
    category === "unknown"
  );
}

export function getStudioRuntimeCauseDescriptor(
  category: string | undefined,
): StudioRuntimeCauseDescriptor | undefined {
  if (!isStudioRuntimeCauseCategory(category)) {
    return undefined;
  }

  return studioRuntimeCauseDescriptorMap[category];
}

export function formatStudioRuntimeRecoverySummary(
  diagnostic: Pick<StudioRuntimeErrorDiagnostic, "recoveryTried" | "recoveredAttemptCount">,
): string {
  if (!diagnostic.recoveryTried) {
    return "runtime 未触发恢复重试。";
  }

  const count = diagnostic.recoveredAttemptCount ?? 0;
  return count > 0
    ? `runtime 已尝试恢复 ${count} 次，但当前步骤仍未通过。`
    : "runtime 已尝试恢复，但当前产物没有记录有效重试次数。";
}

export type StudioExecution = {
  executionId: string;
  projectId: string;
  flowId: string;
  status: "pending" | "running" | "passed" | "failed" | "cancelled";
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

export type StudioExecutionProgressEvent = ExecutionProgressEvent;

export type CancelExecutionResult = {
  accepted: boolean;
  alreadyCancelled: boolean;
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

export type StudioImportFlowFileResult =
  | { status: "cancelled" }
  | {
      status: "imported";
      flow: FlowDocument;
      warnings: FlowPortabilityWarning[];
    };

export type StudioExportFlowFileResult =
  | { status: "cancelled" }
  | {
      status: "exported";
      warnings: FlowPortabilityWarning[];
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
  readonly nativeFilePortability: boolean;
  listProjects: () => Promise<StudioProject[]>;
  createProject: (name: string) => Promise<StudioProject>;
  listFlows: (projectId: string) => Promise<StudioFlowRef[]>;
  renameFlow: (
    projectId: string,
    flowId: string,
    name: string,
  ) => Promise<StudioFlowRef>;
  getFlow: (projectId: string, flowId: string) => Promise<FlowDocument>;
  importFlowFile: (projectId: string) => Promise<StudioImportFlowFileResult>;
  exportFlowFile: (
    projectId: string,
    flowId: string,
  ) => Promise<StudioExportFlowFileResult>;
  getFlowRunInput: (projectId: string, flowId: string) => Promise<StudioFlowRunInput | null>;
  runFlow: (
    projectId: string,
    flowId?: string,
    options?: RunFlowOptions,
  ) => Promise<RunFlowResult>;
  cancelExecution?: (executionId: string) => Promise<CancelExecutionResult>;
  onExecutionProgress?: (
    listener: (event: StudioExecutionProgressEvent) => void,
  ) => () => void;
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
