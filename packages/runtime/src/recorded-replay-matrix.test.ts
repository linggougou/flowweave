import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const matrixModuleUrl = pathToFileURL(join(repoRoot, "examples/recorded-replay-smoke.ts")).href;

type MatrixResultShape = {
  name: string;
  status: "success" | "failed";
  stepCount: number;
  durationMs: number;
  artifactDir: string;
  message?: string;
};

describe("runRecordedReplayMatrix baseline", () => {
  it("执行 recorded replay 基线矩阵并返回汇总", async () => {
    const matrixModule = (await import(matrixModuleUrl)) as {
      runRecordedReplayMatrix: (options?: { headless?: boolean }) => Promise<{
        profile: string;
        baseUrl: string;
        workspaceDir: string;
        results: MatrixResultShape[];
        failed: MatrixResultShape[];
        successCount: number;
        failureCount: number;
        totalDurationMs: number;
        averageDurationMs: number;
      }>;
    };

    const summary = await matrixModule.runRecordedReplayMatrix({ headless: true });

    expect(summary.profile).toBe("baseline");
    expect(summary.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(summary.results.map((item) => item.name)).toEqual([
      "upload-form",
      "spa-route",
      "filterable-list",
      "contenteditable-editor",
      "session-expired-retry",
      "bulk-cross-page-selection",
      "repeated-row-actions",
      "linked-filters",
      "keyboard-command-palette",
      "session-dashboard",
      "drawer-double-save",
      "placeholder-disambiguation",
    ]);
    expect(summary.results.map((item) => [item.name, item.stepCount])).toEqual([
      ["upload-form", 4],
      ["spa-route", 3],
      ["filterable-list", 5],
      ["contenteditable-editor", 4],
      ["session-expired-retry", 4],
      ["bulk-cross-page-selection", 6],
      ["repeated-row-actions", 3],
      ["linked-filters", 8],
      ["keyboard-command-palette", 5],
      ["session-dashboard", 3],
      ["drawer-double-save", 9],
      ["placeholder-disambiguation", 4],
    ]);
    expect(summary.results.every((item) => item.status === "success")).toBe(true);
    expect(summary.results.every((item) => item.durationMs > 0)).toBe(true);
    expect(summary.results.every((item) => item.artifactDir.startsWith(summary.workspaceDir))).toBe(
      true,
    );
    expect(summary.failed).toHaveLength(0);
    expect(summary.successCount).toBe(12);
    expect(summary.failureCount).toBe(0);
    expect(summary.totalDurationMs).toBeGreaterThan(0);
    expect(summary.averageDurationMs).toBeGreaterThan(0);
  });
});
