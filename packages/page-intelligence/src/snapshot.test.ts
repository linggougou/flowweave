import { describe, expect, it } from "vitest";
import { buildPageSnapshotSummary } from "./snapshot.js";

describe("buildPageSnapshotSummary", () => {
  it("组装页面摘要", () => {
    const summary = buildPageSnapshotSummary({
      url: "https://example.com/login",
      title: "登录",
      formCount: 1,
      buttonCount: 2,
      linkCount: 3,
    });
    expect(summary.url).toContain("example.com");
    expect(summary.formCount).toBe(1);
    expect(summary.capturedAt).toMatch(/^\d{4}-/);
  });
});
