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
  failureType?: string;
};

type MatrixSlowCaseShape = {
  rank: number;
  name: string;
  status: string;
  stepCount: number;
  durationMs: number;
  failureType?: string;
};

type MatrixSuccessCoverageShape = {
  failureType: string;
  label: string;
  caseCount: number;
  successCount: number;
  failureCount: number;
};

describe("runRealPageFixtureMatrix P7", () => {
  it("执行 P7 增强矩阵并返回汇总统计", async () => {
    const matrixModule = (await import(matrixModuleUrl)) as {
      getRealPageFixtureCatalog: (
        profile?: string,
      ) => Array<{ name: string; stepCount: number; fixtureFile: string }>;
      summarizeRealPageFailureTypes: (results: MatrixResultShape[]) => Record<string, number>;
      summarizeRealPageSlowestCases: (
        results: MatrixResultShape[],
        limit?: number,
      ) => MatrixSlowCaseShape[];
      summarizeRealPageSuccessCoverage: (
        results: MatrixResultShape[],
      ) => MatrixSuccessCoverageShape[];
      runRealPageFixtureMatrix: (options?: Record<string, unknown>) => Promise<{
        profile?: string;
        results: MatrixResultShape[];
        failed: MatrixResultShape[];
        successCount?: number;
        failureCount?: number;
        totalDurationMs?: number;
        averageDurationMs?: number;
        failureTypeCounts?: Record<string, number>;
        slowestCases?: MatrixSlowCaseShape[];
        successCoverage?: MatrixSuccessCoverageShape[];
      }>;
    };

    const summary = await matrixModule.runRealPageFixtureMatrix({
      headless: true,
      profile: "p7",
    });

    const p7Catalog = matrixModule.getRealPageFixtureCatalog("p7");

    expect(summary.profile).toBe("p7");
    expect(matrixModule.getRealPageFixtureCatalog("baseline")).toHaveLength(13);
    expect(matrixModule.getRealPageFixtureCatalog("p5")).toHaveLength(17);
    expect(matrixModule.getRealPageFixtureCatalog("p6")).toHaveLength(20);
    expect(p7Catalog).toHaveLength(21);
    expect(p7Catalog.every((item) => item.fixtureFile === `${item.name}.html`)).toBe(true);
    expect(summary.results.map((item) => item.name)).toEqual(p7Catalog.map((item) => item.name));
    expect(summary.results.map((item) => [item.name, item.stepCount])).toEqual(
      p7Catalog.map((item) => [item.name, item.stepCount]),
    );
    expect(summary.totalDurationMs).toBeGreaterThan(0);
    expect(summary.averageDurationMs).toBeGreaterThan(0);
    expect(summary.slowestCases).toHaveLength(5);
    expect(summary.slowestCases?.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5]);
    for (let index = 1; index < (summary.slowestCases?.length ?? 0); index += 1) {
      expect(summary.slowestCases?.[index - 1]?.durationMs).toBeGreaterThanOrEqual(
        summary.slowestCases?.[index]?.durationMs ?? 0,
      );
    }
    expect(new Set(summary.slowestCases?.map((item) => item.name)).size).toBe(5);
    const repeatedRowResult = summary.results.find((item) => item.name === "repeated-row-actions");
    const coreInteractionCoverage = summary.successCoverage?.find(
      (item) => item.failureType === "core-interaction",
    );

    expect(repeatedRowResult).toBeDefined();
    expect(repeatedRowResult?.failureType).toBe(
      repeatedRowResult?.status === "failed" ? "core-interaction" : undefined,
    );

    if (repeatedRowResult?.status === "success") {
      expect(summary.failed).toHaveLength(0);
      expect(summary.successCount).toBe(21);
      expect(summary.failureCount).toBe(0);
      expect(summary.failureTypeCounts).toEqual({});
      expect(summary.successCoverage).toEqual([
        {
          failureType: "core-interaction",
          label: "基础交互",
          caseCount: 7,
          successCount: 7,
          failureCount: 0,
        },
        {
          failureType: "upload-submission",
          label: "上传提交流程",
          caseCount: 1,
          successCount: 1,
          failureCount: 0,
        },
        {
          failureType: "session-recovery",
          label: "会话恢复",
          caseCount: 3,
          successCount: 3,
          failureCount: 0,
        },
        {
          failureType: "filtering",
          label: "筛选联动",
          caseCount: 2,
          successCount: 2,
          failureCount: 0,
        },
        {
          failureType: "confirmation",
          label: "确认提交流程",
          caseCount: 2,
          successCount: 2,
          failureCount: 0,
        },
        {
          failureType: "pagination",
          label: "分页切换",
          caseCount: 1,
          successCount: 1,
          failureCount: 0,
        },
        {
          failureType: "drawer-save",
          label: "抽屉保存",
          caseCount: 2,
          successCount: 2,
          failureCount: 0,
        },
        {
          failureType: "contenteditable",
          label: "富文本编辑",
          caseCount: 1,
          successCount: 1,
          failureCount: 0,
        },
        {
          failureType: "retry-recovery",
          label: "结果重试恢复",
          caseCount: 1,
          successCount: 1,
          failureCount: 0,
        },
        {
          failureType: "bulk-selection",
          label: "跨页批量选择",
          caseCount: 1,
          successCount: 1,
          failureCount: 0,
        },
      ]);
    } else {
      expect(summary.failed).toHaveLength(1);
      expect(summary.failed[0]?.name).toBe("repeated-row-actions");
      expect(summary.successCount).toBe(20);
      expect(summary.failureCount).toBe(1);
      expect(summary.failureTypeCounts).toEqual({
        "core-interaction": 1,
      });
      expect(coreInteractionCoverage).toEqual({
        failureType: "core-interaction",
        label: "基础交互",
        caseCount: 7,
        successCount: 6,
        failureCount: 1,
      });
    }

    expect(matrixModule.summarizeRealPageFailureTypes(summary.results)).toEqual(
      summary.failureTypeCounts,
    );
    expect(matrixModule.summarizeRealPageSlowestCases(summary.results)).toHaveLength(5);
    expect(matrixModule.summarizeRealPageSuccessCoverage(summary.results)).toEqual(
      summary.successCoverage,
    );
  }, 120_000);

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
      {
        name: "repeated-row-actions",
        status: "failed",
        stepCount: 4,
        durationMs: 780,
        artifactDir: "/tmp/repeated-row-actions",
        message: "重复行操作误点到第一条记录",
      },
    ]);

    expect(failureTypeCounts).toEqual({
      "session-recovery": 1,
      "bulk-selection": 1,
      "drawer-save": 1,
      filtering: 1,
      "core-interaction": 1,
    });
  });

  it("按耗时生成最慢场景排行并在相同耗时时保持原顺序", async () => {
    const matrixModule = (await import(matrixModuleUrl)) as {
      summarizeRealPageSlowestCases: (
        results: MatrixResultShape[],
        limit?: number,
      ) => MatrixSlowCaseShape[];
    };

    const slowestCases = matrixModule.summarizeRealPageSlowestCases(
      [
        {
          name: "checkbox-select",
          status: "success",
          stepCount: 5,
          durationMs: 420,
          artifactDir: "/tmp/checkbox-select",
        },
        {
          name: "modal-bulk-action",
          status: "failed",
          stepCount: 6,
          durationMs: 1260,
          artifactDir: "/tmp/modal-bulk-action",
          failureType: "confirmation",
        },
        {
          name: "linked-filters",
          status: "success",
          stepCount: 5,
          durationMs: 1260,
          artifactDir: "/tmp/linked-filters",
        },
        {
          name: "drawer-double-save",
          status: "success",
          stepCount: 9,
          durationMs: 980,
          artifactDir: "/tmp/drawer-double-save",
        },
      ],
      3,
    );

    expect(slowestCases).toEqual([
      {
        rank: 1,
        name: "modal-bulk-action",
        status: "failed",
        stepCount: 6,
        durationMs: 1260,
        failureType: "confirmation",
      },
      {
        rank: 2,
        name: "linked-filters",
        status: "success",
        stepCount: 5,
        durationMs: 1260,
      },
      {
        rank: 3,
        name: "drawer-double-save",
        status: "success",
        stepCount: 9,
        durationMs: 980,
      },
    ]);
  });

  it("按场景族汇总成功覆盖摘要", async () => {
    const matrixModule = (await import(matrixModuleUrl)) as {
      summarizeRealPageSuccessCoverage: (
        results: MatrixResultShape[],
      ) => MatrixSuccessCoverageShape[];
    };

    const successCoverage = matrixModule.summarizeRealPageSuccessCoverage([
      {
        name: "session-dashboard",
        status: "success",
        stepCount: 3,
        durationMs: 760,
        artifactDir: "/tmp/session-dashboard",
      },
      {
        name: "session-expired-retry",
        status: "failed",
        stepCount: 5,
        durationMs: 1400,
        artifactDir: "/tmp/session-expired-retry",
      },
      {
        name: "filterable-list",
        status: "success",
        stepCount: 4,
        durationMs: 840,
        artifactDir: "/tmp/filterable-list",
      },
      {
        name: "linked-filters",
        status: "success",
        stepCount: 5,
        durationMs: 930,
        artifactDir: "/tmp/linked-filters",
      },
      {
        name: "toast-popconfirm",
        status: "failed",
        stepCount: 5,
        durationMs: 880,
        artifactDir: "/tmp/toast-popconfirm",
      },
      {
        name: "repeated-row-actions",
        status: "success",
        stepCount: 4,
        durationMs: 910,
        artifactDir: "/tmp/repeated-row-actions",
      },
    ]);

    expect(successCoverage).toEqual([
      {
        failureType: "session-recovery",
        label: "会话恢复",
        caseCount: 2,
        successCount: 1,
        failureCount: 1,
      },
      {
        failureType: "filtering",
        label: "筛选联动",
        caseCount: 2,
        successCount: 2,
        failureCount: 0,
      },
      {
        failureType: "confirmation",
        label: "确认提交流程",
        caseCount: 1,
        successCount: 0,
        failureCount: 1,
      },
      {
        failureType: "core-interaction",
        label: "基础交互",
        caseCount: 1,
        successCount: 1,
        failureCount: 0,
      },
    ]);
  });
});
