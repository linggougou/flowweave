import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { StudioFlowRef, StudioProject } from "./shared/studio-api-types.js";
import type { VariableInputs } from "./shared/run-input-state.js";

import { App } from "./App.js";

const STYLESHEET = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const LAYOUT_CONTRACT_STATE_KEY = Symbol.for("flowweave.studio.layout-contract-state");
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function buildFlow(): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_layout_contract",
    projectId: "project_layout_contract",
    name: "布局合同回归",
    variables: [
      {
        name: "username",
        type: "string",
        required: true,
      },
      {
        name: "secret_password",
        type: "string",
        required: true,
      },
    ],
    steps: [
      {
        id: "step_1",
        type: "navigate",
        url: "/dashboard",
      },
    ],
    meta: {
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
      source: "recorded",
    },
  };
}

type LayoutContractRenderState = {
  projects: StudioProject[];
  selectedProjectId: string;
  flows: StudioFlowRef[];
  selectedFlowId: string;
  currentFlow: FlowDocument;
  selectedEnvironmentName: string;
  baseUrlDraft: string;
  storageStatePathDraft: string;
  variableInputs: VariableInputs;
};

function buildProjects(): StudioProject[] {
  return Array.from({ length: 40 }, (_, index) => ({
    id: `project-${index + 1}`,
    name: `项目 ${index + 1}`,
    createdAt: "2026-06-09T00:00:00.000Z",
    baseUrl: `https://example-${index + 1}.test`,
    environments: [
      {
        name: "预发环境",
        baseUrl: `https://example-${index + 1}.test`,
        isDefault: true,
        storageStatePath: `/tmp/project-${index + 1}.json`,
      },
    ],
  }));
}

function buildLayoutContractRenderState(): LayoutContractRenderState {
  return {
    projects: buildProjects(),
    selectedProjectId: "project-1",
    flows: [
      {
        id: "flow_layout_contract",
        name: "布局合同回归",
        createdAt: "2026-06-09T00:00:00.000Z",
      },
    ],
    selectedFlowId: "flow_layout_contract",
    currentFlow: buildFlow(),
    selectedEnvironmentName: "预发环境",
    baseUrlDraft: "https://example-1.test",
    storageStatePathDraft: "/tmp/project-1.json",
    variableInputs: {
      username: "alice",
    },
  };
}

function renderApp() {
  const testGlobal = globalThis as typeof globalThis & {
    [LAYOUT_CONTRACT_STATE_KEY]?: LayoutContractRenderState;
  };

  testGlobal[LAYOUT_CONTRACT_STATE_KEY] = buildLayoutContractRenderState();
  try {
    return renderToStaticMarkup(<App />);
  } finally {
    delete testGlobal[LAYOUT_CONTRACT_STATE_KEY];
  }
}

function findElementRange(html: string, marker: string): { start: number; end: number } {
  const markerIndex = html.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);

  const openTagStart = html.lastIndexOf("<", markerIndex);
  expect(openTagStart).toBeGreaterThanOrEqual(0);

  const tagRegex = /<\/?([a-z0-9-]+)(?:\s[^<>]*?)?>/gi;
  tagRegex.lastIndex = openTagStart;

  let depth = 0;
  let foundStart = false;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const [token, rawTagName] = match;
    if (!rawTagName) {
      throw new Error(`标记 ${marker} 缺少标签名`);
    }
    const tagName = rawTagName.toLowerCase();
    const isClosingTag = token.startsWith("</");
    const isSelfClosing = token.endsWith("/>") || VOID_TAGS.has(tagName);

    if (!foundStart) {
      if (match.index !== openTagStart) {
        continue;
      }
      foundStart = true;
    }

    if (isClosingTag) {
      depth -= 1;
      if (depth === 0) {
        return {
          start: openTagStart,
          end: tagRegex.lastIndex,
        };
      }
      continue;
    }

    if (!isSelfClosing) {
      depth += 1;
    }
  }

  throw new Error(`无法为标记 ${marker} 找到闭合元素`);
}

describe("Studio layout contract", () => {
  it("把项目列表放在真实侧栏滚动容器内", () => {
    const html = renderApp();

    const sidebarScroll = findElementRange(html, 'class="sidebar-scroll"');
    const projectSection = findElementRange(
      html,
      'class="sidebar-section sidebar-section-projects"',
    );
    const projectList = findElementRange(html, 'class="project-list"');
    const sidebarHtml = html.slice(sidebarScroll.start, sidebarScroll.end);
    const projectListHtml = html.slice(projectList.start, projectList.end);

    expect(projectSection.start).toBeGreaterThan(sidebarScroll.start);
    expect(projectSection.end).toBeLessThanOrEqual(sidebarScroll.end);
    expect(projectList.start).toBeGreaterThan(projectSection.start);
    expect(projectList.end).toBeLessThanOrEqual(projectSection.end);
    expect(projectList.end).toBeLessThanOrEqual(sidebarScroll.end);
    expect(sidebarHtml).toContain('class="project-list"');
    expect(sidebarHtml).toContain('aria-label="刷新当前项目"');
    expect(projectListHtml.match(/class="project-item(?: active)?"/g)).toHaveLength(40);
    expect(sidebarHtml.match(/class="project-item(?: active)?"/g)).toHaveLength(40);
  });

  it("为左侧滚动链路保留必要的 flex 与 overflow 合同", () => {
    expect(STYLESHEET).toMatch(
      /\.sidebar\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;[^}]*}/s,
    );
    expect(STYLESHEET).toMatch(
      /\.sidebar-scroll\s*{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*}/s,
    );
  });

  it("保持右侧主面板为独立的非收缩块，避免纵向重叠回归", () => {
    const html = renderApp();
    const main = findElementRange(html, 'class="main"');
    const mainHtml = html.slice(main.start, main.end);

    expect(mainHtml.match(/class="flow-content-panel"/g)).toHaveLength(1);
    expect(mainHtml).toContain('class="run-workspace"');
    expect(mainHtml).toContain("目标站点");
    expect(mainHtml).toContain("布局合同回归");
    expect(mainHtml).toContain('type="password"');
    expect(STYLESHEET).toMatch(/\.main\s*>\s*\*\s*{[^}]*flex-shrink:\s*0;[^}]*}/s);
    expect(STYLESHEET).toMatch(
      /\.flow-content-panel\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*0 0 auto;[^}]*min-height:\s*auto;[^}]*}/s,
    );
    expect(STYLESHEET).toMatch(
      /@media \(max-width:\s*680px\)\s*{[\s\S]*?\.app\s*{[^}]*display:\s*block;[^}]*min-height:\s*100vh;[^}]*}/s,
    );
  });
});
