import type { ExecutionSummary } from "./studio-api-types.js";

export function resolveExecutionSelectionAfterDeletion(
  previous: ExecutionSummary[],
  refreshed: ExecutionSummary[],
  deletedExecutionId: string,
  selectedExecutionId: string | null,
): string | null {
  if (selectedExecutionId !== deletedExecutionId) {
    return refreshed.some((item) => item.executionId === selectedExecutionId)
      ? selectedExecutionId
      : null;
  }

  const deletedIndex = previous.findIndex((item) => item.executionId === deletedExecutionId);
  if (deletedIndex < 0) {
    return refreshed[0]?.executionId ?? null;
  }
  return refreshed[deletedIndex]?.executionId ?? refreshed[deletedIndex - 1]?.executionId ?? null;
}
