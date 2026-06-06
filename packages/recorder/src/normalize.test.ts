import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { RecordedEvent } from "@flowweave/shared";
import { flowDocumentSchema } from "@flowweave/flow-dsl";
import {
  buildFlowFromEvents,
  normalizeRecordedEvent,
  type BuildFlowFromEventsMeta,
} from "./normalize.js";

const baseMeta: BuildFlowFromEventsMeta = {
  sessionId: "sess_1",
  projectId: "proj_1",
  startedAt: "2026-05-25T10:00:00.000Z",
  flowId: "flow_rec_1",
  name: "录制流程",
};

function event(partial: Omit<RecordedEvent, "payload"> & { payload?: Record<string, unknown> }): RecordedEvent {
  return {
    id: partial.id,
    type: partial.type,
    timestamp: partial.timestamp,
    url: partial.url,
    frameId: partial.frameId,
    payload: partial.payload ?? {},
  };
}

describe("normalizeRecordedEvent", () => {
  it("将 click 事件转为带 Target 的 click 步骤", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_click",
        type: "click",
        timestamp: 1000,
        url: "https://example.com/app",
        payload: { role: "button", name: "提交" },
      }),
    );

    expect(step).toEqual({
      id: "evt_click",
      type: "click",
      target: {
        strategies: [{ kind: "role", role: "button", name: "提交" }],
      },
    });
  });

  it("click 支持 payload 中的 button", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_click_2",
        type: "click",
        timestamp: 1001,
        url: "https://example.com/app",
        payload: { selector: "#menu", button: "right" },
      }),
    );

    expect(step).toMatchObject({
      type: "click",
      button: "right",
      target: { strategies: [{ kind: "css", selector: "#menu" }] },
    });
  });

  it("将 fill 事件转为 fill 步骤", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_fill",
        type: "fill",
        timestamp: 2000,
        url: "https://example.com/login",
        payload: { selector: "#username", value: "demo_user", clear: true },
      }),
    );

    expect(step).toEqual({
      id: "evt_fill",
      type: "fill",
      target: {
        strategies: [{ kind: "css", selector: "#username" }],
      },
      value: "demo_user",
      clear: true,
    });
  });

  it("将 navigate 事件转为 navigate 步骤", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_nav",
        type: "navigate",
        timestamp: 0,
        url: "https://example.com/login",
        payload: { waitUntil: "networkidle" },
      }),
    );

    expect(step).toEqual({
      id: "evt_nav",
      type: "navigate",
      url: "https://example.com/login",
      waitUntil: "networkidle",
    });
  });

  it("navigate 可使用 payload.url 覆盖事件 url", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_nav_2",
        type: "navigate",
        timestamp: 10,
        url: "https://example.com/old",
        payload: { url: "https://example.com/new" },
      }),
    );

    expect(step).toMatchObject({
      type: "navigate",
      url: "https://example.com/new",
    });
  });

  it("不支持的事件类型返回 null", () => {
    expect(
      normalizeRecordedEvent(
        event({
          id: "evt_scroll",
          type: "scroll",
          timestamp: 3000,
          url: "https://example.com",
        }),
      ),
    ).toBeNull();
  });
});

describe("buildFlowFromEvents", () => {
  it("从事件序列构建可校验的 FlowDocument", () => {
    const events: RecordedEvent[] = [
      event({
        id: "s1",
        type: "navigate",
        timestamp: 0,
        url: "https://example.com/login",
      }),
      event({
        id: "s2",
        type: "fill",
        timestamp: 100,
        url: "https://example.com/login",
        payload: { role: "textbox", name: "用户名", value: "{{username}}" },
      }),
      event({
        id: "s3",
        type: "click",
        timestamp: 200,
        url: "https://example.com/login",
        payload: { role: "button", name: "登录" },
      }),
      event({
        id: "s4",
        type: "scroll",
        timestamp: 300,
        url: "https://example.com/login",
      }),
    ];

    const flow = buildFlowFromEvents(events, baseMeta);

    expect(flow.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
    expect(flow.id).toBe("flow_rec_1");
    expect(flow.projectId).toBe("proj_1");
    expect(flow.name).toBe("录制流程");
    expect(flow.meta.source).toBe("recorded");
    expect(flow.steps).toHaveLength(3);
    expect(flow.steps.map((s) => s.type)).toEqual(["navigate", "fill", "click"]);

    expect(() => flowDocumentSchema.parse(flow)).not.toThrow();
  });

  it("无 navigate 时用首条事件的 url 自动补 open 步骤", () => {
    const events: RecordedEvent[] = [
      event({
        id: "c1",
        type: "click",
        timestamp: 100,
        url: "https://app.example.com/login",
        payload: { selector: "#email" },
      }),
      event({
        id: "f1",
        type: "fill",
        timestamp: 200,
        url: "https://app.example.com/login",
        payload: { selector: "#email", value: "user@test.com" },
      }),
    ];

    const flow = buildFlowFromEvents(events, baseMeta);

    expect(flow.steps[0]).toMatchObject({
      type: "navigate",
      url: "https://app.example.com/login",
    });
    // click(#email) + fill(#email) 合并为 fill
    expect(flow.steps).toHaveLength(2);
    expect(flow.steps.map((s) => s.type)).toEqual(["navigate", "fill"]);
  });

  it("无有效步骤时抛出校验错误", () => {
    expect(() =>
      buildFlowFromEvents(
        [
          event({
            id: "x",
            type: "keypress",
            timestamp: 0,
            url: "https://example.com",
          }),
        ],
        baseMeta,
      ),
    ).toThrow(/至少一个可归一化步骤/);
  });
});
