export type ProjectRef = {
  id: string;
  name: string;
  createdAt: string;
};

/** 单步执行日志（截图等大文件仅存路径） */
export type StepLog = {
  stepIndex: number;
  stepId: string;
  status: "passed" | "failed" | "skipped";
  durationMs?: number;
  errorMessage?: string;
  /** 截图文件路径，不入库 BLOB */
  screenshotPath?: string;
};

/** 流程执行结果（与 runtime 输出契约对齐，P1 由 knowledge 包定义） */
export type ExecutionResult = {
  executionId: string;
  flowId: string;
  status: "success" | "failed" | "cancelled";
  steps: StepLog[];
  startedAt?: string;
  finishedAt?: string;
};

/** 带项目上下文的执行结果（getExecution 查询时使用） */
export type ExecutionWithProject = ExecutionResult & {
  projectId: string;
};
