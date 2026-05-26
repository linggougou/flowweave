import { describe, expect, it } from "vitest";
import { parseHarSummary } from "./har-summary.js";

describe("parseHarSummary", () => {
  it("统计 HAR 条目", () => {
    const har = JSON.stringify({
      log: {
        entries: [
          {
            request: { method: "GET", url: "https://api.example.com/user" },
            response: { status: 200 },
          },
        ],
      },
    });
    const summary = parseHarSummary(har);
    expect(summary.entryCount).toBe(1);
    expect(summary.entries[0]?.method).toBe("GET");
  });
});
