import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import type { StudioFlowRef, StudioProject } from "./shared/studio-api-types.js";
import { App } from "./App.js";

const LAYOUT_CONTRACT_STATE_KEY = Symbol.for("flowweave.studio.layout-contract-state");

const flow: FlowDocument = {
  schemaVersion: 1,
  id: "flow-business-contract-uuid",
  projectId: "project-business-contract-uuid",
  name: "提交每日报表",
  variables: [
    { name: "reportDate", type: "string", required: true },
    { name: "secret_password", type: "string", required: true },
  ],
  steps: [{ id: "step-1", type: "navigate", url: "/reports" }],
  meta: {
    createdAt: "2026-08-23T08:00:00.000Z",
    updatedAt: "2026-08-23T08:00:00.000Z",
    source: "recorded",
  },
};

const projects: StudioProject[] = [
  {
    id: "project-business-contract-uuid",
    name: "财务运营",
    createdAt: "2026-08-23T08:00:00.000Z",
    baseUrl: "https://finance.example.test",
    environments: [
      {
        name: "正式环境",
        baseUrl: "https://finance.example.test",
        isDefault: true,
        storageStatePath: "/tmp/auth.json",
      },
    ],
  },
];

const flows: StudioFlowRef[] = [
  {
    id: flow.id,
    name: flow.name,
    createdAt: "2026-08-23T08:00:00.000Z",
    revision: 1,
    schemaVersion: flow.schemaVersion,
  },
];

function renderBusinessApp(): string {
  const testGlobal = globalThis as typeof globalThis & {
    [LAYOUT_CONTRACT_STATE_KEY]?: unknown;
  };
  testGlobal[LAYOUT_CONTRACT_STATE_KEY] = {
    projects,
    selectedProjectId: projects[0]?.id,
    flows,
    selectedFlowId: flow.id,
    currentFlow: flow,
    selectedEnvironmentName: "正式环境",
    baseUrlDraft: "https://finance.example.test",
    storageStatePathDraft: "/tmp/auth.json",
    variableInputs: { reportDate: "2026-08-23" },
  };
  try {
    return renderToStaticMarkup(<App />);
  } finally {
    delete testGlobal[LAYOUT_CONTRACT_STATE_KEY];
  }
}

function removeCollapsedDetails(html: string): string {
  return html.replace(/<details(?![^>]*\sopen(?:=|\s|>))[^>]*>[\s\S]*?<\/details>/g, "");
}

describe("Studio 业务视图合同", () => {
  it("默认突出项目、自动化任务、目标站点、必要参数与独立运行区", () => {
    const html = renderBusinessApp();

    expect(html).toContain("财务运营");
    expect(html).toContain("提交每日报表");
    expect(html).toContain("目标站点");
    expect(html).toContain("finance.example.test");
    expect(html).toContain("必要参数");
    expect(html).toContain('class="run-workspace"');
    expect(html).toContain("项目");
    expect(html).toContain("自动化任务");
    expect(html).toContain("任务步骤");
    expect(html).toContain("运行记录");
  });

  it("把内部阶段、标识符、登录态路径和底层术语收进折叠的高级区域", () => {
    const visibleHtml = removeCollapsedDetails(renderBusinessApp());

    expect(visibleHtml).not.toMatch(
      /\bP2\b|flow-business-contract-uuid|Storage State|preflight|locator|原始 JSON/,
    );
    expect(renderBusinessApp()).toContain("高级设置");
    expect(renderBusinessApp()).toContain("专业诊断");
  });
});
