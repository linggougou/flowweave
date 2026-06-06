import {
  FLOW_SCHEMA_VERSION,
  FlowWeaveError,
  type RecordedEvent,
  type RecorderSessionMeta,
  extractTemplateVariables,
  getSingleTemplateVariableName,
} from "@flowweave/shared";
import type { FlowDocument, NormalizedStep, Target } from "@flowweave/flow-dsl";
import { filterNoisyInteractionSteps, mergeConsecutiveFillSteps } from "./step-filter.js";

type LocatorStrategy = Target["strategies"][number];
type ScopeKind = NonNullable<NonNullable<Target["hints"]>["scopeKind"]>;
type FlowVariableDefinition = FlowDocument["variables"][number];
type UploadStepWithMetadata = Extract<NormalizedStep, { type: "upload" }> & {
  fileNames?: string[];
};
const INFERRED_VISIBLE_WAIT_MIN_GAP_MS = 500;
const SCOPE_KIND_VALUES: ScopeKind[] = ["row", "listitem", "dialog", "tabpanel", "section", "card"];

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
  values?: string[];
  files?: string[];
  fileNames?: string[];
  checked?: boolean;
  clear?: boolean;
  inputType?: string;
  tagName?: string;
  nameAttr?: string;
  placeholder?: string;
  labelText?: string;
  textSample?: string;
  scopeText?: string;
  scopeKind?: ScopeKind;
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

function readScopeKind(payload: Record<string, unknown>, key: string): ScopeKind | undefined {
  const value = readString(payload, key);
  return value && SCOPE_KIND_VALUES.includes(value as ScopeKind) ? (value as ScopeKind) : undefined;
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

function readStringArray(payload: Record<string, unknown>, key: string): string[] | undefined {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return items.length > 0 ? items : undefined;
}

function isReplayableUploadInput(value: string): boolean {
  return (
    getSingleTemplateVariableName(value) !== null ||
    /^(?:file:\/\/|\/|\.{1,2}\/|[A-Za-z]:[\\/]|\\\\)/.test(value)
  );
}

function buildTargetHints(payload: Record<string, unknown>): Target["hints"] | undefined {
  const hints: NonNullable<Target["hints"]> = {};
  const tagName = readString(payload, "tagName");
  const inputType = readString(payload, "inputType");
  const nameAttr = readString(payload, "nameAttr");
  const placeholder = readString(payload, "placeholder");
  const labelText = readString(payload, "labelText");
  const textSample = readString(payload, "textSample");
  const scopeText = readString(payload, "scopeText");
  const scopeKind = readScopeKind(payload, "scopeKind");

  if (tagName) {
    hints.tagName = tagName;
  }
  if (inputType) {
    hints.inputType = inputType;
  }
  if (nameAttr) {
    hints.nameAttr = nameAttr;
  }
  if (placeholder) {
    hints.placeholder = placeholder;
  }
  if (labelText) {
    hints.labelText = labelText;
  }
  if (textSample) {
    hints.textSample = textSample;
  }
  if (scopeText) {
    hints.scopeText = scopeText;
  }
  if (scopeKind) {
    hints.scopeKind = scopeKind;
  }

  return Object.keys(hints).length > 0 ? hints : undefined;
}

function buildTargetFromPayload(payload: Record<string, unknown>): Target | null {
  const hints = buildTargetHints(payload);
  const rawStrategies = payload.strategies;
  if (Array.isArray(rawStrategies) && rawStrategies.length > 0) {
    const strategies = rawStrategies.filter(isLocatorStrategy);
    if (strategies.length > 0) {
      return hints ? { strategies, hints } : { strategies };
    }
  }

  const strategies: LocatorStrategy[] = [];
  const testId = readString(payload, "testId");
  if (testId) {
    strategies.push({ kind: "testId", testId });
  }

  const role = readString(payload, "role");
  const name = readString(payload, "name");
  if (role) {
    strategies.push(name ? { kind: "role", role, name } : { kind: "role", role });
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

  if (strategies.length === 0) {
    return null;
  }

  return hints ? { strategies, hints } : { strategies };
}

function extractVariableNames(value: unknown): string[] {
  return extractTemplateVariables(value);
}

function extractUploadVariableNames(values: string[]): string[] {
  return values.flatMap((value) => {
    const variableName = getSingleTemplateVariableName(value);
    return variableName ? [variableName] : [];
  });
}

function extractTargetVariableNames(target: Target | undefined): string[] {
  if (!target) {
    return [];
  }

  return target.strategies.flatMap((strategy) => {
    switch (strategy.kind) {
      case "role":
        return [...extractVariableNames(strategy.role), ...extractVariableNames(strategy.name)];
      case "testId":
        return extractVariableNames(strategy.testId);
      case "css":
        return extractVariableNames(strategy.selector);
      case "xpath":
        return extractVariableNames(strategy.expression);
      case "text":
        return extractVariableNames(strategy.text);
      default:
        return [];
    }
  });
}

function collectStepVariableNames(step: NormalizedStep): string[] {
  switch (step.type) {
    case "navigate":
      return extractVariableNames(step.url);
    case "click":
      return extractTargetVariableNames(step.target);
    case "fill":
      return [...extractTargetVariableNames(step.target), ...extractVariableNames(step.value)];
    case "select":
      return [...extractTargetVariableNames(step.target), ...step.values.flatMap(extractVariableNames)];
    case "setChecked":
      return extractTargetVariableNames(step.target);
    case "press":
      return [...extractTargetVariableNames(step.target), ...extractVariableNames(step.key)];
    case "upload":
      return [...extractTargetVariableNames(step.target), ...extractUploadVariableNames(step.files)];
    case "wait":
      return [
        ...extractTargetVariableNames(step.target),
        ...extractVariableNames(step.urlIncludes),
      ];
    default:
      return [];
  }
}

function buildFlowVariables(steps: NormalizedStep[]): FlowVariableDefinition[] {
  const names = new Set<string>();
  const variables: FlowVariableDefinition[] = [];

  for (const step of steps) {
    for (const variableName of collectStepVariableNames(step)) {
      if (!variableName || names.has(variableName)) {
        continue;
      }
      names.add(variableName);
      variables.push({
        name: variableName,
        type: "string",
        required: true,
      });
    }
  }

  return variables;
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

  if (
    (payload.inputType === "checkbox" || payload.inputType === "radio") &&
    typeof payload.checked === "boolean"
  ) {
    return {
      id: event.id,
      type: "setChecked",
      target,
      checked: payload.checked,
    };
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
  const files = readStringArray(event.payload, "files");
  const fileNames = readStringArray(event.payload, "fileNames");
  if (target && payload.inputType === "file" && files) {
    if (!files.every(isReplayableUploadInput)) {
      return null;
    }
    const step: UploadStepWithMetadata = {
      id: event.id,
      type: "upload",
      target,
      files,
    };
    if (fileNames) {
      step.fileNames = fileNames;
    }
    return step as NormalizedStep;
  }

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

function normalizeSelect(event: RecordedEvent): NormalizedStep | null {
  const target = buildTargetFromPayload(event.payload);
  const values = readStringArray(event.payload, "values");
  if (!target || !values) {
    return null;
  }

  return {
    id: event.id,
    type: "select",
    target,
    values,
  };
}

function normalizeKeypress(event: RecordedEvent): NormalizedStep | null {
  const key = readString(event.payload, "key");
  if (!key) {
    return null;
  }

  const target = buildTargetFromPayload(event.payload);
  if (!target) {
    return {
      id: event.id,
      type: "press",
      key,
    };
  }

  return {
    id: event.id,
    type: "press",
    key,
    target,
  };
}

function targetOf(step: NormalizedStep): Target | undefined {
  switch (step.type) {
    case "click":
    case "fill":
    case "select":
    case "setChecked":
    case "press":
    case "upload":
      return step.target;
    default:
      return undefined;
  }
}

function targetSignature(target: Target | undefined): string | undefined {
  return target?.strategies.map((strategy) => JSON.stringify(strategy)).join("|");
}

function isSubmitLikePressKey(key: string): boolean {
  const parts = key.split("+").filter((part) => part.length > 0);
  const baseKey = parts.at(-1);
  if (!baseKey) {
    return false;
  }

  if (baseKey === "Enter" || baseKey === "Tab" || baseKey === "Escape") {
    return true;
  }

  const hasControlLikeModifier = parts.includes("Control") || parts.includes("Meta");
  return hasControlLikeModifier && baseKey.toLowerCase() === "s";
}

function isAsyncWaitTriggerStep(step: NormalizedStep): boolean {
  switch (step.type) {
    case "click":
    case "select":
    case "setChecked":
      return true;
    case "press":
      return isSubmitLikePressKey(step.key);
    default:
      return false;
  }
}

function buildUrlIncludesFragment(previousUrl: string, nextUrl: string): string | null {
  if (previousUrl === nextUrl) {
    return null;
  }

  try {
    const previous = new URL(previousUrl);
    const next = new URL(nextUrl);
    if (previous.origin === next.origin) {
      return `${next.pathname}${next.search}${next.hash}` || next.pathname || next.href;
    }
    return next.href;
  } catch {
    return nextUrl;
  }
}

function inferWaitStep(
  current: NormalizedStep,
  next: NormalizedStep,
  currentEvent: RecordedEvent | undefined,
  nextEvent: RecordedEvent | undefined,
): NormalizedStep | null {
  if (!currentEvent || !nextEvent || next.type === "navigate" || !isAsyncWaitTriggerStep(current)) {
    return null;
  }

  const eventGap = nextEvent.timestamp - currentEvent.timestamp;
  if (eventGap <= 0) {
    return null;
  }

  if (eventGap < INFERRED_VISIBLE_WAIT_MIN_GAP_MS) {
    return null;
  }

  if (currentEvent.url !== nextEvent.url) {
    const urlIncludes = buildUrlIncludesFragment(currentEvent.url, nextEvent.url);
    if (!urlIncludes) {
      return null;
    }
    return {
      id: `wait-auto-${current.id}-${next.id}`,
      type: "wait",
      condition: "urlIncludes",
      urlIncludes,
    };
  }

  const nextTarget = targetOf(next);
  if (!nextTarget) {
    return null;
  }

  if (targetSignature(targetOf(current)) === targetSignature(nextTarget)) {
    return null;
  }

  return {
    id: `wait-auto-${current.id}-${next.id}`,
    type: "wait",
    condition: "visible",
    target: nextTarget,
  };
}

function insertInferredWaitSteps(steps: NormalizedStep[], events: RecordedEvent[]): NormalizedStep[] {
  if (steps.length < 2) {
    return steps;
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  const result: NormalizedStep[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const current = steps[index];
    if (!current) {
      continue;
    }
    result.push(current);

    const next = steps[index + 1];
    if (!next) {
      continue;
    }

    const inferredWait = inferWaitStep(
      current,
      next,
      eventById.get(current.id),
      eventById.get(next.id),
    );
    if (inferredWait) {
      result.push(inferredWait);
    }
  }

  return result;
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
    case "select":
      return normalizeSelect(event);
    case "keypress":
      return normalizeKeypress(event);
    default:
      return null;
  }
}

/** 清空录制会话后若未刷新页面，事件里可能没有 navigate；用首条事件的 url 补一步 */
function ensureLeadingNavigate(
  steps: NormalizedStep[],
  events: RecordedEvent[],
): NormalizedStep[] {
  if (steps.length === 0 || steps[0]?.type === "navigate") {
    return steps;
  }
  const firstUrl = events.find((e) => typeof e.url === "string" && e.url.length > 0)?.url;
  if (!firstUrl || firstUrl === "about:blank") {
    return steps;
  }
  const anchor = events.find((e) => e.url === firstUrl) ?? events[0];
  return [
    {
      id: `nav-auto-${anchor?.id ?? "0"}`,
      type: "navigate",
      url: firstUrl,
      waitUntil: "domcontentloaded",
    },
    ...steps,
  ];
}

/** 将录制事件序列聚合为 Flow 文档 */
export function buildFlowFromEvents(
  events: RecordedEvent[],
  meta: BuildFlowFromEventsMeta,
): FlowDocument {
  const steps = insertInferredWaitSteps(
    mergeConsecutiveFillSteps(
      filterNoisyInteractionSteps(
        ensureLeadingNavigate(
          events
            .map((event) => normalizeRecordedEvent(event))
            .filter((step): step is NormalizedStep => step !== null),
          events,
        ),
      ),
    ),
    events,
  );

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
    variables: buildFlowVariables(steps),
    steps,
    meta: {
      createdAt: timestamp,
      updatedAt: timestamp,
      source: "recorded",
    },
  };
}
