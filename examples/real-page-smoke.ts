import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FlowDocument } from "../packages/flow-dsl/src/index.ts";
import { executeFlow, type ExecutionOptions } from "../packages/runtime/src/index.ts";
import { FLOW_SCHEMA_VERSION } from "../packages/shared/src/index.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(repoRoot, "examples/fixtures");

type MatrixCase = {
  name: string;
  flow: FlowDocument;
  options?: Pick<ExecutionOptions, "variables" | "storageStatePath">;
};

type MatrixRuntimeAssets = {
  uploadFileA: string;
  uploadFileB: string;
  storageStatePath: string;
  expiredStorageStatePath: string;
};

export type RealPageMatrixProfile = "baseline" | "p5" | "p6" | "p7";

export type RealPageFailureType =
  | "core-interaction"
  | "upload-submission"
  | "session-recovery"
  | "filtering"
  | "confirmation"
  | "pagination"
  | "drawer-save"
  | "contenteditable"
  | "retry-recovery"
  | "bulk-selection"
  | "unknown";

export type RealPageFailureTypeCounts = Partial<Record<RealPageFailureType, number>>;

const REAL_PAGE_FAILURE_TYPE_LABELS: Record<RealPageFailureType, string> = {
  "core-interaction": "基础交互",
  "upload-submission": "上传提交流程",
  "session-recovery": "会话恢复",
  filtering: "筛选联动",
  confirmation: "确认提交流程",
  pagination: "分页切换",
  "drawer-save": "抽屉保存",
  contenteditable: "富文本编辑",
  "retry-recovery": "结果重试恢复",
  "bulk-selection": "跨页批量选择",
  unknown: "未知类型",
};

const CASE_FAILURE_TYPE_MAP: Record<string, RealPageFailureType> = {
  "checkbox-select": "core-interaction",
  "delayed-panel": "core-interaction",
  "spa-route": "core-interaction",
  "tabbed-workspace": "core-interaction",
  "upload-form": "upload-submission",
  "session-dashboard": "session-recovery",
  "session-expired-dashboard": "session-recovery",
  "session-expired-retry": "session-recovery",
  "filterable-list": "filtering",
  "linked-filters": "filtering",
  "keyboard-command-palette": "core-interaction",
  "modal-bulk-action": "confirmation",
  "toast-popconfirm": "confirmation",
  "paginated-list": "pagination",
  "drawer-edit-form": "drawer-save",
  "drawer-double-save": "drawer-save",
  "contenteditable-editor": "contenteditable",
  "empty-results-retry": "retry-recovery",
  "bulk-cross-page-selection": "bulk-selection",
  "repeated-row-actions": "core-interaction",
};

export type RealPageFixtureCaseResult = {
  name: string;
  status: "success" | "failed";
  stepCount: number;
  durationMs: number;
  artifactDir: string;
  message?: string;
  failureType?: RealPageFailureType;
};

export type RealPageSlowCase = {
  rank: number;
  name: string;
  status: "success" | "failed";
  stepCount: number;
  durationMs: number;
  failureType?: RealPageFailureType;
};

export type RealPageSuccessCoverageSummary = {
  failureType: RealPageFailureType;
  label: string;
  caseCount: number;
  successCount: number;
  failureCount: number;
};

export type RealPageFixtureMatrixSummary = {
  profile: RealPageMatrixProfile;
  baseUrl: string;
  workspaceDir: string;
  results: RealPageFixtureCaseResult[];
  failed: RealPageFixtureCaseResult[];
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  failureTypeCounts: RealPageFailureTypeCounts;
  slowestCases: RealPageSlowCase[];
  successCoverage: RealPageSuccessCoverageSummary[];
};

function buildFlow(id: string, name: string, steps: FlowDocument["steps"]): FlowDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id,
    projectId: "real-page-benchmark",
    name,
    variables: [],
    steps,
    meta: {
      createdAt: now,
      updatedAt: now,
      source: "manual",
    },
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

function buildMatrixRuntimeAssets(baseUrl: string, workspaceDir: string): MatrixRuntimeAssets {
  const uploadFileA = join(workspaceDir, "evidence-a.txt");
  const uploadFileB = join(workspaceDir, "evidence-b.txt");
  writeFileSync(uploadFileA, "alpha", "utf-8");
  writeFileSync(uploadFileB, "beta", "utf-8");

  const storageStatePath = join(workspaceDir, "session-storage-state.json");
  const origin = new URL(baseUrl).origin;
  writeStorageState(storageStatePath, origin, [
    {
      name: "flowweave:session-user",
      value: "矩阵验证用户",
    },
  ]);

  const expiredStorageStatePath = join(workspaceDir, "session-expired-storage-state.json");
  writeStorageState(expiredStorageStatePath, origin, [
    {
      name: "flowweave:session-user",
      value: "矩阵验证用户",
    },
    {
      name: "flowweave:session-status",
      value: "expired",
    },
  ]);

  return {
    uploadFileA,
    uploadFileB,
    storageStatePath,
    expiredStorageStatePath,
  };
}

function resolveRealPageFailureType(caseName: string): RealPageFailureType {
  return CASE_FAILURE_TYPE_MAP[caseName] ?? "unknown";
}

export function getRealPageFailureTypeLabel(failureType: RealPageFailureType): string {
  return REAL_PAGE_FAILURE_TYPE_LABELS[failureType];
}

export function summarizeRealPageFailureTypes(
  results: Array<Pick<RealPageFixtureCaseResult, "name" | "status" | "failureType">>,
): RealPageFailureTypeCounts {
  const counts: RealPageFailureTypeCounts = {};

  for (const item of results) {
    if (item.status === "success") {
      continue;
    }
    const failureType = item.failureType ?? resolveRealPageFailureType(item.name);
    counts[failureType] = (counts[failureType] ?? 0) + 1;
  }

  return counts;
}

export function summarizeRealPageSlowestCases(
  results: Array<
    Pick<
      RealPageFixtureCaseResult,
      "name" | "status" | "stepCount" | "durationMs" | "failureType"
    >
  >,
  limit = 5,
): RealPageSlowCase[] {
  if (limit <= 0) {
    return [];
  }

  return results
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (right.item.durationMs !== left.item.durationMs) {
        return right.item.durationMs - left.item.durationMs;
      }
      return left.index - right.index;
    })
    .slice(0, limit)
    .map(({ item }, index) => ({
      rank: index + 1,
      name: item.name,
      status: item.status,
      stepCount: item.stepCount,
      durationMs: item.durationMs,
      failureType:
        item.status === "failed"
          ? (item.failureType ?? resolveRealPageFailureType(item.name))
          : undefined,
    }));
}

export function summarizeRealPageSuccessCoverage(
  results: Array<Pick<RealPageFixtureCaseResult, "name" | "status" | "failureType">>,
): RealPageSuccessCoverageSummary[] {
  const coverage = new Map<RealPageFailureType, RealPageSuccessCoverageSummary>();

  for (const item of results) {
    const failureType = item.failureType ?? resolveRealPageFailureType(item.name);
    const existing =
      coverage.get(failureType) ??
      ({
        failureType,
        label: getRealPageFailureTypeLabel(failureType),
        caseCount: 0,
        successCount: 0,
        failureCount: 0,
      } satisfies RealPageSuccessCoverageSummary);

    existing.caseCount += 1;
    if (item.status === "success") {
      existing.successCount += 1;
    } else {
      existing.failureCount += 1;
    }

    coverage.set(failureType, existing);
  }

  return Array.from(coverage.values());
}

function buildBaselineMatrixCases({
  uploadFileA,
  uploadFileB,
  storageStatePath,
  expiredStorageStatePath,
}: MatrixRuntimeAssets): MatrixCase[] {
  return [
    {
      name: "checkbox-select",
      flow: buildFlow("flow_checkbox_select", "勾选与下拉流程", [
        { id: "s1", type: "navigate", url: "checkbox-select.html", waitUntil: "domcontentloaded" },
        {
          id: "s2",
          type: "select",
          target: { strategies: [{ kind: "testId", testId: "city-select" }] },
          values: ["hangzhou"],
        },
        {
          id: "s3",
          type: "setChecked",
          target: { strategies: [{ kind: "testId", testId: "agree-checkbox" }] },
          checked: true,
        },
        {
          id: "s4",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#save-preferences" }] },
        },
        {
          id: "s5",
          type: "wait",
          condition: "visible",
          target: { strategies: [{ kind: "css", selector: "#result-panel[data-ready='true']" }] },
        },
      ]),
    },
    {
      name: "delayed-panel",
      flow: buildFlow("flow_delayed_panel", "延迟面板等待流程", [
        { id: "s1", type: "navigate", url: "delayed-panel.html", waitUntil: "domcontentloaded" },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#load-panel" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#loading-indicator" }] },
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: { strategies: [{ kind: "css", selector: "#report-panel[data-ready='true']" }] },
        },
      ]),
    },
    {
      name: "upload-form",
      flow: buildFlow("flow_upload_form", "上传表单流程", [
        { id: "s1", type: "navigate", url: "upload-form.html", waitUntil: "domcontentloaded" },
        {
          id: "s2",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#operator-name" }] },
          value: "{{operator}}",
        },
        {
          id: "s3",
          type: "upload",
          target: { strategies: [{ kind: "testId", testId: "evidence-files" }] },
          files: ["{{fileA}}", "{{fileB}}"],
        },
        {
          id: "s4",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#submit-upload" }] },
        },
        {
          id: "s5",
          type: "wait",
          condition: "visible",
          target: { strategies: [{ kind: "css", selector: "#upload-result[data-ready='true']" }] },
        },
      ]),
      options: {
        variables: {
          operator: "矩阵值班同学",
          fileA: uploadFileA,
          fileB: uploadFileB,
        },
      },
    },
    {
      name: "spa-route",
      flow: buildFlow("flow_spa_route", "路由等待流程", [
        { id: "s1", type: "navigate", url: "spa-route.html", waitUntil: "domcontentloaded" },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#nav-settings" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes: "#settings",
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: { strategies: [{ kind: "css", selector: "#route-card[data-ready='true']" }] },
        },
      ]),
    },
    {
      name: "session-dashboard",
      flow: buildFlow("flow_session_dashboard", "登录态环境流程", [
        {
          id: "s1",
          type: "navigate",
          url: "session-dashboard.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#open-report" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "visible",
          target: { strategies: [{ kind: "css", selector: "#report-panel[data-ready='true']" }] },
        },
      ]),
      options: {
        storageStatePath,
      },
    },
    {
      name: "keyboard-command-palette",
      flow: buildFlow("flow_keyboard_command_palette", "命令面板键盘回放流程", [
        {
          id: "s1",
          type: "navigate",
          url: "keyboard-command-palette.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#command-search" }] },
          value: "导出",
        },
        {
          id: "s3",
          type: "press",
          target: { strategies: [{ kind: "css", selector: "#command-search" }] },
          key: "ArrowDown",
        },
        {
          id: "s4",
          type: "press",
          target: { strategies: [{ kind: "css", selector: "#command-search" }] },
          key: "Enter",
        },
        {
          id: "s5",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#command-toast[data-ready='true'][data-command-id='export-daily']",
              },
            ],
          },
        },
      ]),
    },
    {
      name: "filterable-list",
      flow: buildFlow("flow_filterable_list", "列表筛选流程", [
        {
          id: "s1",
          type: "navigate",
          url: "filterable-list.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#keyword" }] },
          value: "待同步",
        },
        {
          id: "s3",
          type: "select",
          target: { strategies: [{ kind: "testId", testId: "status-filter" }] },
          values: ["needs-review"],
        },
        {
          id: "s4",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#apply-filters" }] },
        },
        {
          id: "s5",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#filter-loading" }] },
        },
        {
          id: "s6",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#filter-summary[data-ready='true'][data-count='2']",
              },
            ],
          },
        },
      ]),
    },
    {
      name: "modal-bulk-action",
      flow: buildFlow("flow_modal_bulk_action", "弹窗批量归档流程", [
        {
          id: "s1",
          type: "navigate",
          url: "modal-bulk-action.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "setChecked",
          target: { strategies: [{ kind: "testId", testId: "bulk-row-checkbox" }] },
          checked: true,
        },
        {
          id: "s3",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#open-archive-modal" }] },
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: { strategies: [{ kind: "css", selector: "#archive-modal[data-ready='true']" }] },
        },
        {
          id: "s5",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#archive-reason" }] },
          value: "已完成补件并同步知识库",
        },
        {
          id: "s6",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#confirm-archive" }] },
        },
        {
          id: "s7",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#archive-modal" }] },
        },
        {
          id: "s8",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#archive-result[data-ready='true']",
              },
            ],
          },
        },
      ]),
    },
    {
      name: "session-expired-dashboard",
      flow: buildFlow("flow_session_expired_dashboard", "会话失效恢复流程", [
        {
          id: "s1",
          type: "navigate",
          url: "session-expired-dashboard.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#refresh-session" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#session-refreshing" }] },
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#dashboard-panel[data-ready='true']",
              },
            ],
          },
        },
      ]),
      options: {
        storageStatePath: expiredStorageStatePath,
      },
    },
    {
      name: "paginated-list",
      flow: buildFlow("flow_paginated_list", "分页列表切换流程", [
        {
          id: "s1",
          type: "navigate",
          url: "paginated-list.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#next-page" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#pagination-loading" }] },
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#page-summary[data-ready='true'][data-page='2']",
              },
            ],
          },
        },
      ]),
    },
    {
      name: "drawer-edit-form",
      flow: buildFlow("flow_drawer_edit_form", "抽屉表单编辑流程", [
        {
          id: "s1",
          type: "navigate",
          url: "drawer-edit-form.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#edit-rule-512" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "visible",
          target: { strategies: [{ kind: "css", selector: "#edit-drawer[data-ready='true']" }] },
        },
        {
          id: "s4",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#drawer-owner" }] },
          value: "江遥",
        },
        {
          id: "s5",
          type: "select",
          target: { strategies: [{ kind: "css", selector: "#drawer-priority" }] },
          values: ["p0"],
        },
        {
          id: "s6",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#save-drawer" }] },
        },
        {
          id: "s7",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#edit-drawer" }] },
        },
        {
          id: "s8",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#drawer-result[data-ready='true']",
              },
            ],
          },
        },
      ]),
    },
    {
      name: "toast-popconfirm",
      flow: buildFlow("flow_toast_popconfirm", "轻量确认提交流程", [
        {
          id: "s1",
          type: "navigate",
          url: "toast-popconfirm.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#open-popconfirm" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#toast-popconfirm[data-ready='true']",
              },
            ],
          },
        },
        {
          id: "s4",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#toast-confirm" }] },
        },
        {
          id: "s5",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#toast-popconfirm" }] },
        },
        {
          id: "s6",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#toast-result[data-ready='true']",
              },
            ],
          },
        },
      ]),
    },
  ];
}

function buildP5MatrixCases(): MatrixCase[] {
  return [
    {
      name: "tabbed-workspace",
      flow: buildFlow("flow_tabbed_workspace", "同页 Tab 切换流程", [
        {
          id: "s1",
          type: "navigate",
          url: "tabbed-workspace.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#tab-approvals" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#tab-loading" }] },
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#panel-approvals[data-ready='true']",
              },
            ],
          },
        },
      ]),
    },
    {
      name: "contenteditable-editor",
      flow: buildFlow("flow_contenteditable_editor", "富文本备注编辑流程", [
        {
          id: "s1",
          type: "navigate",
          url: "contenteditable-editor.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "fill",
          target: {
            strategies: [
              { kind: "css", selector: "#editor-body" },
              { kind: "role", role: "textbox", name: "交接备注" },
            ],
          },
          value: "已补齐截图与重试说明，待值班同学二次复核。",
        },
        {
          id: "s3",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#save-note" }] },
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#note-result[data-ready='true']",
              },
            ],
          },
        },
      ]),
    },
    {
      name: "empty-results-retry",
      flow: buildFlow("flow_empty_results_retry", "空结果重试恢复流程", [
        {
          id: "s1",
          type: "navigate",
          url: "empty-results-retry.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#run-query" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#empty-state[data-ready='true']",
              },
            ],
          },
        },
        {
          id: "s4",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#retry-query" }] },
        },
        {
          id: "s5",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#query-loading" }] },
        },
        {
          id: "s6",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#result-panel[data-ready='true'][data-count='3']",
              },
            ],
          },
        },
      ]),
    },
    {
      name: "linked-filters",
      flow: buildFlow("flow_linked_filters", "联动筛选流程", [
        {
          id: "s1",
          type: "navigate",
          url: "linked-filters.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "select",
          target: { strategies: [{ kind: "css", selector: "#business-unit" }] },
          values: ["growth"],
        },
        {
          id: "s3",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#filter-loading" }] },
        },
        {
          id: "s4",
          type: "select",
          target: { strategies: [{ kind: "css", selector: "#team-filter" }] },
          values: ["growth-east"],
        },
        {
          id: "s5",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#apply-linked-filters" }] },
        },
        {
          id: "s6",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#filter-loading" }] },
        },
        {
          id: "s7",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#linked-result[data-ready='true'][data-team='growth-east']",
              },
            ],
          },
        },
      ]),
    },
  ];
}

function buildP6MatrixCases({ expiredStorageStatePath }: MatrixRuntimeAssets): MatrixCase[] {
  return [
    {
      name: "session-expired-retry",
      flow: buildFlow("flow_session_expired_retry", "会话恢复失败后二次重试流程", [
        {
          id: "s1",
          type: "navigate",
          url: "session-expired-retry.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#refresh-session" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#refresh-alert[data-state='failed']",
              },
            ],
          },
        },
        {
          id: "s4",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#retry-session" }] },
        },
        {
          id: "s5",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#session-refreshing" }] },
        },
        {
          id: "s6",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#dashboard-panel[data-ready='true']",
              },
            ],
          },
        },
      ]),
      options: {
        storageStatePath: expiredStorageStatePath,
      },
    },
    {
      name: "bulk-cross-page-selection",
      flow: buildFlow("flow_bulk_cross_page_selection", "跨页批量选择提交流程", [
        {
          id: "s1",
          type: "navigate",
          url: "bulk-cross-page-selection.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "setChecked",
          target: { strategies: [{ kind: "css", selector: "#select-batch-301" }] },
          checked: true,
        },
        {
          id: "s3",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#next-page" }] },
        },
        {
          id: "s4",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#selection-loading" }] },
        },
        {
          id: "s5",
          type: "setChecked",
          target: { strategies: [{ kind: "css", selector: "#select-batch-304" }] },
          checked: true,
        },
        {
          id: "s6",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#submit-selection" }] },
        },
        {
          id: "s7",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#bulk-result[data-ready='true'][data-count='2']",
              },
            ],
          },
        },
      ]),
    },
    {
      name: "drawer-double-save",
      flow: buildFlow("flow_drawer_double_save", "抽屉首次保存失败后修正重提流程", [
        {
          id: "s1",
          type: "navigate",
          url: "drawer-double-save.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#edit-rule-720" }] },
        },
        {
          id: "s3",
          type: "wait",
          condition: "visible",
          target: { strategies: [{ kind: "css", selector: "#edit-drawer[data-ready='true']" }] },
        },
        {
          id: "s4",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#save-drawer" }] },
        },
        {
          id: "s5",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#save-alert[data-state='error']",
              },
            ],
          },
        },
        {
          id: "s6",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#drawer-review-note" }] },
          value: "已补充失败原因与修正动作，允许二次保存。",
        },
        {
          id: "s7",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#save-drawer" }] },
        },
        {
          id: "s8",
          type: "wait",
          condition: "hidden",
          target: { strategies: [{ kind: "css", selector: "#edit-drawer" }] },
        },
        {
          id: "s9",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#save-result[data-ready='true']",
              },
            ],
          },
        },
      ]),
    },
  ];
}

function buildP7MatrixCases(): MatrixCase[] {
  return [
    {
      name: "repeated-row-actions",
      flow: buildFlow("flow_repeated_row_actions", "重复行同文案按钮消歧流程", [
        {
          id: "s1",
          type: "navigate",
          url: "repeated-row-actions.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: {
            strategies: [
              { kind: "role", role: "button", name: "编辑" },
              { kind: "text", text: "编辑", exact: true },
            ],
            hints: {
              scopeText: "华东运营日报",
              scopeKind: "row",
              textSample: "编辑",
            },
          },
        },
        {
          id: "s3",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#result-panel[data-ready='true'][data-target-row='campaign-204']",
              },
            ],
          },
        },
      ]),
    },
  ];
}

function normalizeRealPageMatrixProfile(
  profile?: RealPageMatrixProfile,
): RealPageMatrixProfile {
  // 兼容现有 CLI 仍传入 p6；Benchmarks P7 起这里统一执行最新矩阵。
  if (profile === "p6") {
    return "p7";
  }

  return profile ?? "baseline";
}

export async function runRealPageFixtureMatrix(
  options: { headless?: boolean; profile?: RealPageMatrixProfile } = {},
): Promise<RealPageFixtureMatrixSummary> {
  const profile = normalizeRealPageMatrixProfile(options.profile);
  const workspaceDir = mkdtempSync(join(tmpdir(), "flowweave-real-page-smoke-"));
  const { server, baseUrl } = await startStaticServer(fixturesDir);
  const assets = buildMatrixRuntimeAssets(baseUrl, workspaceDir);
  const baselineCases = buildBaselineMatrixCases(assets);
  const p5Cases = [...baselineCases, ...buildP5MatrixCases()];
  const p6Cases = [...p5Cases, ...buildP6MatrixCases(assets)];
  const p7Cases = [...p6Cases, ...buildP7MatrixCases()];
  const cases =
    profile === "p7"
      ? p7Cases
      : profile === "p6"
        ? p6Cases
        : profile === "p5"
          ? p5Cases
          : baselineCases;
  const results: RealPageFixtureCaseResult[] = [];

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
      const failureType =
        result.status === "failed" ? resolveRealPageFailureType(item.name) : undefined;

      results.push({
        name: item.name,
        status: result.status,
        stepCount: result.steps.length,
        durationMs: Date.now() - startedAt,
        artifactDir,
        message: result.error?.message,
        failureType: failedStep ? failureType : undefined,
      });
    }
  } finally {
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

  const failed = results.filter((item) => item.status !== "success");
  const totalDurationMs = results.reduce((total, item) => total + item.durationMs, 0);
  const failureTypeCounts = summarizeRealPageFailureTypes(results);
  const slowestCases = summarizeRealPageSlowestCases(results);
  const successCoverage = summarizeRealPageSuccessCoverage(results);

  return {
    profile,
    baseUrl,
    workspaceDir,
    results,
    failed,
    successCount: results.length - failed.length,
    failureCount: failed.length,
    totalDurationMs,
    averageDurationMs: results.length === 0 ? 0 : Math.round(totalDurationMs / results.length),
    failureTypeCounts,
    slowestCases,
    successCoverage,
  };
}
