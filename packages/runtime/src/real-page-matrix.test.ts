import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const matrixModuleUrl = pathToFileURL(join(repoRoot, "examples/real-page-smoke.ts")).href;

type MatrixResultShape = {
  name: string;
  status: string;
  stepCount: number;
  durationMs: number;
  artifactDir: string;
  message?: string;
};

describe("runRealPageFixtureMatrix P6", () => {
  it("执行 P6 增强矩阵并返回汇总统计", async () => {
    const matrixModule = (await import(matrixModuleUrl)) as {
      summarizeRealPageFailureTypes: (results: MatrixResultShape[]) => Record<string, number>;
      runRealPageFixtureMatrix: (options?: Record<string, unknown>) => Promise<{
        profile?: string;
        results: MatrixResultShape[];
        failed: MatrixResultShape[];
        successCount?: number;
        failureCount?: number;
        totalDurationMs?: number;
        averageDurationMs?: number;
        failureTypeCounts?: Record<string, number>;
      }>;
    };

    const summary = await matrixModule.runRealPageFixtureMatrix({
      headless: true,
      profile: "p6",
    });

    expect(summary.profile).toBe("p6");
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
      "session-expired-retry",
      "bulk-cross-page-selection",
      "drawer-double-save",
    ]);
    expect(summary.failed).toHaveLength(0);
    expect(summary.successCount).toBe(18);
    expect(summary.failureCount).toBe(0);
    expect(summary.totalDurationMs).toBeGreaterThan(0);
    expect(summary.averageDurationMs).toBeGreaterThan(0);
    expect(summary.failureTypeCounts).toEqual({});
    expect(matrixModule.summarizeRealPageFailureTypes(summary.results)).toEqual({});
  });

  it("按场景族汇总失败类型", async () => {
    const matrixModule = (await import(matrixModuleUrl)) as {
      summarizeRealPageFailureTypes: (results: MatrixResultShape[]) => Record<string, number>;
    };

    const failureTypeCounts = matrixModule.summarizeRealPageFailureTypes([
      {
        name: "session-expired-retry",
        status: "failed",
        stepCount: 4,
        durationMs: 1200,
        artifactDir: "/tmp/session-expired-retry",
        message: "第一次恢复会话失败",
      },
      {
        name: "bulk-cross-page-selection",
        status: "failed",
        stepCount: 6,
        durationMs: 980,
        artifactDir: "/tmp/bulk-cross-page-selection",
        message: "跨页选择摘要没有进入 ready 态",
      },
      {
        name: "drawer-double-save",
        status: "failed",
        stepCount: 7,
        durationMs: 1430,
        artifactDir: "/tmp/drawer-double-save",
        message: "修正后二次保存没有成功",
      },
      {
        name: "linked-filters",
        status: "failed",
        stepCount: 5,
        durationMs: 860,
        artifactDir: "/tmp/linked-filters",
        message: "团队筛选没有更新",
      },
      {
        name: "checkbox-select",
        status: "success",
        stepCount: 5,
        durationMs: 430,
        artifactDir: "/tmp/checkbox-select",
      },
    ]);

    expect(failureTypeCounts).toEqual({
      "session-recovery": 1,
      "bulk-selection": 1,
      "drawer-save": 1,
      filtering: 1,
    });
  });
});
