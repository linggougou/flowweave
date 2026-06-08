import { describe, expect, it } from "vitest";
import { parseRecordedEvent } from "./recording-protocol.js";

describe("parseRecordedEvent", () => {
  it("接受页面级 scroll 事件", () => {
    const event = parseRecordedEvent({
      id: "evt_scroll_page",
      type: "scroll",
      timestamp: 100,
      url: "https://example.com/dashboard",
      payload: {
        x: 0,
        y: 640,
      },
    });

    expect(event.payload).toMatchObject({
      x: 0,
      y: 640,
    });
  });

  it("接受容器级 scroll 事件", () => {
    const event = parseRecordedEvent({
      id: "evt_scroll_container",
      type: "scroll",
      timestamp: 200,
      url: "https://example.com/dashboard",
      payload: {
        x: 12,
        y: 240,
        selector: "#order-list",
        role: "region",
        name: "订单列表",
      },
    });

    expect(event.payload).toMatchObject({
      x: 12,
      y: 240,
      selector: "#order-list",
      role: "region",
      name: "订单列表",
    });
  });

  it("拒绝负数 scroll 坐标", () => {
    expect(() =>
      parseRecordedEvent({
        id: "evt_scroll_invalid",
        type: "scroll",
        timestamp: 300,
        url: "https://example.com/dashboard",
        payload: {
          x: -1,
          y: 240,
        },
      }),
    ).toThrow(/非负数 x/i);

    expect(() =>
      parseRecordedEvent({
        id: "evt_scroll_invalid_y",
        type: "scroll",
        timestamp: 301,
        url: "https://example.com/dashboard",
        payload: {
          x: 0,
          y: -10,
        },
      }),
    ).toThrow(/非负数 y/i);
  });
});
