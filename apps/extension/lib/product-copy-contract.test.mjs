import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { describe, expect, it } from "vitest";

describe("扩展首次连接文案", () => {
  it("离线恢复不要求用户理解开发环境", () => {
    const mainSource = readFileSync(
      fileURLToPath(new URL("../entrypoints/sidepanel/main.ts", import.meta.url)),
      "utf8",
    );
    const htmlSource = readFileSync(
      fileURLToPath(new URL("../entrypoints/sidepanel/index.html", import.meta.url)),
      "utf8",
    );

    expect(`${mainSource}\n${htmlSource}`).not.toMatch(/pnpm|3847|dev:web/);
    expect(mainSource).toContain("未连接织流 Studio");
    expect(htmlSource).toContain("保存到 Studio");
  });

  it("侧栏提供完整录制状态机、完成预览、命名保存与清空恢复入口", () => {
    const mainSource = readFileSync(
      fileURLToPath(new URL("../entrypoints/sidepanel/main.ts", import.meta.url)),
      "utf8",
    );
    const htmlSource = readFileSync(
      fileURLToPath(new URL("../entrypoints/sidepanel/index.html", import.meta.url)),
      "utf8",
    );

    for (const id of [
      "start-btn",
      "pause-btn",
      "resume-btn",
      "complete-btn",
      "step-preview",
      "target-sites",
      "task-name",
      "restore-btn",
    ]) {
      expect(htmlSource).toContain(`id="${id}"`);
    }
    expect(htmlSource).toContain("开始录制");
    expect(htmlSource).toContain("完成录制");
    expect(htmlSource).toContain("确认名称并保存到 Studio");
    expect(mainSource).toContain("window.confirm");
    expect(mainSource).toContain("MSG_RESTORE_CLEARED_SESSION");
    expect(mainSource).toContain("MSG_SET_TASK_NAME");
  });

  it("直接导出 JSON 前也会先持久化用户输入的任务名称", () => {
    const mainSource = readFileSync(
      fileURLToPath(new URL("../entrypoints/sidepanel/main.ts", import.meta.url)),
      "utf8",
    );
    const exportHandler = mainSource.slice(
      mainSource.indexOf('exportBtn?.addEventListener("click"'),
      mainSource.indexOf('clearBtn?.addEventListener("click"'),
    );

    expect(mainSource).toContain("async function persistTaskName");
    expect(exportHandler).toContain("await persistTaskName()");
    expect(exportHandler.indexOf("await persistTaskName()")).toBeLessThan(
      exportHandler.indexOf("MSG_EXPORT_FLOW"),
    );
    expect(exportHandler).toContain("processExportFlowDownload(response, downloadJson)");
    expect(exportHandler).not.toContain("downloadJson(response.filename, response.json)");
    expect(exportHandler).toContain("catch");
    expect(exportHandler).not.toContain("error.message");
    expect(exportHandler).not.toMatch(/完全脱敏|完全匿名|绝对安全/);
  });
});
