import {
  getRealPageFailureTypeLabel,
  runRealPageFixtureMatrix,
  type RealPageFailureType,
} from "./real-page-smoke.ts";

async function main() {
  const summary = await runRealPageFixtureMatrix({ headless: true, profile: "p6" });

  console.log(`矩阵档位: ${summary.profile}`);
  console.log(`真实页面基准 Base URL: ${summary.baseUrl}`);
  console.log(`临时工作目录: ${summary.workspaceDir}`);
  console.log(`基准数量: ${summary.results.length}`);
  console.log(`成功 / 失败: ${summary.successCount} / ${summary.failureCount}`);
  console.log(`总耗时: ${summary.totalDurationMs}ms`);
  console.log(`平均耗时: ${summary.averageDurationMs}ms`);
  if (summary.successCoverage.length === 0) {
    console.log("成功态摘要: 无");
  } else {
    console.log("成功态摘要（按场景族）:");
    for (const item of summary.successCoverage) {
      const failureSuffix = item.failureCount > 0 ? `，失败 ${item.failureCount}` : "";
      console.log(`  - ${item.label}: ${item.successCount}/${item.caseCount} 通过${failureSuffix}`);
    }
  }
  if (summary.slowestCases.length === 0) {
    console.log("最慢场景排行: 无");
  } else {
    console.log("最慢场景排行（Top 5）:");
    for (const item of summary.slowestCases) {
      const statusLabel = item.status === "success" ? "成功" : "失败";
      const failureSuffix = item.failureType
        ? `，失败类型：${getRealPageFailureTypeLabel(item.failureType)}`
        : "";
      console.log(
        `  ${item.rank}. ${item.name}: ${item.durationMs}ms，${item.stepCount} 步，状态：${statusLabel}${failureSuffix}`,
      );
    }
  }
  if (Object.keys(summary.failureTypeCounts).length === 0) {
    console.log("失败类型统计: 无");
  } else {
    console.log("失败类型统计:");
    for (const [failureType, count] of Object.entries(summary.failureTypeCounts) as Array<
      [RealPageFailureType, number]
    >) {
      console.log(`  - ${getRealPageFailureTypeLabel(failureType)}: ${count}`);
    }
  }

  for (const item of summary.results) {
    const statusLabel = item.status === "success" ? "成功" : "失败";
    console.log(`  - ${item.name}: ${statusLabel} (${item.stepCount} 步, ${item.durationMs}ms)`);
    console.log(`    产物目录: ${item.artifactDir}`);
    if (item.failureType) {
      console.log(`    失败类型: ${getRealPageFailureTypeLabel(item.failureType)}`);
    }
    if (item.message) {
      console.log(`    失败信息: ${item.message}`);
    }
  }

  if (summary.failed.length > 0) {
    console.error(`失败数量: ${summary.failed.length}`);
    process.exitCode = 1;
    return;
  }

  console.log("真实页面基准矩阵全部通过。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
