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
      getRecordedReplayCaseCatalog: () => Array<{
        name: string;
        stepCount: number;
        sourceKind: "fixture" | "runtime-generated";
        fixtureFile?: string;
      }>;
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
    const caseCatalog = matrixModule.getRecordedReplayCaseCatalog();
    const fixtureCases = caseCatalog.filter((item) => item.sourceKind === "fixture");
    const runtimeOnlyCases = caseCatalog.filter((item) => item.sourceKind === "runtime-generated");

    expect(summary.profile).toBe("baseline");
    expect(summary.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(caseCatalog).toHaveLength(24);
    expect(fixtureCases).toHaveLength(23);
    expect(runtimeOnlyCases).toEqual([
      {
        name: "placeholder-disambiguation",
        stepCount: 4,
        sourceKind: "runtime-generated",
      },
    ]);
    expect(fixtureCases.map((item) => item.name)).toEqual(
      expect.arrayContaining(["rerender-action-panel", "dialog-save-surface"]),
    );
    expect(fixtureCases.every((item) => item.fixtureFile === `${item.name}.html`)).toBe(true);
    expect(summary.results.map((item) => item.name)).toEqual(caseCatalog.map((item) => item.name));
    expect(summary.results.map((item) => [item.name, item.stepCount])).toEqual(
      caseCatalog.map((item) => [item.name, item.stepCount]),
    );
    expect(summary.results.every((item) => item.status === "success")).toBe(true);
    expect(summary.results.every((item) => item.durationMs > 0)).toBe(true);
    expect(summary.results.every((item) => item.artifactDir.startsWith(summary.workspaceDir))).toBe(
      true,
    );
    expect(summary.failed).toHaveLength(0);
    expect(summary.successCount).toBe(24);
    expect(summary.failureCount).toBe(0);
    expect(summary.totalDurationMs).toBeGreaterThan(0);
    expect(summary.averageDurationMs).toBeGreaterThan(0);
  }, 120_000);
});
