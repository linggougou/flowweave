import type { BrowserContext } from "playwright";
import type { FlowWeaveErrorCode } from "@flowweave/shared";
import type { NormalizedStep, Target } from "@flowweave/flow-dsl";
import type { PageSnapshotSummary } from "@flowweave/page-intelligence";

export type ExecutionStatus = "success" | "failed";

export type StepLogStatus = "success" | "failed";

type ScopeKind = NonNullable<NonNullable<Target["hints"]>["scopeKind"]>;

export type DiagnosticCandidateSummary = {
  index: number;
  visible: boolean;
  tagName?: string;
  inputType?: string;
  nameAttr?: string;
  placeholder?: string;
  labelText?: string;
  textSample?: string;
  scopeKind?: ScopeKind;
  scopeText?: string;
  score: number;
  matchedHints: string[];
};

export type StrategyAttempt = {
  label: string;
  matchedCount: number;
  visibleCount?: number;
  success: boolean;
  error?: string;
  selectedIndex?: number;
  ambiguityReason?: string;
  candidateSummaries?: DiagnosticCandidateSummary[];
};

export type StepDiagnosticKind = "target-resolution" | "runtime-error";

export const runtimeCauseCategories = [
  "detached",
  "intercepted",
  "not-ready",
  "not-editable",
  "unknown",
] as const;

export type RuntimeCauseCategory = (typeof runtimeCauseCategories)[number];

export type BaseStepDiagnostic = {
  kind: StepDiagnosticKind;
  stepId: string;
  stepIndex: number;
  stepType: NormalizedStep["type"];
  message: string;
  errorCode?: FlowWeaveErrorCode;
  cause?: string;
  url?: string;
  title?: string;
};

export type TargetResolutionDiagnostic = BaseStepDiagnostic & {
  kind: "target-resolution";
  strategyAttempts: StrategyAttempt[];
  targetHints?: Target["hints"];
};

export type RuntimeErrorDiagnostic = BaseStepDiagnostic & {
  kind: "runtime-error";
  runtimeCauseCategory?: RuntimeCauseCategory;
  recoveryTried?: boolean;
  recoveredAttemptCount?: number;
};

export type StepDiagnostic = TargetResolutionDiagnostic | RuntimeErrorDiagnostic;

export interface StepLog {
  stepIndex: number;
  stepId: string;
  type: NormalizedStep["type"];
  status: StepLogStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  message?: string;
  /** 步骤截图本地路径（仅当 artifactDir 启用时） */
  screenshotPath?: string;
  /** 失败步骤诊断 JSON 路径（target 定位失败与通用运行失败均可写入） */
  diagnosticPath?: string;
}

export type RuntimePageSnapshot = {
  stepIndex: number;
  filePath: string;
  summary: PageSnapshotSummary;
};

export interface ExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  steps: StepLog[];
  harPath?: string;
  pageSnapshots?: RuntimePageSnapshot[];
  error?: {
    message: string;
    stepIndex?: number;
  };
}

export type ExecutionVariableValue = string | number | boolean;
export type ExecutionVariables = Record<string, ExecutionVariableValue>;

export type ExecutionCookie = Parameters<BrowserContext["addCookies"]>[0][number];

export type ExecutionOptions = {
  /** 默认 true */
  headless?: boolean;
  /** 单步与导航默认超时（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 预生成的执行 ID；未提供时自动生成 */
  executionId?: string;
  /** 运行产物目录；设置后每步写入 step-<n>.png */
  artifactDir?: string;
  /** 是否记录 HAR（需 artifactDir），默认 true */
  recordHar?: boolean;
  /** 为相对路径 navigate 提供基础地址 */
  baseUrl?: string;
  /** 运行时变量，供后续插值与环境注入使用 */
  variables?: ExecutionVariables;
  /** Playwright storageState JSON 文件路径 */
  storageStatePath?: string;
  /** 追加注入到 BrowserContext 的 Cookie 列表 */
  cookies?: ExecutionCookie[];
  /** 当前运行使用的环境名称，便于诊断与落盘 */
  environmentName?: string;
};
