import type {
  AnyFlowDocument,
  FlowDocument,
  FlowPortabilityWarning,
  FlowV1UpgradePreviewOptions,
} from "@flowweave/flow-dsl";

export type ProjectRef = {
  id: string;
  name: string;
  createdAt: string;
};

export type FlowImportResult = {
  flow: FlowDocument;
  warnings: FlowPortabilityWarning[];
};

/** Flow 历史版本摘要（列表展示） */
export type FlowVersionRecord = {
  id: string;
  flowId: string;
  projectId: string;
  version: number;
  name: string;
  stepCount: number;
  /** 旧调用方兼容：新迁移后的 repository 始终返回该元数据。 */
  schemaVersion?: 1 | 2;
  sourceRevision?: number;
  createdAt: string;
  changeMessage?: string;
};

export type FlowRevisionRecord = {
  document: AnyFlowDocument;
  revision: number;
  updatedAt: string;
};

export type SaveFlowRevisionInput = {
  projectId: string;
  flowId: string;
  document: AnyFlowDocument;
  expectedRevision: number;
  changeMessage?: string;
};

export type RestoreFlowRevisionInput = {
  projectId: string;
  flowId: string;
  versionId: string;
  expectedRevision: number;
  changeMessage?: string;
};

export type UpgradeFlowToV2Input = {
  projectId: string;
  flowId: string;
  expectedRevision: number;
  reportFingerprint: string;
  rememberSelections?: FlowV1UpgradePreviewOptions["rememberSelections"];
};

export type FlowRecentValue = string | number | boolean;

export type SaveFlowFieldRecentValuesInput = {
  projectId: string;
  flowId: string;
  expectedRevision: number;
  values: Record<string, FlowRecentValue>;
};

export type ProjectEnvironment = {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  isDefault: boolean;
  storageStatePath?: string;
};

export type PageSnapshotRecord = {
  id: string;
  projectId: string;
  url: string;
  title?: string;
  snapshotPath?: string;
  capturedAt: string;
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
  /** 失败步骤诊断 JSON 路径 */
  diagnosticPath?: string;
};

export type ExecutionVariableValue = string | number | boolean;

export type ExecutionRunContext = {
  environmentName?: string;
  baseUrl?: string;
  storageStatePath?: string;
  variables?: Record<string, ExecutionVariableValue>;
};

/** 流程执行结果（与 runtime 输出契约对齐，P1 由 knowledge 包定义） */
export type ExecutionResult = {
  executionId: string;
  flowId: string;
  status: "success" | "failed" | "cancelled";
  steps: StepLog[];
  startedAt?: string;
  finishedAt?: string;
  flowSnapshot?: FlowDocument;
  runContext?: ExecutionRunContext;
};

/** 带项目上下文的执行结果（getExecution 查询时使用） */
export type ExecutionWithProject = ExecutionResult & {
  projectId: string;
};

export type ExecutionDeletionResult =
  | {
      projectId: string;
      executionId: string;
      status: "deleted";
      artifacts: "deleted" | "absent" | "quarantined";
    }
  | {
      projectId: string;
      executionId: string;
      status: "already-absent";
      artifacts: "untouched";
    };

/** 受控截图读取结果；不会向调用方暴露本机路径。 */
export type ExecutionScreenshotPreviewResult =
  | {
      status: "available";
      mediaType: "image/png";
      bytes: Uint8Array;
      width: number;
      height: number;
    }
  | {
      status: "absent";
    };
