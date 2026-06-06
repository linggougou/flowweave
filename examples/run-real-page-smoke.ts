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
    console.log(`  - ${item.name}: ${item.status} (${item.stepCount} 步, ${item.durationMs}ms)`);
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
