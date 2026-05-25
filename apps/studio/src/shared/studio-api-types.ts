/** 渲染进程与 preload 共享的 Studio API 类型 */

export type StudioProject = {
  id: string;
  name: string;
  createdAt: string;
};

export type ExecutionStepLog = {
  stepIndex: number;
  stepId: string;
  label: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  message?: string;
  startedAt: string;
  finishedAt?: string;
  screenshotPath?: string;
};

export type FragilityWarning = {
  stepId: string;
  message: string;
};

export type StudioExecution = {
  executionId: string;
  projectId: string;
  flowId: string;
  status: "pending" | "running" | "passed" | "failed";
  steps: ExecutionStepLog[];
  startedAt: string;
  finishedAt?: string;
  fragilityWarnings?: FragilityWarning[];
};

export type RunFlowResult = {
  executionId: string;
  status: StudioExecution["status"];
};

export type ExecutionSummary = {
  executionId: string;
  flowId: string;
  status: StudioExecution["status"];
  startedAt?: string;
  finishedAt?: string;
};

export type StudioApi = {
  listProjects: () => Promise<StudioProject[]>;
  runFlow: (projectId: string) => Promise<RunFlowResult>;
  getExecution: (executionId: string) => Promise<StudioExecution | null>;
  listExecutions: (projectId: string) => Promise<ExecutionSummary[]>;
};

declare global {
  interface Window {
    flowweaveStudio: StudioApi;
  }
}

export {};
