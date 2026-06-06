import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { FlowDocument } from "../packages/flow-dsl/src/index.ts";
import {
  buildFlowFromEvents,
  type BuildFlowFromEventsMeta,
} from "../packages/recorder/src/index.ts";
import { executeFlow, type ExecutionOptions } from "../packages/runtime/src/index.ts";
import { parseRecordedEvent } from "../packages/shared/src/index.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(repoRoot, "examples/fixtures");

type MatrixCase = {
  name: string;
  flow: FlowDocument;
  options?: Pick<ExecutionOptions, "storageStatePath" | "variables">;
};

type MatrixRuntimeAssets = {
  uploadFileA: string;
  uploadFileB: string;
  storageStatePath: string;
  expiredStorageStatePath: string;
  placeholderFixtureUrl: string;
};

export type RecordedReplayMatrixProfile = "baseline";

export type RecordedReplayCaseResult = {
  name: string;
  status: "success" | "failed";
  stepCount: number;
  durationMs: number;
  artifactDir: string;
  message?: string;
};

export type RecordedReplayMatrixSummary = {
  profile: RecordedReplayMatrixProfile;
  baseUrl: string;
  workspaceDir: string;
  results: RecordedReplayCaseResult[];
  failed: RecordedReplayCaseResult[];
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
};

function buildRecordedFlowMeta(flowId: string, name: string): BuildFlowFromEventsMeta {
  return {
    sessionId: `${flowId}_session`,
    projectId: "recorded-replay-smoke",
    startedAt: "2026-06-07T00:00:00.000Z",
    flowId,
    name,
  };
}

async function startStaticServer(rootDir: string): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = join(rootDir, pathname.slice(1));

    try {
      const body = readFileSync(filePath);
      response.writeHead(200, {
        "Content-Type": filePath.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function writeStorageState(
  filePath: string,
  origin: string,
  localStorage: Array<{ name: string; value: string }>,
) {
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin,
            localStorage,
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function buildPlaceholderDisambiguationHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <label for="primary-keyword">主搜索词</label>
    <input id="primary-keyword" type="text" placeholder="主搜索词" />

    <label for="archive-reason">归档原因</label>
    <input id="archive-reason" type="text" placeholder="归档原因" />

    <button id="submit-form" type="button">提交</button>
    <p id="submit-status" data-state="idle">待提交</p>

    <script>
      const primaryKeyword = document.getElementById("primary-keyword");
      const archiveReason = document.getElementById("archive-reason");
      const submitStatus = document.getElementById("submit-status");

      document.getElementById("submit-form").addEventListener("click", () => {
        if (
          primaryKeyword.value === "" &&
          archiveReason.value === "仅写入目标字段"
        ) {
          submitStatus.dataset.state = "matched";
          submitStatus.textContent = "已写入归档原因";
          return;
        }

        submitStatus.dataset.state = "missed";
        submitStatus.textContent =
          "主搜索词=" +
          (primaryKeyword.value || "空") +
          "；归档原因=" +
          (archiveReason.value || "空");
      });
    </script>
  </body>
</html>`;
}

function buildMatrixRuntimeAssets(baseUrl: string, workspaceDir: string): MatrixRuntimeAssets {
  const uploadFileA = join(workspaceDir, "evidence-a.txt");
  const uploadFileB = join(workspaceDir, "evidence-b.txt");
  writeFileSync(uploadFileA, "alpha", "utf-8");
  writeFileSync(uploadFileB, "beta", "utf-8");

  const storageStatePath = join(workspaceDir, "session-storage-state.json");
  writeStorageState(storageStatePath, new URL(baseUrl).origin, [
    {
      name: "flowweave:session-user",
      value: "录制回放用户",
    },
  ]);

  const expiredStorageStatePath = join(workspaceDir, "session-expired-storage-state.json");
  writeStorageState(expiredStorageStatePath, new URL(baseUrl).origin, [
    {
      name: "flowweave:session-user",
      value: "矩阵验证用户",
    },
    {
      name: "flowweave:session-status",
      value: "expired",
    },
  ]);

  const placeholderFixturePath = join(workspaceDir, "placeholder-disambiguation.html");
  writeFileSync(placeholderFixturePath, buildPlaceholderDisambiguationHtml(), "utf-8");

  return {
    uploadFileA,
    uploadFileB,
    storageStatePath,
    expiredStorageStatePath,
    placeholderFixtureUrl: pathToFileURL(placeholderFixturePath).href,
  };
}

function buildBaselineMatrixCases(baseUrl: string, assets: MatrixRuntimeAssets): MatrixCase[] {
  const uploadFormFixtureUrl = new URL("upload-form.html", baseUrl).toString();
  const spaRouteFixtureUrl = new URL("spa-route.html", baseUrl).toString();
  const filterableListFixtureUrl = new URL("filterable-list.html", baseUrl).toString();
  const contenteditableEditorFixtureUrl = new URL(
    "contenteditable-editor.html",
    baseUrl,
  ).toString();
  const sessionExpiredRetryFixtureUrl = new URL("session-expired-retry.html", baseUrl).toString();
  const sessionDashboardFixtureUrl = new URL("session-dashboard.html", baseUrl).toString();
  const bulkCrossPageSelectionFixtureUrl = new URL(
    "bulk-cross-page-selection.html",
    baseUrl,
  ).toString();
  const linkedFiltersFixtureUrl = new URL("linked-filters.html", baseUrl).toString();
  const drawerDoubleSaveFixtureUrl = new URL("drawer-double-save.html", baseUrl).toString();
  const repeatedRowActionsFixtureUrl = new URL("repeated-row-actions.html", baseUrl).toString();

  return [
    {
      name: "upload-form",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_upload",
            type: "navigate",
            timestamp: 0,
            url: uploadFormFixtureUrl,
            payload: {
              url: "upload-form.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_fill_operator",
            type: "fill",
            timestamp: 100,
            url: uploadFormFixtureUrl,
            payload: {
              selector: "#operator-name",
              role: "textbox",
              name: "经办人",
              value: "值班同学",
              inputType: "text",
              tagName: "input",
              nameAttr: "operatorName",
              labelText: "经办人",
            },
          }),
          parseRecordedEvent({
            id: "evt_upload",
            type: "fill",
            timestamp: 200,
            url: uploadFormFixtureUrl,
            payload: {
              selector: "#evidence-files",
              testId: "evidence-files",
              inputType: "file",
              files: ["{{upload_evidencefiles_1}}", "{{upload_evidencefiles_2}}"],
              fileNames: ["evidence-a.txt", "evidence-b.txt"],
              tagName: "input",
              nameAttr: "evidenceFiles",
              labelText: "上传素材",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_submit_upload",
            type: "click",
            timestamp: 300,
            url: uploadFormFixtureUrl,
            payload: {
              selector: "#submit-upload",
              role: "button",
              name: "提交上传",
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_upload", "录制上传流程"),
      ),
      options: {
        variables: {
          upload_evidencefiles_1: assets.uploadFileA,
          upload_evidencefiles_2: assets.uploadFileB,
        },
      },
    },
    {
      name: "spa-route",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_spa",
            type: "navigate",
            timestamp: 0,
            url: spaRouteFixtureUrl,
            payload: {
              url: "spa-route.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_settings",
            type: "click",
            timestamp: 100,
            url: spaRouteFixtureUrl,
            payload: {
              selector: "#nav-settings",
              role: "button",
              name: "设置",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_ready_card",
            type: "click",
            timestamp: 200,
            url: `${spaRouteFixtureUrl}#settings`,
            payload: {
              selector: "#route-card[data-ready='true']",
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_spa_route", "录制路由流程"),
      ),
    },
    {
      name: "filterable-list",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_filter",
            type: "navigate",
            timestamp: 0,
            url: filterableListFixtureUrl,
            payload: {
              url: "filterable-list.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_fill_keyword",
            type: "fill",
            timestamp: 100,
            url: filterableListFixtureUrl,
            payload: {
              selector: "#keyword",
              role: "textbox",
              name: "关键字",
              value: "{{筛选关键字}}",
              inputType: "text",
              tagName: "input",
              nameAttr: "keyword",
              labelText: "关键字",
            },
          }),
          parseRecordedEvent({
            id: "evt_select_status",
            type: "select",
            timestamp: 200,
            url: filterableListFixtureUrl,
            payload: {
              selector: "#status-filter",
              testId: "status-filter",
              values: ["{{筛选.状态}}"],
              tagName: "select",
              nameAttr: "statusFilter",
              labelText: "任务状态",
            },
          }),
          parseRecordedEvent({
            id: "evt_apply_filter",
            type: "click",
            timestamp: 300,
            url: filterableListFixtureUrl,
            payload: {
              selector: "#apply-filters",
              role: "button",
              name: "应用筛选",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_summary",
            type: "click",
            timestamp: 400,
            url: filterableListFixtureUrl,
            payload: {
              selector: "#filter-summary[data-ready='true'][data-count='2']",
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_filterable_list", "录制列表筛选流程"),
      ),
      options: {
        variables: {
          筛选关键字: "待同步",
          "筛选.状态": "needs-review",
        },
      },
    },
    {
      name: "contenteditable-editor",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_contenteditable",
            type: "navigate",
            timestamp: 0,
            url: contenteditableEditorFixtureUrl,
            payload: {
              url: "contenteditable-editor.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_focus_editor",
            type: "click",
            timestamp: 100,
            url: contenteditableEditorFixtureUrl,
            payload: {
              selector: "#editor-body",
              role: "textbox",
              name: "交接备注",
              tagName: "div",
              textSample: "已补齐截图与重试说明",
            },
          }),
          parseRecordedEvent({
            id: "evt_fill_editor",
            type: "fill",
            timestamp: 180,
            url: contenteditableEditorFixtureUrl,
            payload: {
              selector: "#editor-body",
              role: "textbox",
              name: "交接备注",
              value: "{{noteContent}}",
              tagName: "div",
              textSample: "已补齐截图与重试说明",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_save_note",
            type: "click",
            timestamp: 260,
            url: contenteditableEditorFixtureUrl,
            payload: {
              selector: "#save-note",
              role: "button",
              name: "保存备注",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_note_status",
            type: "click",
            timestamp: 340,
            url: contenteditableEditorFixtureUrl,
            payload: {
              selector: "#note-status",
              text: "已保存",
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_contenteditable_editor", "录制富文本备注流程"),
      ),
      options: {
        variables: {
          noteContent: "已补齐截图与重试说明，待值班同学二次复核。",
        },
      },
    },
    {
      name: "session-expired-retry",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_session_retry",
            type: "navigate",
            timestamp: 0,
            url: sessionExpiredRetryFixtureUrl,
            payload: {
              url: "session-expired-retry.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_refresh_session",
            type: "click",
            timestamp: 100,
            url: sessionExpiredRetryFixtureUrl,
            payload: {
              selector: "#refresh-session",
              role: "button",
              name: "恢复会话",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_retry_session",
            type: "click",
            timestamp: 220,
            url: sessionExpiredRetryFixtureUrl,
            payload: {
              selector: "#retry-session",
              role: "button",
              name: "再次重试",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_refresh_result",
            type: "click",
            timestamp: 340,
            url: sessionExpiredRetryFixtureUrl,
            payload: {
              selector: "#refresh-result",
              text: "第 2 次重试成功",
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_session_expired_retry", "录制会话恢复重试流程"),
      ),
      options: {
        storageStatePath: assets.expiredStorageStatePath,
      },
    },
    {
      name: "bulk-cross-page-selection",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_bulk_cross_page",
            type: "navigate",
            timestamp: 0,
            url: bulkCrossPageSelectionFixtureUrl,
            payload: {
              url: "bulk-cross-page-selection.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_check_batch_301",
            type: "click",
            timestamp: 100,
            url: bulkCrossPageSelectionFixtureUrl,
            payload: {
              selector: "#select-batch-301",
              inputType: "checkbox",
              checked: true,
              tagName: "input",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_next_page",
            type: "click",
            timestamp: 180,
            url: bulkCrossPageSelectionFixtureUrl,
            payload: {
              selector: "#next-page",
              role: "button",
              name: "下一页",
            },
          }),
          parseRecordedEvent({
            id: "evt_check_batch_304",
            type: "click",
            timestamp: 260,
            url: bulkCrossPageSelectionFixtureUrl,
            payload: {
              selector: "#select-batch-304",
              inputType: "checkbox",
              checked: true,
              tagName: "input",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_submit_selection",
            type: "click",
            timestamp: 340,
            url: bulkCrossPageSelectionFixtureUrl,
            payload: {
              selector: "#submit-selection",
              role: "button",
              name: "提交批量归档",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_result_status",
            type: "click",
            timestamp: 420,
            url: bulkCrossPageSelectionFixtureUrl,
            payload: {
              selector: "#result-status",
              text: "已跨 2 页提交 2 条归档",
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_bulk_cross_page_selection", "录制跨页批量选择流程"),
      ),
    },
    {
      name: "repeated-row-actions",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_repeated_row_actions",
            type: "navigate",
            timestamp: 0,
            url: repeatedRowActionsFixtureUrl,
            payload: {
              url: "repeated-row-actions.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_target_row_action",
            type: "click",
            timestamp: 100,
            url: repeatedRowActionsFixtureUrl,
            payload: {
              strategies: [
                { kind: "role", role: "button", name: "编辑" },
                { kind: "text", text: "编辑", exact: true },
              ],
              tagName: "button",
              textSample: "编辑",
              scopeText: "华东运营日报",
              scopeKind: "row",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_ready_repeated_row_result",
            type: "click",
            timestamp: 200,
            url: repeatedRowActionsFixtureUrl,
            payload: {
              selector: "#result-panel[data-ready='true'][data-target-row='campaign-204']",
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_repeated_row_actions", "录制重复行同文案按钮流程"),
      ),
    },
    {
      name: "linked-filters",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_linked_filters",
            type: "navigate",
            timestamp: 0,
            url: linkedFiltersFixtureUrl,
            payload: {
              url: "linked-filters.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_select_business_unit",
            type: "select",
            timestamp: 100,
            url: linkedFiltersFixtureUrl,
            payload: {
              selector: "#business-unit",
              values: ["growth"],
              tagName: "select",
              nameAttr: "businessUnit",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_team_filter",
            type: "click",
            timestamp: 900,
            url: linkedFiltersFixtureUrl,
            payload: {
              role: "combobox",
              name: "团队",
            },
          }),
          parseRecordedEvent({
            id: "evt_select_team_filter",
            type: "select",
            timestamp: 950,
            url: linkedFiltersFixtureUrl,
            payload: {
              selector: "#team-filter",
              values: ["growth-east"],
              tagName: "select",
              nameAttr: "teamFilter",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_apply_linked_filters",
            type: "click",
            timestamp: 1100,
            url: linkedFiltersFixtureUrl,
            payload: {
              selector: "#apply-linked-filters",
              role: "button",
              name: "应用联动筛选",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_linked_result",
            type: "click",
            timestamp: 1900,
            url: linkedFiltersFixtureUrl,
            payload: {
              selector: "#linked-result[data-ready='true'][data-team='growth-east']",
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_linked_filters", "录制联动筛选流程"),
      ),
    },
    {
      name: "session-dashboard",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_session_dashboard",
            type: "navigate",
            timestamp: 0,
            url: sessionDashboardFixtureUrl,
            payload: {
              url: "session-dashboard.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_open_report",
            type: "click",
            timestamp: 100,
            url: sessionDashboardFixtureUrl,
            payload: {
              selector: "#open-report",
              role: "button",
              name: "打开日报",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_report_owner",
            type: "click",
            timestamp: 200,
            url: sessionDashboardFixtureUrl,
            payload: {
              strategies: [{ kind: "text", text: "当前负责人：录制回放用户", exact: true }],
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_session_dashboard", "录制登录态仪表盘流程"),
      ),
      options: {
        storageStatePath: assets.storageStatePath,
      },
    },
    {
      name: "drawer-double-save",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_drawer_double_save",
            type: "navigate",
            timestamp: 0,
            url: drawerDoubleSaveFixtureUrl,
            payload: {
              url: "drawer-double-save.html",
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_open_drawer",
            type: "click",
            timestamp: 100,
            url: drawerDoubleSaveFixtureUrl,
            payload: {
              selector: "#edit-rule-720",
              role: "button",
              name: "打开 Drawer",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_save_drawer_first",
            type: "click",
            timestamp: 200,
            url: drawerDoubleSaveFixtureUrl,
            payload: {
              selector: "#save-drawer",
              role: "button",
              name: "保存修改",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_save_alert",
            type: "click",
            timestamp: 1000,
            url: drawerDoubleSaveFixtureUrl,
            payload: {
              selector: "#save-alert[data-state='error']",
            },
          }),
          parseRecordedEvent({
            id: "evt_fill_review_note",
            type: "fill",
            timestamp: 1100,
            url: drawerDoubleSaveFixtureUrl,
            payload: {
              selector: "#drawer-review-note",
              role: "textbox",
              name: "复核备注",
              value: "已补充失败原因与修正动作，允许二次保存。",
              tagName: "textarea",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_save_drawer_second",
            type: "click",
            timestamp: 1200,
            url: drawerDoubleSaveFixtureUrl,
            payload: {
              selector: "#save-drawer",
              role: "button",
              name: "保存修改",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_result_status",
            type: "click",
            timestamp: 2200,
            url: drawerDoubleSaveFixtureUrl,
            payload: {
              strategies: [{ kind: "text", text: "第二次保存成功并已回填列表", exact: true }],
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_drawer_double_save", "录制抽屉二次保存流程"),
      ),
    },
    {
      name: "placeholder-disambiguation",
      flow: buildFlowFromEvents(
        [
          parseRecordedEvent({
            id: "evt_nav_placeholder",
            type: "navigate",
            timestamp: 0,
            url: assets.placeholderFixtureUrl,
            payload: {
              url: assets.placeholderFixtureUrl,
              waitUntil: "domcontentloaded",
            },
          }),
          parseRecordedEvent({
            id: "evt_fill_archive_reason",
            type: "fill",
            timestamp: 100,
            url: assets.placeholderFixtureUrl,
            payload: {
              strategies: [{ kind: "css", selector: "input[type='text']" }],
              value: "仅写入目标字段",
              tagName: "input",
              inputType: "text",
              placeholder: "归档原因",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_submit_placeholder",
            type: "click",
            timestamp: 200,
            url: assets.placeholderFixtureUrl,
            payload: {
              selector: "#submit-form",
              role: "button",
              name: "提交",
            },
          }),
          parseRecordedEvent({
            id: "evt_click_status_placeholder",
            type: "click",
            timestamp: 300,
            url: assets.placeholderFixtureUrl,
            payload: {
              selector: "#submit-status[data-state='matched']",
              text: "已写入归档原因",
            },
          }),
        ],
        buildRecordedFlowMeta("flow_recorded_placeholder_disambiguation", "录制输入框消解流程"),
      ),
    },
  ];
}

function summarizeMatrixResults(
  profile: RecordedReplayMatrixProfile,
  baseUrl: string,
  workspaceDir: string,
  results: RecordedReplayCaseResult[],
): RecordedReplayMatrixSummary {
  const failed = results.filter((item) => item.status === "failed");
  const successCount = results.length - failed.length;
  const failureCount = failed.length;
  const totalDurationMs = results.reduce((sum, item) => sum + item.durationMs, 0);

  return {
    profile,
    baseUrl,
    workspaceDir,
    results,
    failed,
    successCount,
    failureCount,
    totalDurationMs,
    averageDurationMs: results.length === 0 ? 0 : Math.round(totalDurationMs / results.length),
  };
}

export async function runRecordedReplayMatrix(
  options: { headless?: boolean; profile?: RecordedReplayMatrixProfile } = {},
): Promise<RecordedReplayMatrixSummary> {
  const profile = options.profile ?? "baseline";
  const workspaceDir = mkdtempSync(join(tmpdir(), "flowweave-recorded-replay-smoke-"));
  const { server, baseUrl } = await startStaticServer(fixturesDir);
  const assets = buildMatrixRuntimeAssets(baseUrl, workspaceDir);
  const cases = buildBaselineMatrixCases(baseUrl, assets);
  const results: RecordedReplayCaseResult[] = [];

  try {
    for (const item of cases) {
      const artifactDir = join(workspaceDir, item.name);
      const startedAt = Date.now();
      const result = await executeFlow(item.flow, {
        headless: options.headless ?? true,
        baseUrl,
        artifactDir,
        ...item.options,
      });
      const failedStep = result.steps.find((step) => step.status === "failed");

      results.push({
        name: item.name,
        status: result.status,
        stepCount: result.steps.length,
        durationMs: Date.now() - startedAt,
        artifactDir,
        message: failedStep?.message ?? result.error?.message,
      });
    }
  } finally {
    await closeServer(server);
  }

  return summarizeMatrixResults(profile, baseUrl, workspaceDir, results);
}

function printSummary(summary: RecordedReplayMatrixSummary) {
  console.log(`矩阵档位: ${summary.profile}`);
  console.log(`录制回放 Base URL: ${summary.baseUrl}`);
  console.log(`临时工作目录: ${summary.workspaceDir}`);
  console.log(`基准数量: ${summary.results.length}`);
  console.log(`成功 / 失败: ${summary.successCount} / ${summary.failureCount}`);
  console.log(`总耗时: ${summary.totalDurationMs}ms`);
  console.log(`平均耗时: ${summary.averageDurationMs}ms`);

  for (const item of summary.results) {
    const statusLabel = item.status === "success" ? "成功" : "失败";
    console.log(`  - ${item.name}: ${statusLabel} (${item.stepCount} 步, ${item.durationMs}ms)`);
    console.log(`    产物目录: ${item.artifactDir}`);
    if (item.message) {
      console.log(`    失败信息: ${item.message}`);
    }
  }
}

export async function main() {
  const summary = await runRecordedReplayMatrix({ headless: true });

  printSummary(summary);

  if (summary.failed.length > 0) {
    console.error(`失败数量: ${summary.failed.length}`);
    process.exitCode = 1;
    return;
  }

  console.log("录制回放烟测矩阵全部通过。");
}

function isDirectExecution() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
