import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildFlowFromEvents } from "@flowweave/recorder";
import { FLOW_SCHEMA_VERSION, parseRecordedEvent } from "@flowweave/shared";
import type { FlowDocument } from "@flowweave/flow-dsl";
import { executeFlow as executeFlowFromIndex } from "./index.ts";
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
const spaRouteFixtureUrl = pathToFileURL(join(fixturesDir, "spa-route.html")).href;
const filterableListFixtureUrl = pathToFileURL(join(fixturesDir, "filterable-list.html")).href;
const uploadFormFixtureUrl = pathToFileURL(join(fixturesDir, "upload-form.html")).href;
const contenteditableEditorFixtureUrl = pathToFileURL(
  join(fixturesDir, "contenteditable-editor.html"),
).href;
const bulkCrossPageSelectionFixtureUrl = pathToFileURL(
  join(fixturesDir, "bulk-cross-page-selection.html"),
).href;
const linkedFiltersFixtureUrl = new URL("linked-filters.html", fixturesBaseUrl).toString();
const drawerDoubleSaveFixtureUrl = new URL("drawer-double-save.html", fixturesBaseUrl).toString();
const repeatedRowActionsFixtureUrl = new URL("repeated-row-actions.html", fixturesBaseUrl).toString();
const keyboardCommandPaletteFixtureUrl = new URL(
  "keyboard-command-palette.html",
  fixturesBaseUrl,
).toString();

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

function buildRecordedFlowMeta(flowId: string, name: string) {
  return {
    sessionId: `${flowId}_session`,
    projectId: "proj_test",
    startedAt: "2026-06-06T23:10:00.000Z",
    flowId,
    name,
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

function buildAsyncComboboxFixtureHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <label for="city-search">城市搜索</label>
    <input
      id="city-search"
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-controls="city-options"
      aria-expanded="false"
      autocomplete="off"
    />
    <ul id="city-options" role="listbox" hidden></ul>
    <p id="selection-status" hidden data-selected="">未选择</p>

    <script>
      const citySearch = document.getElementById("city-search");
      const cityOptions = document.getElementById("city-options");
      const selectionStatus = document.getElementById("selection-status");
      const allOptions = [
        { id: "city-option-shanghai", label: "上海" },
        { id: "city-option-shenzhen", label: "深圳" },
        { id: "city-option-hangzhou", label: "杭州" },
      ];

      let filteredOptions = [];
      let activeIndex = -1;
      let filterTimer = 0;
      let highlightTimer = 0;

      function normalizeText(value) {
        return value.trim().toLowerCase();
      }

      function renderOptions() {
        cityOptions.innerHTML = "";

        if (filteredOptions.length === 0) {
          cityOptions.hidden = true;
          citySearch.setAttribute("aria-expanded", "false");
          citySearch.removeAttribute("aria-activedescendant");
          return;
        }

        cityOptions.hidden = false;
        citySearch.setAttribute("aria-expanded", "true");

        filteredOptions.forEach((option, index) => {
          const item = document.createElement("li");
          item.id = option.id;
          item.setAttribute("role", "option");
          item.dataset.active = index === activeIndex ? "true" : "false";
          item.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
          item.textContent = option.label;
          cityOptions.appendChild(item);
        });

        if (activeIndex >= 0) {
          citySearch.setAttribute("aria-activedescendant", filteredOptions[activeIndex].id);
        } else {
          citySearch.removeAttribute("aria-activedescendant");
        }
      }

      function scheduleFilter() {
        window.clearTimeout(filterTimer);
        filterTimer = window.setTimeout(() => {
          const keyword = normalizeText(citySearch.value);
          filteredOptions = allOptions.filter((option) =>
            normalizeText(option.label).includes(keyword),
          );
          activeIndex = -1;
          renderOptions();
        }, 160);
      }

      function scheduleHighlight(step) {
        if (filteredOptions.length === 0) {
          return;
        }

        window.clearTimeout(highlightTimer);
        highlightTimer = window.setTimeout(() => {
          if (activeIndex < 0) {
            activeIndex = step > 0 ? 0 : filteredOptions.length - 1;
          } else {
            activeIndex = (activeIndex + step + filteredOptions.length) % filteredOptions.length;
          }
          renderOptions();
        }, 160);
      }

      citySearch.addEventListener("input", () => {
        selectionStatus.hidden = true;
        selectionStatus.dataset.selected = "";
        scheduleFilter();
      });

      citySearch.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (cityOptions.hidden) {
            return;
          }

          scheduleHighlight(1);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (cityOptions.hidden) {
            return;
          }

          scheduleHighlight(-1);
          return;
        }

        if (event.key !== "Enter") {
          return;
        }

        event.preventDefault();
        if (activeIndex < 0 || !filteredOptions[activeIndex]) {
          return;
        }

        const activeOption = filteredOptions[activeIndex];
        selectionStatus.hidden = false;
        selectionStatus.dataset.selected = activeOption.id;
        selectionStatus.textContent = "已选择：" + activeOption.label;
      });
    </script>
  </body>
</html>`;
}

function buildPlainArrowInputFixtureHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <label for="plain-keyword">普通输入框</label>
    <input id="plain-keyword" type="text" autocomplete="off" />
  </body>
</html>`;
}

function buildControlledFillRetryFixtureHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <label for="customer-name">客户名称</label>
    <input id="customer-name" type="text" autocomplete="off" />
    <button id="submit-save" type="button" disabled>提交</button>
    <p id="save-result" hidden data-ready="false" data-name="">待提交</p>

    <script>
      const submitSave = document.getElementById("submit-save");
      const saveResult = document.getElementById("save-result");
      let fillResetConsumed = false;

      function syncSubmitState(input) {
        submitSave.disabled = input.value.trim().length === 0;
      }

      function bindInput(input) {
        input.addEventListener("input", () => {
          if (!fillResetConsumed) {
            fillResetConsumed = true;
            window.setTimeout(() => {
              const replacement = input.cloneNode(true);
              replacement.value = "";
              input.replaceWith(replacement);
              bindInput(replacement);
              syncSubmitState(replacement);
            }, 0);
            return;
          }

          syncSubmitState(input);
        });
      }

      bindInput(document.getElementById("customer-name"));

      submitSave.addEventListener("click", () => {
        const currentInput = document.getElementById("customer-name");
        if (currentInput.value.trim().length === 0) {
          return;
        }

        saveResult.hidden = false;
        saveResult.dataset.ready = "true";
        saveResult.dataset.name = currentInput.value.trim();
        saveResult.textContent = "已提交：" + currentInput.value.trim();
      });
    </script>
  </body>
</html>`;
}

function buildControlledCheckboxRetryFixtureHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <label>
      <input id="agree-checkbox" type="checkbox" />
      同意协议
    </label>
    <button id="save-preferences" type="button" disabled>保存</button>
    <p id="checkbox-result" hidden data-ready="false" data-checked="false">待保存</p>

    <script>
      const saveButton = document.getElementById("save-preferences");
      const checkboxResult = document.getElementById("checkbox-result");
      let resetConsumed = false;

      function syncSaveState(checkbox) {
        saveButton.disabled = !checkbox.checked;
      }

      function bindCheckbox(checkbox) {
        checkbox.addEventListener("change", () => {
          if (checkbox.checked && !resetConsumed) {
            resetConsumed = true;
            window.setTimeout(() => {
              const replacement = checkbox.cloneNode(true);
              replacement.checked = false;
              checkbox.closest("label").replaceChildren(replacement, document.createTextNode(" 同意协议"));
              bindCheckbox(replacement);
              syncSaveState(replacement);
            }, 0);
            return;
          }

          syncSaveState(checkbox);
        });
      }

      bindCheckbox(document.getElementById("agree-checkbox"));

      saveButton.addEventListener("click", () => {
        const checkbox = document.getElementById("agree-checkbox");
        if (!checkbox.checked) {
          return;
        }

        checkboxResult.hidden = false;
        checkboxResult.dataset.ready = "true";
        checkboxResult.dataset.checked = "true";
        checkboxResult.textContent = "保存成功";
      });
    </script>
  </body>
</html>`;
}

function buildSessionDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <main>
      <h1 id="dashboard-title">访客视图</h1>
      <p id="login-required">请先登录后再查看项目数据。</p>
      <section id="dashboard-panel" hidden>
        <p id="session-user">未登录</p>
        <button id="open-report" type="button">打开日报</button>
        <div id="report-panel" hidden data-ready="false">日报已就绪</div>
      </section>
    </main>
    <script>
      const dashboardTitle = document.getElementById("dashboard-title");
      const loginRequired = document.getElementById("login-required");
      const dashboardPanel = document.getElementById("dashboard-panel");
      const sessionUser = document.getElementById("session-user");
      const openReport = document.getElementById("open-report");
      const reportPanel = document.getElementById("report-panel");
      const session = window.localStorage.getItem("flowweave:session-user");

      if (session) {
        dashboardTitle.textContent = "项目仪表盘";
        loginRequired.hidden = true;
        dashboardPanel.hidden = false;
        sessionUser.textContent = "当前登录：" + session;
      }

      openReport.addEventListener("click", () => {
        reportPanel.hidden = false;
        reportPanel.dataset.ready = "true";
      });
    </script>
  </body>
</html>`;
}

function buildRepeatedRowActionsHtml(options?: { duplicateScope?: boolean }): string {
  const secondScope = options?.duplicateScope ? "待处理工单" : "重点客户回访";

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <table>
      <tbody>
        <tr data-row-id="row-a">
          <th scope="row">待处理工单</th>
          <td>张三</td>
          <td><button type="button" class="row-action">编辑</button></td>
        </tr>
        <tr data-row-id="row-b">
          <th scope="row">${secondScope}</th>
          <td>李四</td>
          <td><button type="button" class="row-action">编辑</button></td>
        </tr>
      </tbody>
    </table>
    <p id="selected-row" data-selected="idle">未选择</p>

    <script>
      const selectedRow = document.getElementById("selected-row");
      document.querySelectorAll(".row-action").forEach((button) => {
        button.addEventListener("click", (event) => {
          const row = event.currentTarget.closest("tr");
          const scopeText = row.querySelector("th")?.textContent?.trim() || "unknown";
          selectedRow.dataset.selected = scopeText;
          selectedRow.textContent = "已选择：" + scopeText;
        });
      });
    </script>
  </body>
</html>`;
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

async function startStaticServer(
  rootDir: string,
): Promise<{ server: Server; baseUrl: string }> {
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

describe("executeFlow", () => {
  let artifactDir: string | undefined;
  const cleanupPaths = new Set<string>();
  const cleanupServers = new Set<Server>();

  afterEach(() => {
    if (artifactDir) {
      rmSync(artifactDir, { recursive: true, force: true });
      artifactDir = undefined;
    }
    for (const targetPath of cleanupPaths) {
      rmSync(targetPath, { recursive: true, force: true });
    }
    cleanupPaths.clear();
    for (const server of cleanupServers) {
      server.close();
    }
    cleanupServers.clear();
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

  it("使用共享占位符协议插值导航地址、目标策略与上传文件数组", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "fw-runtime-shared-placeholder-"));
    cleanupPaths.add(uploadDir);
    const evidenceA = join(uploadDir, "evidence-a.txt");
    const evidenceB = join(uploadDir, "evidence-b.txt");
    writeFileSync(evidenceA, "alpha", "utf-8");
    writeFileSync(evidenceB, "beta", "utf-8");

    const result = await executeFlow(
      buildFlow("flow_shared_placeholder_contract", "共享占位符协议回放", [
        {
          id: "s1",
          type: "navigate",
          url: "{{fixture-path}}",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "fill",
          target: {
            strategies: [{ kind: "role", role: "textbox", name: "{{字段.提交人}}" }],
          },
          value: "{{操作员}}",
        },
        {
          id: "s3",
          type: "upload",
          target: {
            strategies: [{ kind: "testId", testId: "{{上传.test-id}}" }],
          },
          files: ["{{附件一}}", "{{附件二}}"],
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
          target: {
            strategies: [{ kind: "css", selector: "#upload-result[data-ready='true']" }],
          },
        },
      ]),
      {
        headless: true,
        baseUrl: fixturesBaseUrl,
        variables: {
          "fixture-path": "upload-form.html",
          "字段.提交人": "提交人",
          "上传.test-id": "evidence-files",
          操作员: "共享协议值班同学",
          附件一: evidenceA,
          附件二: evidenceB,
        },
      },
    );

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "fill",
      "upload",
      "click",
      "wait",
    ]);
  });

  it("支持将录制事件构建出的 upload Flow 直接回放", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "fw-runtime-recorded-upload-"));
    cleanupPaths.add(uploadDir);
    const evidenceA = join(uploadDir, "evidence-a.txt");
    const evidenceB = join(uploadDir, "evidence-b.txt");
    writeFileSync(evidenceA, "alpha", "utf-8");
    writeFileSync(evidenceB, "beta", "utf-8");

    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav",
          type: "navigate",
          timestamp: 0,
          url: uploadFormFixtureUrl,
          payload: {
            url: uploadFormFixtureUrl,
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
          id: "evt_click_submit",
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
    );

    expect(flow.variables).toEqual([
      { name: "upload_evidencefiles_1", type: "string", required: true },
      { name: "upload_evidencefiles_2", type: "string", required: true },
    ]);

    const uploadVariables = Object.fromEntries(
      flow.variables.map((variable, index) => [
        variable.name,
        index === 0 ? evidenceA : evidenceB,
      ]),
    );

    const result = await executeFlow(flow, {
      headless: true,
      variables: uploadVariables,
    });

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "fill",
      "upload",
      "click",
    ]);
  });

  it("支持将录制事件构建出的 spa-route Flow 直接回放", async () => {
    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_spa",
          type: "navigate",
          timestamp: 0,
          url: spaRouteFixtureUrl,
          payload: {
            url: "{{fixture-path}}",
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
    );

    const result = await executeFlow(flow, {
      headless: true,
      baseUrl: fixturesBaseUrl,
      variables: {
        "fixture-path": "spa-route.html",
      },
    });

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "click",
      "click",
    ]);
  });

  it("支持将录制事件构建出的 filterable-list Flow 直接回放", async () => {
    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_filter",
          type: "navigate",
          timestamp: 0,
          url: filterableListFixtureUrl,
          payload: {
            url: "{{fixture.file}}",
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
    );

    const result = await executeFlow(flow, {
      headless: true,
      baseUrl: fixturesBaseUrl,
      variables: {
        "fixture.file": "filterable-list.html",
        筛选关键字: "待同步",
        "筛选.状态": "needs-review",
      },
    });

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "fill",
      "select",
      "click",
      "click",
    ]);
  });

  it("支持将录制事件构建出的 contenteditable-editor Flow 直接回放", async () => {
    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_contenteditable",
          type: "navigate",
          timestamp: 0,
          url: contenteditableEditorFixtureUrl,
          payload: {
            url: "{{fixture.file}}",
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
    );

    expect(flow.variables).toEqual([
      { name: "fixture.file", type: "string", required: true },
      { name: "noteContent", type: "string", required: true },
    ]);
    expect(flow.steps.map((step) => step.type)).toEqual([
      "navigate",
      "fill",
      "click",
      "click",
    ]);

    const result = await executeFlow(flow, {
      headless: true,
      baseUrl: fixturesBaseUrl,
      variables: {
        "fixture.file": "contenteditable-editor.html",
        noteContent: "已补齐截图与重试说明，待值班同学二次复核。",
      },
    });

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "fill",
      "click",
      "click",
    ]);
  });

  it("支持将录制事件构建出的 session-expired-retry Flow 直接回放", async () => {
    const { server, baseUrl } = await startStaticServer(fixturesDir);
    cleanupServers.add(server);
    const sessionExpiredRetryUrl = new URL("session-expired-retry.html", baseUrl).toString();

    const storageDir = mkdtempSync(join(tmpdir(), "fw-runtime-recorded-session-expired-"));
    cleanupPaths.add(storageDir);
    const storageStatePath = join(storageDir, "storage-state.json");
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
                  value: "测试用户",
                },
                {
                  name: "flowweave:session-status",
                  value: "expired",
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

    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_session_retry",
          type: "navigate",
          timestamp: 0,
          url: sessionExpiredRetryUrl,
          payload: {
            url: "{{fixture.file}}",
            waitUntil: "domcontentloaded",
          },
        }),
        parseRecordedEvent({
          id: "evt_click_refresh_session",
          type: "click",
          timestamp: 100,
          url: sessionExpiredRetryUrl,
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
          url: sessionExpiredRetryUrl,
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
          url: sessionExpiredRetryUrl,
          payload: {
            selector: "#refresh-result",
            text: "第 2 次重试成功",
          },
        }),
      ],
      buildRecordedFlowMeta("flow_recorded_session_expired_retry", "录制会话恢复重试流程"),
    );

    expect(flow.variables).toEqual([{ name: "fixture.file", type: "string", required: true }]);
    expect(flow.steps.map((step) => step.type)).toEqual([
      "navigate",
      "click",
      "click",
      "click",
    ]);

    const result = await executeFlow(flow, {
      headless: true,
      baseUrl,
      storageStatePath,
      variables: {
        "fixture.file": "session-expired-retry.html",
      },
    });

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "click",
      "click",
      "click",
    ]);
  });

  it("支持将录制事件构建出的 bulk-cross-page-selection Flow 直接回放", async () => {
    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_bulk_cross_page",
          type: "navigate",
          timestamp: 0,
          url: bulkCrossPageSelectionFixtureUrl,
          payload: {
            url: "{{fixture.file}}",
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
      buildRecordedFlowMeta(
        "flow_recorded_bulk_cross_page_selection",
        "录制跨页批量选择流程",
      ),
    );

    expect(flow.variables).toEqual([{ name: "fixture.file", type: "string", required: true }]);
    expect(flow.steps.map((step) => step.type)).toEqual([
      "navigate",
      "setChecked",
      "click",
      "setChecked",
      "click",
      "click",
    ]);

    const result = await executeFlow(flow, {
      headless: true,
      baseUrl: fixturesBaseUrl,
      variables: {
        "fixture.file": "bulk-cross-page-selection.html",
      },
    });

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "setChecked",
      "click",
      "setChecked",
      "click",
      "click",
    ]);
  });

  it("支持将录制事件构建出的 repeated-row-actions Flow 直接回放", async () => {
    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_repeated_row_actions",
          type: "navigate",
          timestamp: 0,
          url: repeatedRowActionsFixtureUrl,
          payload: {
            url: "{{fixture.file}}",
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
    );

    expect(flow.variables).toEqual([{ name: "fixture.file", type: "string", required: true }]);
    expect(flow.steps[1]).toMatchObject({
      type: "click",
      target: {
        hints: {
          scopeText: "华东运营日报",
          scopeKind: "row",
        },
      },
    });

    const result = await executeFlow(flow, {
      headless: true,
      baseUrl: fixturesBaseUrl,
      variables: {
        "fixture.file": "repeated-row-actions.html",
      },
    });

    expect(result.status).toBe("success");
  });

  it("支持将录制事件构建出的 linked-filters Flow 直接回放", async () => {
    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_linked_filters",
          type: "navigate",
          timestamp: 0,
          url: linkedFiltersFixtureUrl,
          payload: {
            url: "{{fixture.file}}",
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
    );

    expect(flow.variables).toEqual([{ name: "fixture.file", type: "string", required: true }]);
    expect(flow.steps.filter((step) => step.type === "select")).toHaveLength(2);

    const result = await executeFlow(flow, {
      headless: true,
      baseUrl: fixturesBaseUrl,
      variables: {
        "fixture.file": "linked-filters.html",
      },
    });

    expect(result.status).toBe("success");
  });

  it("支持将录制事件构建出的 session-dashboard Flow 直接回放", async () => {
    const { server, baseUrl } = await startStaticServer(fixturesDir);
    cleanupServers.add(server);
    const sessionDashboardFixtureUrl = new URL("session-dashboard.html", baseUrl).toString();

    const storageDir = mkdtempSync(join(tmpdir(), "fw-runtime-recorded-session-dashboard-"));
    cleanupPaths.add(storageDir);
    const storageStatePath = join(storageDir, "storage-state.json");
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
                  value: "录制回放用户",
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

    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_session_dashboard",
          type: "navigate",
          timestamp: 0,
          url: sessionDashboardFixtureUrl,
          payload: {
            url: "{{fixture.file}}",
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
    );

    expect(flow.variables).toEqual([{ name: "fixture.file", type: "string", required: true }]);

    const result = await executeFlow(flow, {
      headless: true,
      baseUrl,
      storageStatePath,
      variables: {
        "fixture.file": "session-dashboard.html",
      },
    });

    expect(result.status).toBe("success");
  });

  it("支持将录制事件构建出的 drawer-double-save Flow 直接回放", async () => {
    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_drawer_double_save",
          type: "navigate",
          timestamp: 0,
          url: drawerDoubleSaveFixtureUrl,
          payload: {
            url: "{{fixture.file}}",
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
    );

    expect(flow.variables).toEqual([{ name: "fixture.file", type: "string", required: true }]);
    expect(flow.steps.some((step) => step.type === "fill")).toBe(true);

    const result = await executeFlow(flow, {
      headless: true,
      baseUrl: fixturesBaseUrl,
      variables: {
        "fixture.file": "drawer-double-save.html",
      },
    });

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

  it("在 suggest / combobox 上会等待 fill 后列表就绪与 ArrowDown 选中状态生效", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "fw-runtime-combobox-"));
    cleanupPaths.add(fixtureDir);
    const fixturePath = join(fixtureDir, "async-combobox.html");
    writeFileSync(fixturePath, buildAsyncComboboxFixtureHtml(), "utf-8");
    const fixtureUrl = pathToFileURL(fixturePath).href;

    const result = await executeFlow(
      buildFlow("flow_async_combobox", "异步建议框键盘选择流程", [
        {
          id: "s1",
          type: "navigate",
          url: fixtureUrl,
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "#city-search" }],
          },
          value: "上",
        },
        {
          id: "s3",
          type: "press",
          target: {
            strategies: [{ kind: "css", selector: "#city-search" }],
          },
          key: "ArrowDown",
        },
        {
          id: "s4",
          type: "press",
          target: {
            strategies: [{ kind: "css", selector: "#city-search" }],
          },
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
                selector: "#selection-status[data-selected='city-option-shanghai']",
              },
            ],
          },
        },
      ]),
      {
        headless: true,
      },
    );

    expect(result.status).toBe("success");
  });

  it("普通非 suggest 输入上的 ArrowDown 不会被额外稳定等待阻塞", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "fw-runtime-plain-arrow-"));
    cleanupPaths.add(fixtureDir);
    const fixturePath = join(fixtureDir, "plain-arrow-input.html");
    writeFileSync(fixturePath, buildPlainArrowInputFixtureHtml(), "utf-8");
    const fixtureUrl = pathToFileURL(fixturePath).href;

    const result = await executeFlow(
      buildFlow("flow_plain_arrow_input", "普通输入框方向键流程", [
        {
          id: "s1",
          type: "navigate",
          url: fixtureUrl,
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "press",
          target: {
            strategies: [{ kind: "css", selector: "#plain-keyword" }],
          },
          key: "ArrowDown",
        },
      ]),
      {
        headless: true,
      },
    );

    expect(result.status).toBe("success");
    expect(result.steps[1]?.durationMs ?? 0).toBeLessThan(1_100);
  });

  it("fill 后若受控输入被重渲染清空，会重新定位并补写一次", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "fw-runtime-fill-retry-"));
    cleanupPaths.add(fixtureDir);
    const fixturePath = join(fixtureDir, "controlled-fill-retry.html");
    writeFileSync(fixturePath, buildControlledFillRetryFixtureHtml(), "utf-8");
    const fixtureUrl = pathToFileURL(fixturePath).href;

    const result = await executeFlow(
      buildFlow("flow_controlled_fill_retry", "受控输入补写流程", [
        {
          id: "s1",
          type: "navigate",
          url: fixtureUrl,
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#customer-name" }] },
          value: "客户 A",
        },
        {
          id: "s3",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#submit-save" }] },
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#save-result[data-ready='true'][data-name='客户 A']",
              },
            ],
          },
        },
      ]),
      {
        headless: true,
      },
    );

    expect(result.status).toBe("success");
  });

  it("setChecked 后若受控勾选被重置，会重新定位并补设一次", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "fw-runtime-check-retry-"));
    cleanupPaths.add(fixtureDir);
    const fixturePath = join(fixtureDir, "controlled-checkbox-retry.html");
    writeFileSync(fixturePath, buildControlledCheckboxRetryFixtureHtml(), "utf-8");
    const fixtureUrl = pathToFileURL(fixturePath).href;

    const result = await executeFlow(
      buildFlow("flow_controlled_checkbox_retry", "受控勾选补设流程", [
        {
          id: "s1",
          type: "navigate",
          url: fixtureUrl,
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "setChecked",
          target: { strategies: [{ kind: "css", selector: "#agree-checkbox" }] },
          checked: true,
        },
        {
          id: "s3",
          type: "click",
          target: { strategies: [{ kind: "css", selector: "#save-preferences" }] },
        },
        {
          id: "s4",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [
              {
                kind: "css",
                selector: "#checkbox-result[data-ready='true'][data-checked='true']",
              },
            ],
          },
        },
      ]),
      {
        headless: true,
      },
    );

    expect(result.status).toBe("success");
  });

  it("支持真实页面风格的命令面板键盘回放", async () => {
    const result = await executeFlow(
      buildFlow("flow_keyboard_command_palette", "命令面板键盘回放流程", [
        {
          id: "s1",
          type: "navigate",
          url: keyboardCommandPaletteFixtureUrl,
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
      {
        headless: true,
      },
    );

    expect(result.status).toBe("success");
  });

  it("通过 runtime src index 入口时也会命中最新 suggest 等待实现", async () => {
    const keyboardResult = await executeFlowFromIndex(
      buildFlow("flow_keyboard_command_palette_from_index", "命令面板键盘回放流程（index 入口）", [
        {
          id: "s1",
          type: "navigate",
          url: keyboardCommandPaletteFixtureUrl,
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
      {
        headless: true,
      },
    );

    const asyncResult = await executeFlowFromIndex(
      buildFlow("flow_async_command_palette_from_index", "异步命令面板键盘回放流程（index 入口）", [
        {
          id: "s1",
          type: "navigate",
          url: new URL("async-command-palette.html", fixturesBaseUrl).toString(),
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#async-command-search" }] },
          value: "账单",
        },
        {
          id: "s3",
          type: "press",
          target: { strategies: [{ kind: "css", selector: "#async-command-search" }] },
          key: "ArrowDown",
        },
        {
          id: "s4",
          type: "press",
          target: { strategies: [{ kind: "css", selector: "#async-command-search" }] },
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
                selector: "#async-command-toast[data-ready='true'][data-command-id='sync-billing']",
              },
            ],
          },
        },
      ]),
      {
        headless: true,
      },
    );

    expect(keyboardResult.status).toBe("success");
    expect(asyncResult.status).toBe("success");
  });

  it("在 HTTP fixture 上也会等待命令面板筛选与异步 suggest 稳定后再执行", async () => {
    const { server, baseUrl } = await startStaticServer(fixturesDir);
    cleanupServers.add(server);

    const keyboardResult = await executeFlow(
      buildFlow("flow_keyboard_command_palette_http", "命令面板键盘回放流程（HTTP）", [
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
      {
        headless: true,
        baseUrl,
      },
    );

    const asyncResult = await executeFlow(
      buildFlow("flow_async_command_palette_http", "异步命令面板键盘回放流程（HTTP）", [
        {
          id: "s1",
          type: "navigate",
          url: "async-command-palette.html",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "fill",
          target: { strategies: [{ kind: "css", selector: "#async-command-search" }] },
          value: "账单",
        },
        {
          id: "s3",
          type: "press",
          target: { strategies: [{ kind: "css", selector: "#async-command-search" }] },
          key: "ArrowDown",
        },
        {
          id: "s4",
          type: "press",
          target: { strategies: [{ kind: "css", selector: "#async-command-search" }] },
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
                selector: "#async-command-toast[data-ready='true'][data-command-id='sync-billing']",
              },
            ],
          },
        },
      ]),
      {
        headless: true,
        baseUrl,
      },
    );

    expect(keyboardResult.status).toBe("success");
    expect(asyncResult.status).toBe("success");
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

  it("支持通过 storageStatePath 注入登录态环境", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "fw-runtime-session-"));
    cleanupPaths.add(fixtureDir);
    writeFileSync(join(fixtureDir, "session-dashboard.html"), buildSessionDashboardHtml(), "utf-8");

    const { server, baseUrl } = await startStaticServer(fixtureDir);
    cleanupServers.add(server);

    const storageStatePath = join(fixtureDir, "storage-state.json");
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
                  value: "测试用户",
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

    const result = await executeFlow(
      buildFlow("flow_session_dashboard", "登录态环境流程", [
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
      {
        headless: true,
        baseUrl,
        storageStatePath,
      },
    );

    expect(result.status).toBe("success");
  });

  it("多命中按钮时会结合 scopeText 与 scopeKind 命中正确行", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "fw-runtime-scope-row-"));
    cleanupPaths.add(fixtureDir);
    const fixturePath = join(fixtureDir, "repeated-row-actions.html");
    writeFileSync(fixturePath, buildRepeatedRowActionsHtml(), "utf-8");
    const fixtureUrl = pathToFileURL(fixturePath).href;

    const result = await executeFlow(
      buildFlow("flow_scope_row_disambiguation", "作用域行消解流程", [
        {
          id: "s1",
          type: "navigate",
          url: fixtureUrl,
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: {
            strategies: [{ kind: "role", role: "button", name: "编辑" }],
            hints: {
              scopeText: "重点客户回访",
              scopeKind: "row",
            },
          },
        },
        {
          id: "s3",
          type: "click",
          target: {
            strategies: [{ kind: "css", selector: "#selected-row[data-selected='重点客户回访']" }],
          },
        },
      ]),
      { headless: true },
    );

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "click",
      "click",
    ]);
  });

  it("支持将携带 placeholder hint 的录制回放命中正确输入框", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "fw-runtime-placeholder-"));
    cleanupPaths.add(fixtureDir);
    const fixturePath = join(fixtureDir, "placeholder-disambiguation.html");
    writeFileSync(fixturePath, buildPlaceholderDisambiguationHtml(), "utf-8");
    const fixtureUrl = pathToFileURL(fixturePath).href;

    const flow = buildFlowFromEvents(
      [
        parseRecordedEvent({
          id: "evt_nav_placeholder",
          type: "navigate",
          timestamp: 0,
          url: fixtureUrl,
          payload: {
            url: fixtureUrl,
            waitUntil: "domcontentloaded",
          },
        }),
        parseRecordedEvent({
          id: "evt_fill_archive_reason",
          type: "fill",
          timestamp: 100,
          url: fixtureUrl,
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
          url: fixtureUrl,
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
          url: fixtureUrl,
          payload: {
            selector: "#submit-status[data-state='matched']",
            text: "已写入归档原因",
          },
        }),
      ],
      buildRecordedFlowMeta("flow_recorded_placeholder_disambiguation", "录制输入框消解流程"),
    );

    const result = await executeFlow(flow, { headless: true });

    expect(result.status).toBe("success");
    expect(result.steps.map((step) => step.type)).toEqual([
      "navigate",
      "fill",
      "click",
      "click",
    ]);
  });

  it("多命中候选并列最高分时返回明确歧义诊断", async () => {
    artifactDir = mkdtempSync(join(tmpdir(), "fw-runtime-ambiguity-"));
    const fixtureDir = mkdtempSync(join(tmpdir(), "fw-runtime-ambiguity-fixture-"));
    cleanupPaths.add(fixtureDir);
    const fixturePath = join(fixtureDir, "ambiguous-row-actions.html");
    writeFileSync(
      fixturePath,
      buildRepeatedRowActionsHtml({ duplicateScope: true }),
      "utf-8",
    );
    const fixtureUrl = pathToFileURL(fixturePath).href;

    const result = await executeFlow(
      buildFlow("flow_ambiguous_row_disambiguation", "歧义行消解流程", [
        {
          id: "s1",
          type: "navigate",
          url: fixtureUrl,
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "click",
          target: {
            strategies: [{ kind: "role", role: "button", name: "编辑" }],
            hints: {
              scopeText: "待处理工单",
              scopeKind: "row",
            },
          },
        },
      ]),
      { headless: true, timeoutMs: 4_000, artifactDir },
    );

    expect(result.status).toBe("failed");
    const failedStep = result.steps.at(-1);
    expect(failedStep?.status).toBe("failed");
    expect(failedStep?.message).toContain("歧义");
    expect(failedStep?.message).toContain("候选");
    expect(failedStep?.diagnosticPath).toBe(join(artifactDir, "step-1-diagnostic.json"));

    const diagnostic = JSON.parse(
      readFileSync(join(artifactDir, "step-1-diagnostic.json"), "utf-8"),
    ) as {
      kind: string;
      stepId: string;
      stepIndex: number;
      stepType: string;
      message: string;
      errorCode?: string;
      strategyAttempts: Array<{
        label: string;
        matchedCount: number;
        visibleCount?: number;
        success: boolean;
        error?: string;
        ambiguityReason?: string;
        candidateSummaries?: Array<{
          index: number;
          score: number;
          visible: boolean;
          matchedHints: string[];
          scopeText?: string;
        }>;
      }>;
    };

    expect(diagnostic.kind).toBe("target-resolution");
    expect(diagnostic.stepId).toBe("s2");
    expect(diagnostic.stepIndex).toBe(1);
    expect(diagnostic.stepType).toBe("click");
    expect(diagnostic.message).toContain("歧义");
    expect(diagnostic.errorCode).toBe("RUNTIME_STEP_FAILED");
    expect(diagnostic.strategyAttempts).toHaveLength(1);
    expect(diagnostic.strategyAttempts[0]?.ambiguityReason).toContain("并列");
    expect(diagnostic.strategyAttempts[0]?.candidateSummaries).toHaveLength(2);
    expect(diagnostic.strategyAttempts[0]?.candidateSummaries?.[0]?.score).toBeGreaterThan(0);
  });

  it("真实页面 fixture 矩阵全部成功", async () => {
    const matrixModuleUrl = pathToFileURL(join(repoRoot, "examples/real-page-smoke.ts")).href;
    const matrixModule = (await import(matrixModuleUrl)) as {
      runRealPageFixtureMatrix: (options?: { headless?: boolean }) => Promise<{
        results: Array<{ name: string; status: string }>;
        failed: Array<{ name: string; status: string; message?: string }>;
      }>;
    };

    const summary = await matrixModule.runRealPageFixtureMatrix({ headless: true });
    expect(summary.results).toHaveLength(13);
    expect(summary.results.map((item) => item.name)).toEqual([
      "checkbox-select",
      "delayed-panel",
      "upload-form",
      "spa-route",
      "session-dashboard",
      "keyboard-command-palette",
      "async-command-palette",
      "filterable-list",
      "modal-bulk-action",
      "session-expired-dashboard",
      "paginated-list",
      "drawer-edit-form",
      "toast-popconfirm",
    ]);
    expect(summary.failed).toHaveLength(0);
  });

  it("非定位类步骤失败时也会写入通用 diagnostic JSON", async () => {
    artifactDir = mkdtempSync(join(tmpdir(), "fw-runtime-generic-diagnostic-"));
    const result = await executeFlow(
      buildFlow("flow_wait_missing_target", "等待步骤缺少 target", [
        {
          id: "s1",
          type: "navigate",
          url: checkboxSelectFixtureUrl,
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "wait",
          condition: "visible",
        },
      ]),
      { headless: true, timeoutMs: 4_000, artifactDir },
    );

    expect(result.status).toBe("failed");
    const failedStep = result.steps.at(-1);
    expect(failedStep?.status).toBe("failed");
    expect(failedStep?.message).toContain("缺少 target");
    expect(failedStep?.diagnosticPath).toBe(join(artifactDir, "step-1-diagnostic.json"));
    expect(existsSync(join(artifactDir, "step-1-diagnostic.json"))).toBe(true);

    const diagnostic = JSON.parse(
      readFileSync(join(artifactDir, "step-1-diagnostic.json"), "utf-8"),
    ) as {
      kind: string;
      stepId: string;
      stepIndex: number;
      stepType: string;
      message: string;
      errorCode?: string;
      cause?: string;
      url?: string;
      title?: string;
    };

    expect(diagnostic.kind).toBe("runtime-error");
    expect(diagnostic.stepId).toBe("s2");
    expect(diagnostic.stepIndex).toBe(1);
    expect(diagnostic.stepType).toBe("wait");
    expect(diagnostic.message).toContain("缺少 target");
    expect(diagnostic.errorCode).toBe("RUNTIME_STEP_FAILED");
    expect(diagnostic.url).toContain("checkbox-select.html");
    expect(diagnostic.title).toBeTruthy();
    expect(diagnostic).not.toHaveProperty("strategyAttempts");
    expect(diagnostic).not.toHaveProperty("targetHints");
  });

  it("普通 Error 失败时也会写入 runtime-error diagnostic JSON", async () => {
    artifactDir = mkdtempSync(join(tmpdir(), "fw-runtime-plain-error-"));
    const result = await executeFlow(
      buildFlow("flow_plain_error_diagnostic", "普通错误诊断流程", [
        {
          id: "s1",
          type: "navigate",
          url: "not-a-valid-url",
          waitUntil: "domcontentloaded",
        },
      ]),
      { headless: true, timeoutMs: 4_000, artifactDir },
    );

    expect(result.status).toBe("failed");
    const failedStep = result.steps[0];
    expect(failedStep?.status).toBe("failed");
    expect(failedStep?.diagnosticPath).toBe(join(artifactDir, "step-0-diagnostic.json"));
    expect(existsSync(join(artifactDir, "step-0-diagnostic.json"))).toBe(true);

    const diagnostic = JSON.parse(
      readFileSync(join(artifactDir, "step-0-diagnostic.json"), "utf-8"),
    ) as {
      kind: string;
      stepId: string;
      stepIndex: number;
      stepType: string;
      message: string;
      errorCode?: string;
      cause?: string;
    };

    expect(diagnostic.kind).toBe("runtime-error");
    expect(diagnostic.stepId).toBe("s1");
    expect(diagnostic.stepIndex).toBe(0);
    expect(diagnostic.stepType).toBe("navigate");
    expect(diagnostic.message.length).toBeGreaterThan(0);
    expect(diagnostic.errorCode).toBeUndefined();
    expect(diagnostic).not.toHaveProperty("strategyAttempts");
    expect(diagnostic).not.toHaveProperty("targetHints");
  });

  it("定位失败时在 message 中包含更清晰的策略诊断", async () => {
    artifactDir = mkdtempSync(join(tmpdir(), "fw-runtime-diagnostic-"));
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
      { headless: true, timeoutMs: 4_000, artifactDir },
    );

    expect(result.status).toBe("failed");
    const failedStep = result.steps.at(-1);
    expect(failedStep?.status).toBe("failed");
    expect(failedStep?.message).toContain("#missing-action");
    expect(failedStep?.message).toContain("匹配");
    expect(failedStep?.message).toContain("当前页面");
    expect(failedStep?.diagnosticPath).toBe(join(artifactDir, "step-1-diagnostic.json"));
    expect(existsSync(join(artifactDir, "page-1.json"))).toBe(true);
    expect(existsSync(join(artifactDir, "step-1-diagnostic.json"))).toBe(true);

    const diagnostic = JSON.parse(
      readFileSync(join(artifactDir, "step-1-diagnostic.json"), "utf-8"),
    ) as {
      kind: string;
      stepId: string;
      stepIndex: number;
      stepType: string;
      message: string;
      errorCode?: string;
      cause?: string;
      url: string;
      title: string;
      strategyAttempts: Array<{
        label: string;
        matchedCount: number;
        visibleCount?: number;
        success: boolean;
        error?: string;
      }>;
    };
    expect(diagnostic.kind).toBe("target-resolution");
    expect(diagnostic.stepId).toBe("s2");
    expect(diagnostic.stepIndex).toBe(1);
    expect(diagnostic.stepType).toBe("click");
    expect(diagnostic.message).toContain("#missing-action");
    expect(diagnostic.errorCode).toBe("RUNTIME_STEP_FAILED");
    expect(diagnostic.url).toContain("checkbox-select.html");
    expect(diagnostic.title).toBeTruthy();
    expect(diagnostic.cause).toBeTruthy();
    expect(diagnostic.strategyAttempts).toHaveLength(2);
    expect(diagnostic.strategyAttempts[0]?.label).toBe("#missing-action");
    expect(diagnostic.strategyAttempts[0]?.matchedCount).toBe(0);
  });
});
