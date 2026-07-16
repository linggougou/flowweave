import type { StudioFlowRef } from "./shared/studio-api-types.js";

export function resolveRefreshedFlowSelection(
  previousFlows: StudioFlowRef[],
  nextFlows: StudioFlowRef[],
  selectedFlowId: string | null,
  preferNewFlow: boolean,
): string | null {
  if (nextFlows.length === 0) {
    return null;
  }

  if (preferNewFlow) {
    const previousIds = new Set(previousFlows.map((flow) => flow.id));
    const newFlow = nextFlows.find((flow) => !previousIds.has(flow.id));
    if (newFlow) {
      return newFlow.id;
    }
  }

  if (selectedFlowId && nextFlows.some((flow) => flow.id === selectedFlowId)) {
    return selectedFlowId;
  }
  return nextFlows[0]?.id ?? null;
}

export function registerWindowFocusRefresh(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  refresh: () => void,
): () => void {
  target.addEventListener("focus", refresh);
  return () => target.removeEventListener("focus", refresh);
}
