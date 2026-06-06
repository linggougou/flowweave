import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const matrixModuleUrl = pathToFileURL(join(repoRoot, "examples/real-page-smoke.ts")).href;

describe("runRealPageFixtureMatrix P5", () => {
  it("执行 P5 增强矩阵并返回汇总统计", async () => {
    const matrixModule = (await import(matrixModuleUrl)) as {
      runRealPageFixtureMatrix: (options?: Record<string, unknown>) => Promise<{
        profile?: string;
        results: Array<{ name: string; status: string; durationMs: number }>;
        failed: Array<{ name: string; status: string }>;
        successCount?: number;
        failureCount?: number;
        totalDurationMs?: number;
        averageDurationMs?: number;
      }>;
    };

    const summary = await matrixModule.runRealPageFixtureMatrix({
      headless: true,
      profile: "p5",
    });

    expect(summary.profile).toBe("p5");
    expect(summary.results.map((item) => item.name)).toEqual([
      "checkbox-select",
      "delayed-panel",
      "upload-form",
      "spa-route",
      "session-dashboard",
      "filterable-list",
      "modal-bulk-action",
      "session-expired-dashboard",
      "paginated-list",
      "drawer-edit-form",
      "toast-popconfirm",
      "tabbed-workspace",
      "contenteditable-editor",
      "empty-results-retry",
      "linked-filters",
    ]);
    expect(summary.failed).toHaveLength(0);
    expect(summary.successCount).toBe(15);
    expect(summary.failureCount).toBe(0);
    expect(summary.totalDurationMs).toBeGreaterThan(0);
    expect(summary.averageDurationMs).toBeGreaterThan(0);
  });
});
