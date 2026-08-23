import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionWithProject } from "@flowweave/project-knowledge";

import {
  buildExecutionFragilityIssues,
  hasFragilityRelevantRunContext,
  resolveExecutionFlow,
} from "./execution-fragility.js";
import type { ExecutionStepLog, StudioExecution } from "./studio-api-types.js";

type StoredExecutionStep = ExecutionWithProject["steps"][number] & Partial<ExecutionStepLog>;
type StudioExecutionStepArtifacts = Pick<
  ExecutionStepLog,
  "diagnostic" | "pageSnapshot" | "hasDiagnostic" | "hasPageSnapshot"
>;

export type MapStoredExecutionOptions = {
  fallbackFlow?: FlowDocument;
  decorateStep?: (
    step: StoredExecutionStep,
    mappedStep: ExecutionStepLog,
    context: {
      startedAt: string;
      finishedAt?: string;
      executionFlow?: FlowDocument;
    },
  ) => StudioExecutionStepArtifacts | undefined;
};

function mapExecutionStatus(
  status: ExecutionWithProject["status"],
): StudioExecution["status"] {
  if (status === "success") {
    return "passed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return "failed";
}

export function mapStoredExecutionToStudioExecution(
  stored: ExecutionWithProject,
  options: MapStoredExecutionOptions = {},
): StudioExecution {
  const startedAt = stored.startedAt ?? new Date(0).toISOString();
  const executionFlow = resolveExecutionFlow(stored.flowSnapshot, options.fallbackFlow);

  return {
    executionId: stored.executionId,
    projectId: stored.projectId,
    flowId: stored.flowId,
    status: mapExecutionStatus(stored.status),
    startedAt,
    finishedAt: stored.finishedAt,
    environmentName: stored.runContext?.environmentName,
    flowSnapshot: stored.flowSnapshot,
    runContext: stored.runContext,
    steps: stored.steps.map((step) => {
      const mappedStep: ExecutionStepLog = {
        stepIndex: step.stepIndex,
        stepId: step.stepId,
        label:
          executionFlow?.steps[step.stepIndex]?.label ??
          executionFlow?.steps[step.stepIndex]?.type ??
          step.stepId,
        status: step.status,
        message: step.errorMessage,
        durationMs: step.durationMs,
        startedAt,
        finishedAt: stored.finishedAt,
        hasScreenshot: Boolean(step.screenshotPath),
        hasDiagnostic: Boolean(step.diagnosticPath),
      };

      return {
        ...mappedStep,
        ...options.decorateStep?.(step, mappedStep, {
          startedAt,
          finishedAt: stored.finishedAt,
          executionFlow,
        }),
      };
    }),
    fragilityIssues: buildExecutionFragilityIssues(executionFlow, stored.runContext),
  };
}

export function shouldUseCachedExecution(cached: StudioExecution): boolean {
  return Boolean(
    cached.flowSnapshot &&
      hasFragilityRelevantRunContext(cached.runContext, cached.flowSnapshot),
  );
}
