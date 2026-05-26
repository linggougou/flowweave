/** 渲染进程与 preload 共享的 Studio API 类型 */
import type { FlowDocument } from "@flowweave/flow-dsl";

export type StudioProject = {
  id: string;
  name: string;
  createdAt: string;
  baseUrl?: string;
};

export type ExecutionStepLog = {
  stepIndex: number;
  stepId: string;
  label: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  message?: string;
  durationMs?: number;
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

/** 运行流程时的选项；showBrowser 为 true 时弹出 Playwright 浏览器窗口 */
export type RunFlowOptions = {
  showBrowser?: boolean;
};

export type ExecutionSummary = {
  executionId: string;
  flowId: string;
  status: StudioExecution["status"];
  startedAt?: string;
  finishedAt?: string;
};

export type StudioFlowRef = {
  id: string;
  name: string;
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
  listFlows: (projectId: string) => Promise<StudioFlowRef[]>;
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
