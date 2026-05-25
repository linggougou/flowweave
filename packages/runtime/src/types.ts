import type { NormalizedStep } from "@flowweave/flow-dsl";

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
}

export interface ExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  steps: StepLog[];
  error?: {
    message: string;
    stepIndex?: number;
  };
}

export type ExecutionOptions = {
  /** 默认 true */
  headless?: boolean;
  /** 单步与导航默认超时（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 预生成的执行 ID；未提供时自动生成 */
  executionId?: string;
  /** 运行产物目录；设置后每步写入 step-<n>.png */
  artifactDir?: string;
};
