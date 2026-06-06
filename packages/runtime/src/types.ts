import type { BrowserContext } from "playwright";
import type { NormalizedStep } from "@flowweave/flow-dsl";
import type { PageSnapshotSummary } from "@flowweave/page-intelligence";

export type ExecutionStatus = "success" | "failed";

export type StepLogStatus = "success" | "failed";

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
  /** 失败步骤诊断 JSON 路径（仅在可生成诊断时写入） */
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
  variables?: Record<string, ExecutionVariableValue>;
  /** Playwright storageState JSON 文件路径 */
  storageStatePath?: string;
  /** 追加注入到 BrowserContext 的 Cookie 列表 */
  cookies?: ExecutionCookie[];
  /** 当前运行使用的环境名称，便于诊断与落盘 */
  environmentName?: string;
};
