# 真实页面稳定性增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 FlowWeave 从理想 fixture 可跑通的录制回放原型，升级为可在真实页面上稳定执行的本地自动化底座。

**Architecture:** 先在 Foundation 轨道冻结 DSL、环境与诊断接口，然后分为 `Recorder`、`Runtime`、`Environment`、`Diagnostics`、`Benchmarks` 五条 worktree 轨道并行推进。各轨道只修改授权目录，最终由主代理统一回收、合并并跑 Node 20 全量验证。

**Tech Stack:** TypeScript strict、pnpm、Turborepo、Zod、Playwright、WXT、Electron、SQLite/Drizzle、Vitest

---

## 任务分解总览

| 任务 | 目标 | 主要写入 |
|------|------|----------|
| Task 0 | 冻结 Foundation 接口与文档 | `packages/flow-dsl`、`packages/runtime/src/types.ts`、`packages/project-knowledge/src/types.ts`、文档 |
| Task 1 | 增强录制语义与去噪 | `apps/extension`、`packages/recorder` |
| Task 2 | 增强 runtime 步骤执行、等待与定位 | `packages/runtime` |
| Task 3 | 打通环境、变量与会话注入 | `packages/project-knowledge`、`apps/studio/electron/services.ts`、`apps/studio/src/*` |
| Task 4 | 增强诊断产物与脆弱性体检 | `packages/page-intelligence`、`packages/runtime`、`apps/studio` |
| Task 5 | 建立真实页面 fixture 与回归矩阵 | `examples/fixtures`、`examples/*.ts`、测试文件 |

## Worktree 规划

| 轨道 | 分支 | Worktree 路径 | 负责范围 |
|------|------|---------------|----------|
| Foundation | `codex/real-page-foundation` | `.worktrees/codex-real-page-foundation` | 接口冻结与文档同步 |
| Recorder | `codex/real-page-recorder` | `.worktrees/codex-real-page-recorder` | `apps/extension`、`packages/recorder` |
| Runtime | `codex/real-page-runtime` | `.worktrees/codex-real-page-runtime` | `packages/runtime` |
| Environment | `codex/real-page-environment` | `.worktrees/codex-real-page-environment` | `packages/project-knowledge`、Studio 运行表单 |
| Diagnostics | `codex/real-page-diagnostics` | `.worktrees/codex-real-page-diagnostics` | `packages/page-intelligence`、Studio 诊断展示 |
| Benchmarks | `codex/real-page-benchmarks` | `.worktrees/codex-real-page-benchmarks` | `examples/fixtures`、回归脚本、测试 |

**合并顺序：** Foundation -> Recorder -> Runtime -> Environment -> Diagnostics -> Benchmarks

## 全局验收标准

- [ ] Node 20 环境下 `pnpm typecheck` 通过
- [ ] Node 20 环境下 `pnpm test` 通过
- [ ] Node 20 环境下 `pnpm build` 通过
- [ ] Node 20 环境下 `pnpm smoke` 通过
- [ ] runtime 新增步骤类型具备单测 / fixture 测试
- [ ] Studio 可选择环境、输入变量、查看失败诊断路径
- [ ] 回归矩阵覆盖至少 4 组真实交互 fixture

### Task 0: Foundation 接口冻结

**Files:**
- Modify: `packages/flow-dsl/src/schema.ts`
- Modify: `packages/flow-dsl/src/schema.test.ts`
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/project-knowledge/src/types.ts`
- Modify: `docs/domain/flow-dsl.md`
- Create: `docs/guides/real-page-stability.md`

- [ ] **Step 1: 写失败测试，定义新增步骤与 Target hints**

```ts
it("支持 select / setChecked / press / upload 步骤", () => {
  expect(() =>
    parseFlowDocument({
      schemaVersion: 1,
      id: "flow_real_page",
      projectId: "proj",
      name: "真实页面流程",
      variables: [],
      steps: [
        { id: "s1", type: "select", target: { strategies: [{ kind: "css", selector: "#city" }] }, values: ["shanghai"] },
        { id: "s2", type: "setChecked", target: { strategies: [{ kind: "css", selector: "#agree" }] }, checked: true },
      ],
      meta: { createdAt: NOW, updatedAt: NOW, source: "manual" },
    }),
  ).not.toThrow();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl test`
Expected: FAIL，提示 schema 尚未支持新增步骤。

- [ ] **Step 3: 实现最小接口扩展**

```ts
const targetHintsSchema = z.object({
  tagName: z.string().optional(),
  inputType: z.string().optional(),
  nameAttr: z.string().optional(),
  placeholder: z.string().optional(),
  labelText: z.string().optional(),
  textSample: z.string().optional(),
});

export const targetSchema = z.object({
  strategies: z.array(locatorStrategySchema).min(1),
  hints: targetHintsSchema.optional(),
});
```

- [ ] **Step 4: 扩展运行与环境 DTO**

```ts
export type ExecutionOptions = {
  baseUrl?: string;
  variables?: Record<string, string | number | boolean>;
  storageStatePath?: string;
  cookies?: BrowserContextCookies[];
};
```

- [ ] **Step 5: 回归测试与文档同步**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/flow-dsl/src/schema.ts packages/flow-dsl/src/schema.test.ts packages/runtime/src/types.ts packages/project-knowledge/src/types.ts docs/domain/flow-dsl.md docs/guides/real-page-stability.md
git commit -m "feat: 冻结真实页面稳定性接口基础"
```

### Task 1: Recorder 语义增强

**Files:**
- Modify: `apps/extension/entrypoints/content.ts`
- Modify: `packages/recorder/src/target-from-dom.ts`
- Modify: `packages/recorder/src/normalize.ts`
- Modify: `packages/recorder/src/step-filter.ts`
- Modify: `packages/recorder/src/index.ts`
- Modify: `packages/recorder/src/normalize.test.ts`
- Modify: `packages/recorder/src/step-filter.test.ts`
- Modify: `packages/recorder/src/target-from-dom.test.ts`

- [ ] **Step 1: 先补语义测试**

```ts
it("把 checkbox change 归一化为 setChecked", () => {
  const step = normalizeRecordedEvent(buildCheckboxEvent(true));
  expect(step).toMatchObject({ type: "setChecked", checked: true });
});

it("把 select change 归一化为 select", () => {
  const step = normalizeRecordedEvent(buildSelectEvent(["shanghai"]));
  expect(step).toMatchObject({ type: "select", values: ["shanghai"] });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
Expected: FAIL，当前 normalize 尚不支持新类型。

- [ ] **Step 3: 扩展录制 payload 提取**

```ts
if (element instanceof HTMLInputElement && element.type === "checkbox") {
  payload.checked = element.checked;
}
if (element instanceof HTMLSelectElement) {
  payload.values = Array.from(element.selectedOptions).map((option) => option.value);
}
```

- [ ] **Step 4: 扩展 normalize 与去噪**

```ts
case "select":
  return { id: event.id, type: "select", target, values };
case "setChecked":
  return { id: event.id, type: "setChecked", target, checked };
```

- [ ] **Step 5: 回归测试**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/extension/entrypoints/content.ts packages/recorder/src/target-from-dom.ts packages/recorder/src/normalize.ts packages/recorder/src/step-filter.ts packages/recorder/src/index.ts packages/recorder/src/*.test.ts
git commit -m "feat: 增强真实页面录制语义与去噪"
```

### Task 2: Runtime 稳定执行增强

**Files:**
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Modify: `packages/runtime/src/index.ts`

- [ ] **Step 1: 先写执行层失败测试**

```ts
it("支持 select 和 setChecked 步骤", async () => {
  const result = await executeFlow(buildFormFlow(), { headless: true });
  expect(result.status).toBe("success");
});

it("wait condition=visible 会等待目标出现", async () => {
  const result = await executeFlow(buildDelayedFlow(), { headless: true });
  expect(result.status).toBe("success");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
Expected: FAIL，当前 runner 未支持这些步骤或等待条件。

- [ ] **Step 3: 实现新增步骤与变量替换**

```ts
case "select":
  await locator.selectOption(step.values);
  break;
case "setChecked":
  await locator.setChecked(step.checked);
  break;
case "upload":
  await locator.setInputFiles(step.files);
  break;
```

- [ ] **Step 4: 实现定位诊断与动作后等待**

```ts
const attempts = await inspectStrategies(page, step.target);
if (!attempts.some((attempt) => attempt.success)) {
  throw new FlowWeaveError("RUNTIME_STEP_FAILED", "无法定位目标元素", { attempts });
}
```

- [ ] **Step 5: 回归测试**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/runtime/src/playwright-runner.ts packages/runtime/src/playwright-runner.test.ts packages/runtime/src/index.ts
git commit -m "feat: 增强真实页面运行时稳定性"
```

### Task 3: 环境、变量与会话贯通

**Files:**
- Modify: `packages/project-knowledge/src/db/schema.ts`
- Modify: `packages/project-knowledge/src/repository.ts`
- Modify: `packages/project-knowledge/src/repository.test.ts`
- Modify: `packages/project-knowledge/src/types.ts`
- Modify: `apps/studio/electron/services.ts`
- Modify: `apps/studio/src/shared/studio-api-types.ts`
- Modify: `apps/studio/src/studio-client.ts`
- Modify: `apps/studio/src/App.tsx`

- [ ] **Step 1: 先写 repository 与 service 失败测试**

```ts
it("保存环境时支持 storageStatePath", () => {
  const env = repo.saveEnvironment(project.id, "登录态", "https://example.com", true, "/tmp/state.json");
  expect(env.storageStatePath).toBe("/tmp/state.json");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge test`
Expected: FAIL，环境模型尚未包含会话配置。

- [ ] **Step 3: 扩展知识库环境模型**

```ts
projectEnvironments: sqliteTable("project_environments", {
  storageStatePath: text("storage_state_path"),
})
```

- [ ] **Step 4: 让 Studio 运行时注入环境与变量**

```ts
const runtimeResult = await executeFlow(flow, {
  headless: !showBrowser,
  executionId,
  artifactDir,
  baseUrl: environment.baseUrl,
  storageStatePath: environment.storageStatePath,
  variables,
});
```

- [ ] **Step 5: 回归测试与 Studio 手动验证**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge test && PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/project-knowledge/src/db/schema.ts packages/project-knowledge/src/repository.ts packages/project-knowledge/src/repository.test.ts packages/project-knowledge/src/types.ts apps/studio/electron/services.ts apps/studio/src/shared/studio-api-types.ts apps/studio/src/studio-client.ts apps/studio/src/App.tsx
git commit -m "feat: 打通环境变量与会话注入"
```

### Task 4: 诊断与脆弱性增强

**Files:**
- Modify: `packages/page-intelligence/src/fragility.ts`
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `apps/studio/src/FragilityNotice.tsx`
- Modify: `apps/studio/src/App.tsx`

- [ ] **Step 1: 先补 fragility 与 diagnostic 测试**

```ts
it("当 CSS 含 nth-of-type 时标记 CSS_NTH_OF_TYPE", () => {
  const issues = analyzeFlowFragility(buildNthSelectorFlow());
  expect(issues.some((issue) => issue.code === "CSS_NTH_OF_TYPE")).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test`
Expected: FAIL，当前仅支持两类 fragility issue。

- [ ] **Step 3: 扩展诊断产物写入**

```ts
writeFileSync(
  join(artifactDir, `step-${stepIndex}-diagnostic.json`),
  JSON.stringify(diagnostic, null, 2),
  "utf-8",
);
```

- [ ] **Step 4: 扩展 Studio 展示**

```tsx
<button onClick={() => openExternalPath(step.diagnosticPath)}>
  打开诊断
</button>
```

- [ ] **Step 5: 回归测试**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test && PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/page-intelligence/src/fragility.ts packages/runtime/src/playwright-runner.ts apps/studio/src/FragilityNotice.tsx apps/studio/src/App.tsx
git commit -m "feat: 增强失败诊断与脆弱性体检"
```

### Task 5: 真实页面 Fixture 与回归矩阵

**Files:**
- Create: `examples/fixtures/checkbox-select.html`
- Create: `examples/fixtures/delayed-panel.html`
- Create: `examples/fixtures/upload-form.html`
- Create: `examples/fixtures/spa-route.html`
- Modify: `examples/run-login-flow.ts`
- Create: `examples/run-real-page-smoke.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Create: `docs/guides/fixture-matrix.md`

- [ ] **Step 1: 先写回归矩阵脚本测试**

```ts
it("真实页面 fixture 矩阵全部成功", async () => {
  const summary = await runFixtureMatrix();
  expect(summary.failed).toHaveLength(0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
Expected: FAIL，fixture 与回归脚本尚未创建。

- [ ] **Step 3: 建立本地 fixture**

```html
<select id="city">
  <option value="shanghai">上海</option>
</select>
<input id="agree" type="checkbox" />
```

- [ ] **Step 4: 建立统一回归脚本**

```ts
const matrix = [
  { name: "checkbox-select", flow: buildCheckboxSelectFlow() },
  { name: "delayed-panel", flow: buildDelayedPanelFlow() },
];
```

- [ ] **Step 5: 全量回归**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add examples/fixtures examples/run-login-flow.ts examples/run-real-page-smoke.ts packages/runtime/src/playwright-runner.test.ts docs/guides/fixture-matrix.md
git commit -m "test: 建立真实页面回归矩阵"
```
