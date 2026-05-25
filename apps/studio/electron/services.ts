import type { FlowDocument } from "@flowweave/flow-dsl";
import { executeFlow, type ExecutionResult } from "@flowweave/runtime";
import { getDefaultDataDir } from "@flowweave/project-knowledge";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type {
  ExecutionStepLog,
  StudioExecution,
  StudioProject,
} from "../src/shared/studio-api-types.js";

const executions = new Map<string, StudioExecution>();

/** R5 合并后改为 project-knowledge `listProjects()` */
export async function listProjects(): Promise<StudioProject[]> {
  void getDefaultDataDir();
  const now = new Date().toISOString();
  return [
    {
      id: "demo-login",
      name: "演示：登录流程",
      createdAt: now,
    },
  ];
}

function buildDemoFlow(projectId: string): FlowDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: `flow-${projectId}`,
    projectId,
    name: "演示流程",
    variables: [],
    steps: [
      {
        id: "step-navigate",
        label: "打开页面",
        type: "navigate",
        url: "https://example.com",
      },
      {
        id: "step-wait",
        label: "等待加载",
        type: "wait",
        ms: 500,
      },
    ],
    meta: {
      createdAt: now,
      updatedAt: now,
      source: "manual",
    },
  };
}

function mapRuntimeSteps(result: ExecutionResult): ExecutionStepLog[] {
  return result.steps.map((step) => ({
    stepIndex: step.stepIndex,
    stepId: step.stepId,
    label: step.type,
    status: step.status === "success" ? "passed" : "failed",
    message: step.message,
    startedAt: step.startedAt,
    finishedAt: step.endedAt,
  }));
}

function buildPendingStepLogs(flow: FlowDocument): ExecutionStepLog[] {
  const startedAt = new Date().toISOString();
  return flow.steps.map((step, stepIndex) => ({
    stepIndex,
    stepId: step.id,
    label: step.label ?? step.type,
    status: "pending" as const,
    startedAt,
  }));
}

export async function runFlow(projectId: string): Promise<StudioExecution> {
  const flow = buildDemoFlow(projectId);
  const startedAt = new Date().toISOString();
  const steps = buildPendingStepLogs(flow);

  const record: StudioExecution = {
    executionId: "",
    projectId,
    flowId: flow.id,
    status: "running",
    steps,
    startedAt,
  };

  for (const step of record.steps) {
    step.status = "running";
  }

  const runtimeResult = await executeFlow(flow, { headless: true });
  record.executionId = runtimeResult.executionId;
  executions.set(record.executionId, record);

  record.steps = mapRuntimeSteps(runtimeResult);
  record.status = runtimeResult.status === "success" ? "passed" : "failed";
  record.finishedAt = new Date().toISOString();

  if (runtimeResult.error) {
    const last = record.steps.at(-1);
    if (last) {
      last.message = runtimeResult.error.message;
    }
  }

  executions.set(record.executionId, record);

  // R5：saveExecution(projectId, runtimeResult)
  return record;
}

export function getExecution(executionId: string): StudioExecution | null {
  return executions.get(executionId) ?? null;
}
