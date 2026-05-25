import type { FlowDocument } from "@flowweave/flow-dsl";
import type { RecordedEvent, RecorderSessionMeta } from "@flowweave/shared";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

/**
 * TODO(R1): 合并后改为从 `@flowweave/recorder` 导入 `buildFlowFromEvents`。
 * 当前为 P1 扩展侧最小占位，保证侧栏可导出 Flow JSON 草案。
 */
export function buildFlowFromEvents(
  events: RecordedEvent[],
  meta: RecorderSessionMeta,
): FlowDocument {
  const now = new Date().toISOString();
  const steps = events.map((event, index) => eventToStep(event, index));

  if (steps.length === 0) {
    steps.push({
      id: "step-0",
      type: "navigate",
      url: "https://example.com/",
    });
  }

  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: `flow-${meta.sessionId}`,
    projectId: meta.projectId,
    name: "录制流程",
    description: "由浏览器扩展录制生成（占位归一化）",
    variables: [],
    steps,
    meta: {
      createdAt: now,
      updatedAt: now,
      source: "recorded",
    },
  };
}

function eventToStep(event: RecordedEvent, index: number) {
  const id = `step-${index}`;

  switch (event.type) {
    case "navigate":
      return {
        id,
        type: "navigate" as const,
        url: String(event.payload.url ?? event.url),
      };
    case "click":
      return {
        id,
        type: "click" as const,
        target: cssTarget(event.payload.selector),
      };
    case "fill":
      return {
        id,
        type: "fill" as const,
        target: cssTarget(event.payload.selector),
        value: String(event.payload.value ?? ""),
      };
    default:
      return {
        id,
        type: "navigate" as const,
        url: event.url,
      };
  }
}

function cssTarget(selector: unknown) {
  return {
    strategies: [
      {
        kind: "css" as const,
        selector: typeof selector === "string" && selector.length > 0 ? selector : "body",
      },
    ],
  };
}
