import type { RecordedEvent } from "@flowweave/shared";
import { describe, expect, it } from "vitest";
import {
  buildSessionPreview,
  collectTargetSites,
  normalizeStoredSession,
  type StoredSession,
} from "./recording-session.js";

function event(
  id: string,
  type: RecordedEvent["type"],
  payload: Record<string, unknown>,
  url = "https://app.example.com/orders",
): RecordedEvent {
  return { id, type, timestamp: 1710000000000, url, payload };
}

function idleSession(): StoredSession {
  return {
    meta: {
      sessionId: "idle-session",
      projectId: "pending",
      startedAt: "2026-08-23T10:00:00.000Z",
    },
    events: [],
    status: "idle",
  };
}

describe("recording session presentation", () => {
  it("生成业务可读步骤且不会回显敏感变量值", () => {
    const events = [
      event("nav", "navigate", { url: "https://app.example.com/orders" }),
      event("click", "click", { name: "新建订单" }),
      event("fill", "fill", { name: "密码", value: "{{secret_password}}" }),
      event("select", "select", { labelText: "所属门店", values: ["north"] }),
      event("press", "keypress", { key: "Enter" }),
      event("scroll", "scroll", { y: 480 }),
    ];

    const preview = buildSessionPreview(events);

    expect(preview.map((step) => step.label)).toEqual([
      "打开 app.example.com",
      "点击 新建订单",
      "填写 密码（敏感信息已保护）",
      "选择 所属门店",
      "按下 Enter",
      "滚动页面",
    ]);
    expect(JSON.stringify(preview)).not.toContain("secret_password");
  });

  it("目标站点去重并忽略非网页地址", () => {
    const sites = collectTargetSites([
      event("one", "click", {}, "https://app.example.com/one"),
      event("two", "click", {}, "https://app.example.com/two"),
      event("three", "navigate", { url: "https://docs.example.com/help" }),
      event("four", "navigate", { url: "chrome://extensions" }, "chrome://extensions"),
    ]);

    expect(sites).toEqual(["app.example.com", "docs.example.com"]);
  });

  it("旧版有事件会话迁移为 completed，空会话迁移为 idle", () => {
    const legacyMeta = idleSession().meta;
    const withEvents = normalizeStoredSession(
      { meta: legacyMeta, events: [event("one", "click", { name: "保存" })] },
      idleSession,
    );
    const empty = normalizeStoredSession({ meta: legacyMeta, events: [] }, idleSession);

    expect(withEvents).toMatchObject({ migrated: true, session: { status: "completed" } });
    expect(empty).toMatchObject({ migrated: true, session: { status: "idle" } });
  });
});
