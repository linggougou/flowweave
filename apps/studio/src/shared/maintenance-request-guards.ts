import type { ExecutionDeletionResult } from "@flowweave/project-knowledge";

export function isMatchingExecutionDeletionResult(
  result: ExecutionDeletionResult,
  projectId: string,
  executionId: string,
): boolean {
  return result.projectId === projectId && result.executionId === executionId;
}

export function isCurrentVersionRequest(input: {
  requestId: number;
  latestRequestId: number;
  projectId: string;
  selectedProjectId: string | null;
  flowId: string;
  selectedFlowId: string | null;
  versionId: string;
  selectedVersionId: string | null;
}): boolean {
  return (
    input.requestId === input.latestRequestId &&
    input.projectId === input.selectedProjectId &&
    input.flowId === input.selectedFlowId &&
    input.versionId === input.selectedVersionId
  );
}
