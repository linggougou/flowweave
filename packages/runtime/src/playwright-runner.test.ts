import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { FlowDocument } from "@flowweave/flow-dsl";
import { executeFlow } from "./playwright-runner.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const loginFixtureUrl = pathToFileURL(
  join(repoRoot, "examples/fixtures/login.html"),
).href;
const fixturesDir = join(repoRoot, "examples/fixtures");
const fixturesBaseUrl = pathToFileURL(`${fixturesDir}/`).href;
const checkboxSelectFixtureUrl = pathToFileURL(
  join(fixturesDir, "checkbox-select.html"),
).href;
const delayedPanelFixtureUrl = pathToFileURL(
  join(fixturesDir, "delayed-panel.html"),
).href;
const uploadFormFixtureUrl = pathToFileURL(join(fixturesDir, "upload-form.html")).href;
const spaRouteFixtureUrl = pathToFileURL(join(fixturesDir, "spa-route.html")).href;

const baseMeta = {
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
  source: "manual" as const,
};

function buildLoginFlow(): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_login_fixture",
    projectId: "proj_test",
    name: "登录 Fixture 最小流程",
    variables: [],
    steps: [
      {
        id: "s1",
        type: "navigate",
        url: loginFixtureUrl,
        waitUntil: "domcontentloaded",
      },
      {
        id: "s2",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#username" }] },
        value: "demo",
      },
      {
        id: "s3",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#password" }] },
        value: "secret",
      },
      {
        id: "s4",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "#submit" }] },
      },
    ],
    meta: baseMeta,
  };
}

function buildFlow(id: string, name: string, steps: FlowDocument["steps"]): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id,
    projectId: "proj_test",
    name,
    variables: [],
    steps,
    meta: baseMeta,
  };
}

function buildPressFixtureHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <label for="keyword">关键字</label>
    <input id="keyword" type="text" />
    <p id="press-result" hidden>未触发</p>
    <button id="spawn" type="button">生成临时节点</button>

    <script>
      const keyword = document.getElementById("keyword");
      const result = document.getElementById("press-result");
      const spawn = document.getElementById("spawn");

      keyword.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
          return;
        }

        result.hidden = false;
        result.textContent = "已提交：" + keyword.value;
      });

      spawn.addEventListener("click", () => {
        const marker = document.createElement("div");
        marker.id = "ephemeral";
        marker.textContent = "临时节点";
        document.body.appendChild(marker);

        window.setTimeout(() => {
          marker.remove();
        }, 240);
      });
    </script>
  </body>
</html>`;
}

describe("executeFlow", () => {
  let artifactDir: string | undefined;
  const cleanupPaths = new Set<string>();

  afterEach(() => {
    if (artifactDir) {
      rmSync(artifactDir, { recursive: true, force: true });
      artifactDir = undefined;
    }
    for (const targetPath of cleanupPaths) {
      rmSync(targetPath, { recursive: true, force: true });
    }
    cleanupPaths.clear();
  });

  it("artifactDir 时每步写入截图文件", async () => {
    artifactDir = mkdtempSync(join(tmpdir(), "fw-runtime-artifacts-"));
    const result = await executeFlow(buildLoginFlow(), {
      headless: true,
      artifactDir,
    });
    expect(result.status).toBe("success");
    for (let i = 0; i < result.steps.length; i++) {
      const shot = join(artifactDir, `step-${i}.png`);
      expect(existsSync(shot)).toBe(true);
      expect(result.steps[i]?.screenshotPath).toBe(shot);
    }
  });

  it("对 login.html fixture 执行 navigate / fill / click 流程", async () => {
    const result = await executeFlow(buildLoginFlow(), { headless: true });

    expect(result.executionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(result.status).toBe("success");
    expect(result.steps).toHaveLength(4);
    expect(result.steps.every((s) => s.status === "success")).toBe(true);
    expect(result.steps.map((s) => s.type)).toEqual([
      "navigate",
      "fill",
      "fill",
      "click",
    ]);
  });

  it("支持相对路径 navigate、select、setChecked 与字符串变量替换", async () => {
    const result = await executeFlow(
      buildFlow("flow_checkbox_select", "勾选与下拉流程", [
        {
          id: "s1",
          type: "navigate",
          url: "{{fixtureName}}",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "select",
          target: { strategies: [{ kind: "testId", testId: "city-select" }] },
          values: ["{{city}}"],
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
          target: { strategies: [{ kind: "css", selector: "#result-panel" }] },
        },
      ]),
      {
        headless: true,
        baseUrl: fixturesBaseUrl,
        variables: {
          fixtureName: "checkbox-select.html",
          city: "hangzhou",
        },
      },
    );

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "select",
      "setChecked",
      "click",
      "wait",
    ]);
  });

  it("支持 upload 步骤与数组字符串变量替换", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "fw-runtime-upload-"));
    cleanupPaths.add(uploadDir);
    const evidenceA = join(uploadDir, "evidence-a.txt");
    const evidenceB = join(uploadDir, "evidence-b.txt");
    writeFileSync(evidenceA, "alpha", "utf-8");
    writeFileSync(evidenceB, "beta", "utf-8");

    const result = await executeFlow(
      buildFlow("flow_upload_form", "上传表单流程", [
        {
          id: "s1",
          type: "navigate",
          url: uploadFormFixtureUrl,
          waitUntil: "domcontentloaded",
        },
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
          target: { strategies: [{ kind: "css", selector: "#upload-result" }] },
        },
      ]),
      {
        headless: true,
        variables: {
          operator: "值班同学",
          fileA: evidenceA,
          fileB: evidenceB,
        },
      },
    );

    expect(result.status).toBe("success");
  });

  it("支持 press 与 wait attached / detached", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "fw-runtime-press-"));
    cleanupPaths.add(fixtureDir);
    const fixturePath = join(fixtureDir, "press-wait.html");
    writeFileSync(fixturePath, buildPressFixtureHtml(), "utf-8");
    const fixtureUrl = pathToFileURL(fixturePath).href;

    const result = await executeFlow(
      buildFlow("flow_press_wait", "按键与节点等待流程", [
        {
          id: "s1",
          type: "navigate",
          url: fixtureUrl,
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#keyword" }] },
          value: "{{keyword}}",
        },
        {
          id: "s3",
          type: "press",
          target: { strategies: [{ kind: "css", selector: "#keyword" }] },
          key: "Enter",
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: { strategies: [{ kind: "css", selector: "#press-result" }] },
        },
        {
          id: "s5",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#spawn" }] },
        },
        {
          id: "s6",
          type: "wait",
          condition: "attached",
          target: { strategies: [{ kind: "css", selector: "#ephemeral" }] },
        },
        {
          id: "s7",
          type: "wait",
          condition: "detached",
          target: { strategies: [{ kind: "css", selector: "#ephemeral" }] },
        },
      ]),
      {
        headless: true,
        variables: { keyword: "运行态验证" },
      },
    );

    expect(result.status).toBe("success");
  });

  it("支持 wait hidden 与 wait urlIncludes", async () => {
    const delayedResult = await executeFlow(
      buildFlow("flow_delayed_panel", "延迟面板等待流程", [
        {
          id: "s1",
          type: "navigate",
          url: delayedPanelFixtureUrl,
          waitUntil: "domcontentloaded",
        },
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
          target: { strategies: [{ kind: "css", selector: "#report-panel" }] },
        },
      ]),
      { headless: true },
    );

    expect(delayedResult.status).toBe("success");

    const spaResult = await executeFlow(
      buildFlow("flow_spa_route", "路由等待流程", [
        {
          id: "s1",
          type: "navigate",
          url: "{{fixtureName}}",
          waitUntil: "domcontentloaded",
        },
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
      ]),
      {
        headless: true,
        baseUrl: fixturesBaseUrl,
        variables: {
          fixtureName: "spa-route.html",
        },
      },
    );

    expect(spaResult.status).toBe("success");
  });

  it("定位失败时在 message 中包含更清晰的策略诊断", async () => {
    const result = await executeFlow(
      buildFlow("flow_target_diagnostic", "定位诊断流程", [
        {
          id: "s1",
          type: "navigate",
          url: checkboxSelectFixtureUrl,
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: {
            strategies: [
              { kind: "css", selector: "#missing-action" },
              { kind: "role", role: "button", name: "不存在的按钮" },
            ],
          },
        },
      ]),
      { headless: true, timeoutMs: 4_000 },
    );

    expect(result.status).toBe("failed");
    const failedStep = result.steps.at(-1);
    expect(failedStep?.status).toBe("failed");
    expect(failedStep?.message).toContain("#missing-action");
    expect(failedStep?.message).toContain("匹配");
    expect(failedStep?.message).toContain("当前页面");
  });
});
