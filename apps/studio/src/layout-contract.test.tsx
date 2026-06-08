import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

import { App, type AppInitialState } from "./App.js";

const STYLESHEET = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
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

function buildInitialState(): AppInitialState {
  return {
    tab: "flow",
    projects: Array.from({ length: 40 }, (_, index) => ({
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
    })),
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
    executionHistory: [
      {
        executionId: "execution_recent",
        flowId: "flow_layout_contract",
        status: "passed",
        startedAt: "2026-06-09T00:01:00.000Z",
        finishedAt: "2026-06-09T00:02:00.000Z",
        environmentName: "预发环境",
      },
    ],
    selectedEnvironmentName: "预发环境",
    baseUrlDraft: "https://example-1.test",
    storageStatePathDraft: "/tmp/project-1.json",
    variableInputs: {
      username: "alice",
    },
  };
}

function renderApp() {
  return renderToStaticMarkup(<App initialState={buildInitialState()} />);
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

    expect(projectSection.start).toBeGreaterThan(sidebarScroll.start);
    expect(projectSection.end).toBeLessThanOrEqual(sidebarScroll.end);
    expect(html.match(/class="project-item(?: active)?"/g)).toHaveLength(40);
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

    expect(mainHtml.match(/class="flow-content-panel"/g)).toHaveLength(2);
    expect(mainHtml).toContain("运行环境");
    expect(mainHtml).toContain("布局合同回归");
    expect(STYLESHEET).toMatch(/\.main\s*>\s*\*\s*{[^}]*flex-shrink:\s*0;[^}]*}/s);
    expect(STYLESHEET).toMatch(
      /\.flow-content-panel\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*0 0 auto;[^}]*min-height:\s*auto;[^}]*}/s,
    );
  });
});
