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

export type RealPageFixtureCaseResult = {
  name: string;
  status: "success" | "failed";
  stepCount: number;
  durationMs: number;
  artifactDir: string;
  message?: string;
};

export type RealPageFixtureMatrixSummary = {
  baseUrl: string;
  workspaceDir: string;
  results: RealPageFixtureCaseResult[];
  failed: RealPageFixtureCaseResult[];
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

function buildMatrixCases(baseUrl: string, workspaceDir: string): MatrixCase[] {
  const uploadFileA = join(workspaceDir, "evidence-a.txt");
  const uploadFileB = join(workspaceDir, "evidence-b.txt");
  writeFileSync(uploadFileA, "alpha", "utf-8");
  writeFileSync(uploadFileB, "beta", "utf-8");

  const storageStatePath = join(workspaceDir, "session-storage-state.json");
  writeFileSync(
    storageStatePath,
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin: new URL(baseUrl).origin,
            localStorage: [
              {
                name: "flowweave:session-user",
                value: "矩阵验证用户",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

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
  ];
}

export async function runRealPageFixtureMatrix(
  options: { headless?: boolean } = {},
): Promise<RealPageFixtureMatrixSummary> {
  const workspaceDir = mkdtempSync(join(tmpdir(), "flowweave-real-page-smoke-"));
  const { server, baseUrl } = await startStaticServer(fixturesDir);
  const cases = buildMatrixCases(baseUrl, workspaceDir);
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

      results.push({
        name: item.name,
        status: result.status,
        stepCount: result.steps.length,
        durationMs: Date.now() - startedAt,
        artifactDir,
        message: result.error?.message,
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

  return {
    baseUrl,
    workspaceDir,
    results,
    failed: results.filter((item) => item.status !== "success"),
  };
}
