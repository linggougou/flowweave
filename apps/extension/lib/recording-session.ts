import type { RecordedEvent, RecorderSessionMeta } from "@flowweave/shared";
import type { RecordingStatus, SessionStepPreview } from "./messages.js";

export type StoredSession = {
  meta: RecorderSessionMeta;
  events: RecordedEvent[];
  status: RecordingStatus;
  taskName?: string;
};

const RECORDING_STATUSES = new Set<RecordingStatus>([
  "idle",
  "recording",
  "paused",
  "completed",
]);

function readText(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function describeTarget(payload: Record<string, unknown>): string {
  return readText(payload, "name", "labelText", "placeholder", "text", "selector") ?? "页面元素";
}

function isSensitiveValue(value: unknown): boolean {
  return typeof value === "string" && /^\{\{secret_[a-z0-9_]+\}\}$/i.test(value);
}

function describeEvent(event: RecordedEvent): string {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "navigate": {
      const rawUrl = readText(payload, "url") ?? event.url;
      try {
        return `打开 ${new URL(rawUrl).hostname}`;
      } catch {
        return "打开页面";
      }
    }
    case "click":
      if (typeof payload.checked === "boolean") {
        return `${payload.checked ? "勾选" : "取消勾选"} ${describeTarget(payload)}`;
      }
      return `点击 ${describeTarget(payload)}`;
    case "fill":
      if (Array.isArray(payload.files)) {
        return `上传文件到 ${describeTarget(payload)}`;
      }
      return `填写 ${describeTarget(payload)}${isSensitiveValue(payload.value) ? "（敏感信息已保护）" : ""}`;
    case "select":
      return `选择 ${describeTarget(payload)}`;
    case "keypress":
      return `按下 ${readText(payload, "key") ?? "按键"}`;
    case "scroll":
      return "滚动页面";
    default:
      return "执行页面操作";
  }
}

export function buildSessionPreview(events: RecordedEvent[]): SessionStepPreview[] {
  return events.map((event) => ({ id: event.id, label: describeEvent(event) }));
}

export function collectTargetSites(events: RecordedEvent[]): string[] {
  const sites = new Set<string>();
  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;
    const rawUrl = readText(payload, "url") ?? event.url;
    try {
      const url = new URL(rawUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        sites.add(url.hostname);
      }
    } catch {
      // 非网页 URL 不进入目标站点摘要。
    }
  }
  return [...sites];
}

export function normalizeStoredSession(
  value: unknown,
  createIdleSession: () => StoredSession,
): { session: StoredSession; migrated: boolean } {
  if (!value || typeof value !== "object") {
    return { session: createIdleSession(), migrated: true };
  }
  const candidate = value as Partial<StoredSession>;
  if (!candidate.meta || !Array.isArray(candidate.events)) {
    return { session: createIdleSession(), migrated: true };
  }
  const status = RECORDING_STATUSES.has(candidate.status as RecordingStatus)
    ? (candidate.status as RecordingStatus)
    : candidate.events.length > 0
      ? "completed"
      : "idle";
  const taskName = typeof candidate.taskName === "string" ? candidate.taskName : undefined;
  return {
    session: {
      meta: candidate.meta,
      events: candidate.events,
      status,
      ...(taskName ? { taskName } : {}),
    },
    migrated: candidate.status !== status,
  };
}
