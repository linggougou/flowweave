import {
  FLOW_SCHEMA_VERSION,
  FlowWeaveError,
  type RecordedEvent,
  type RecorderSessionMeta,
} from "@flowweave/shared";
import type { FlowDocument, NormalizedStep, Target } from "@flowweave/flow-dsl";

type LocatorStrategy = Target["strategies"][number];

/** 构建 Flow 时除会话元数据外需要的字段 */
export interface BuildFlowFromEventsMeta extends RecorderSessionMeta {
  flowId: string;
  name: string;
  description?: string;
}

type NavigatePayload = {
  url?: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
};

type InteractionPayload = {
  strategies?: LocatorStrategy[];
  selector?: string;
  role?: string;
  name?: string;
  testId?: string;
  xpath?: string;
  text?: string;
  exact?: boolean;
  button?: "left" | "right" | "middle";
  value?: string;
  clear?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

function isLocatorStrategy(value: unknown): value is LocatorStrategy {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  switch (value.kind) {
    case "role":
      return typeof value.role === "string";
    case "testId":
      return typeof value.testId === "string";
    case "css":
      return typeof value.selector === "string";
    case "xpath":
      return typeof value.expression === "string";
    case "text":
      return typeof value.text === "string";
    default:
      return false;
  }
}

function buildTargetFromPayload(payload: Record<string, unknown>): Target | null {
  const rawStrategies = payload.strategies;
  if (Array.isArray(rawStrategies) && rawStrategies.length > 0) {
    const strategies = rawStrategies.filter(isLocatorStrategy);
    if (strategies.length > 0) {
      return { strategies };
    }
  }

  const strategies: LocatorStrategy[] = [];
  const role = readString(payload, "role");
  const name = readString(payload, "name");
  if (role) {
    strategies.push(name ? { kind: "role", role, name } : { kind: "role", role });
  }

  const testId = readString(payload, "testId");
  if (testId) {
    strategies.push({ kind: "testId", testId });
  }

  const selector = readString(payload, "selector");
  if (selector) {
    strategies.push({ kind: "css", selector });
  }

  const xpath = readString(payload, "xpath");
  if (xpath) {
    strategies.push({ kind: "xpath", expression: xpath });
  }

  const text = readString(payload, "text");
  if (text) {
    const exact = readBoolean(payload, "exact");
    strategies.push(exact === undefined ? { kind: "text", text } : { kind: "text", text, exact });
  }

  return strategies.length > 0 ? { strategies } : null;
}

function normalizeNavigate(event: RecordedEvent): NormalizedStep | null {
  const payload = event.payload as NavigatePayload;
  const url = payload.url ?? event.url;
  if (!url) {
    return null;
  }

  const step: NormalizedStep = {
    id: event.id,
    type: "navigate",
    url,
  };

  if (payload.waitUntil) {
    step.waitUntil = payload.waitUntil;
  }

  return step;
}

function normalizeClick(event: RecordedEvent): NormalizedStep | null {
  const payload = event.payload as InteractionPayload;
  const target = buildTargetFromPayload(event.payload);
  if (!target) {
    return null;
  }

  const step: NormalizedStep = {
    id: event.id,
    type: "click",
    target,
  };

  if (payload.button) {
    step.button = payload.button;
  }

  return step;
}

function normalizeFill(event: RecordedEvent): NormalizedStep | null {
  const payload = event.payload as InteractionPayload;
  const target = buildTargetFromPayload(event.payload);
  const value = payload.value;
  if (!target || typeof value !== "string") {
    return null;
  }

  const step: NormalizedStep = {
    id: event.id,
    type: "fill",
    target,
    value,
  };

  if (payload.clear !== undefined) {
    step.clear = payload.clear;
  }

  return step;
}

/** 将单条录制事件转为标准步骤；不支持或信息不足时返回 null */
export function normalizeRecordedEvent(event: RecordedEvent): NormalizedStep | null {
  switch (event.type) {
    case "navigate":
      return normalizeNavigate(event);
    case "click":
      return normalizeClick(event);
    case "fill":
      return normalizeFill(event);
    default:
      return null;
  }
}

/** 将录制事件序列聚合为 Flow 文档 */
export function buildFlowFromEvents(
  events: RecordedEvent[],
  meta: BuildFlowFromEventsMeta,
): FlowDocument {
  const steps = events
    .map((event) => normalizeRecordedEvent(event))
    .filter((step): step is NormalizedStep => step !== null);

  if (steps.length === 0) {
    throw new FlowWeaveError(
      "VALIDATION_FAILED",
      "至少一个可归一化步骤才能构建 Flow",
      { eventCount: events.length },
    );
  }

  const timestamp = meta.startedAt;

  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: meta.flowId,
    projectId: meta.projectId,
    name: meta.name,
    description: meta.description,
    variables: [],
    steps,
    meta: {
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "recorded",
    },
  };
}
