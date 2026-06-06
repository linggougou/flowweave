# 真实页面稳定性增强下一轮并行开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 7 个真实页面基准和基础诊断能力之上，继续补齐最影响真实页面落地的 4 类缺口：Recorder 真实录制闭环、上下文相关脆弱性预检、Studio 内诊断下钻、以及更贴近后台业务的回归矩阵场景。

**Architecture:** 本轮采用 4 条独立 worktree 轨道并行推进。`Recorder P2` 轨道只负责扩展录制与 recorder 去噪闭环；`Fragility` 轨道只负责 page-intelligence 规则与测试；`Diagnostics UI` 轨道只负责 Electron/Studio/共享 UI 的诊断展示；`Benchmarks P4` 轨道只负责 examples、矩阵脚本、runtime 矩阵测试与矩阵文档。四条轨道写入范围互斥，由主代理最终集成并执行 `Node 20` 统一验收。

**Tech Stack:** TypeScript strict、pnpm、Turborepo、Vitest、Playwright、Electron、React

---

## Worktree 规划

| 轨道 | 分支 | Worktree 路径 | 文件边界 | 验收命令 |
|------|------|---------------|----------|----------|
| Recorder P2 | `codex/real-page-recorder-p2` | `.worktrees/codex-real-page-recorder-p2` | `apps/extension/**`、`packages/recorder/**`、必要时 `packages/shared/src/recording-protocol.ts` | `pnpm --filter @flowweave/recorder test` |
| Fragility | `codex/real-page-fragility-context` | `.worktrees/codex-real-page-fragility-context` | `packages/page-intelligence/**`、相关文档 | `pnpm --filter @flowweave/page-intelligence test` |
| Diagnostics UI | `codex/real-page-diagnostics-ui` | `.worktrees/codex-real-page-diagnostics-ui` | `apps/studio/**`、`packages/ui/**`、必要时 `apps/studio/electron/**` | `pnpm --filter @flowweave/app-studio typecheck && pnpm --filter @flowweave/ui build` |
| Benchmarks P4 | `codex/real-page-benchmarks-p4` | `.worktrees/codex-real-page-benchmarks-p4` | `examples/**`、`packages/runtime/src/playwright-runner.test.ts`、`docs/guides/fixture-matrix.md` | `pnpm --filter @flowweave/runtime test && pnpm e2e:real-pages` |

**Worktree 预热备注：**
- `Recorder P2` 与 `Fragility` 安装依赖后即可直接执行局部测试。
- `Diagnostics UI` 在隔离 worktree 中先执行 `pnpm --filter @flowweave/page-intelligence build && pnpm --filter @flowweave/ui build`，再跑 `app-studio typecheck`。
- `Benchmarks P4` 在隔离 worktree 中先执行 `pnpm --filter @flowweave/shared build && pnpm --filter @flowweave/flow-dsl build && pnpm --filter @flowweave/page-intelligence build`，再跑 `runtime test`。

## 统一验收标准

- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:full`
- [ ] 扩展录制产出的 Flow 至少补齐 `press`、`upload` 契约和真实页面去噪闭环
- [ ] Studio 能直接在应用内查看失败步骤的诊断 JSON 关键内容，而不只是“打开文件”
- [ ] 脆弱性分析能识别缺失环境与缺失变量，不再只做纯静态选择器检查
- [ ] 真实页面矩阵继续全部通过，并补入会话失效、分页、Drawer、toast/轻量确认四类后台压力场景

### Task 1: Recorder 真实录制闭环补强

**Files:**
- Modify: `apps/extension/entrypoints/content.ts`
- Modify: `packages/shared/src/recording-protocol.ts`
- Modify: `packages/recorder/src/normalize.ts`
- Modify: `packages/recorder/src/normalize.test.ts`
- Modify: `packages/recorder/src/step-filter.ts`
- Modify: `packages/recorder/src/step-filter.test.ts`

- [ ] **Step 1: 先写失败测试，证明当前还没有 `press` 与更完整去噪**

```ts
it("将 keypress 事件归一化为 press 步骤", () => {
  const step = normalizeRecordedEvent(keypressEvent("Enter"));
  expect(step).toMatchObject({ type: "press", key: "Enter" });
});

it("去掉重复的 select / setChecked / upload 步骤", () => {
  const steps = filterNoisyInteractionSteps([...duplicateSelectSteps]);
  expect(steps).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
Expected: FAIL，当前 recorder 还不会把 `keypress` 归一化为 `press`，也没有覆盖重复 `select / setChecked / upload` 去噪。

- [ ] **Step 3: 扩展 content script 与协议**

```ts
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Enter" && event.key !== "Tab" && event.key !== "Escape") {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    sendEvent({
      type: "keypress",
      timestamp: Date.now(),
      url: window.location.href,
      payload: buildInteractionPayload(target, "press", { key: event.key }),
    });
  },
  true,
);
```

- [ ] **Step 4: 修正 upload 契约与真实页面去噪**

```ts
return {
  id: event.id,
  type: "upload",
  target,
  files: files.map((name) => `{{upload:${name}}}`),
};
```

```ts
if (current.type === "navigate" && next?.type === "navigate" && current.url === next.url) {
  continue;
}
```

- [ ] **Step 5: 回归测试**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/extension/entrypoints/content.ts packages/shared/src/recording-protocol.ts packages/recorder/src/normalize.ts packages/recorder/src/normalize.test.ts packages/recorder/src/step-filter.ts packages/recorder/src/step-filter.test.ts
git commit -m "feat: 增强真实页面录制闭环稳定性"
```

### Task 2: Fragility 上下文预检

**Files:**
- Modify: `packages/page-intelligence/src/fragility.ts`
- Modify: `packages/page-intelligence/src/fragility.test.ts`
- Modify: `packages/page-intelligence/src/index.ts`

- [ ] **Step 1: 先写失败测试，证明当前分析器还不会看环境和变量上下文**

```ts
it("当相对地址 navigate 缺少 baseUrl 时给出 MISSING_ENVIRONMENT", () => {
  const issues = analyzeFlowFragility(flowWithRelativeNavigate);
  expect(issues.some((issue) => issue.code === "MISSING_ENVIRONMENT")).toBe(true);
});

it("当步骤引用变量但运行输入缺失时给出 MISSING_VARIABLE", () => {
  const issues = analyzeFlowFragility(flowWithVariables, {
    variables: { providedOnly: "ok" },
  });
  expect(issues.some((issue) => issue.code === "MISSING_VARIABLE")).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test`
Expected: FAIL，当前 issue code 还没有 `MISSING_ENVIRONMENT` 与 `MISSING_VARIABLE`。

- [ ] **Step 3: 扩展分析器入参和 issue code**

```ts
export type FragilityAnalysisContext = {
  baseUrl?: string;
  variables?: Record<string, unknown>;
};

export type FragilityIssue["code"] =
  | "CSS_ONLY"
  | "NO_STRATEGIES"
  | "CSS_NTH_OF_TYPE"
  | "TEXT_ONLY"
  | "WAIT_MAY_BE_UNSTABLE"
  | "MISSING_ENVIRONMENT"
  | "MISSING_VARIABLE";
```

- [ ] **Step 4: 实现最小规则**

```ts
if (step.type === "navigate" && !isAbsoluteUrl(step.url) && !context.baseUrl) {
  issues.push({
    stepId: step.id,
    stepIndex,
    code: "MISSING_ENVIRONMENT",
    message: "流程包含相对地址，但当前没有可用 baseUrl，真实页面回放会直接失败",
    severity: "error",
  });
}
```

- [ ] **Step 5: 回归测试**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/page-intelligence/src/fragility.ts packages/page-intelligence/src/fragility.test.ts packages/page-intelligence/src/index.ts
git commit -m "feat: 增强脆弱性上下文预检"
```

### Task 3: Studio 诊断下钻与脆弱性分组展示

**Files:**
- Modify: `apps/studio/electron/preload.ts`
- Modify: `apps/studio/electron/services.ts`
- Modify: `apps/studio/src/shared/studio-api-types.ts`
- Modify: `apps/studio/src/studio-client.ts`
- Modify: `apps/studio/src/App.tsx`
- Modify: `apps/studio/src/FragilityNotice.tsx`
- Create: `apps/studio/src/DiagnosticInspector.tsx`
- Modify: `packages/ui/src/StepLogTable.tsx`

- [ ] **Step 1: 先写类型与组件失败约束**

```ts
type StudioStepDiagnostic = {
  stepId: string;
  stepIndex: number;
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
```

```tsx
expect(screen.getByText("策略尝试")).toBeInTheDocument();
expect(screen.getByText("当前页面")).toBeInTheDocument();
```

- [ ] **Step 2: 运行类型检查确认当前还没有应用内下钻**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
Expected: 先补代码后再通过；当前 Studio 只有“打开诊断”文件路径，没有读取和渲染诊断内容的能力。

- [ ] **Step 3: 在 Electron 暴露读取诊断 JSON 的 API**

```ts
async function readDiagnosticFile(filePath: string): Promise<StudioStepDiagnostic> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as StudioStepDiagnostic;
}
```

- [ ] **Step 4: 在 Studio 中新增诊断面板与脆弱性分组**

```tsx
<DiagnosticInspector
  diagnostic={selectedDiagnostic}
  onClose={() => setSelectedDiagnostic(null)}
/>
```

```tsx
const errors = warnings.filter((item) => item.severity === "error");
const warningsOnly = warnings.filter((item) => item.severity === "warning");
```

- [ ] **Step 5: 回归类型检查与构建**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck && PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/ui build`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/studio/electron/preload.ts apps/studio/electron/services.ts apps/studio/src/shared/studio-api-types.ts apps/studio/src/studio-client.ts apps/studio/src/App.tsx apps/studio/src/FragilityNotice.tsx apps/studio/src/DiagnosticInspector.tsx packages/ui/src/StepLogTable.tsx
git commit -m "feat: 增强 Studio 诊断下钻体验"
```

### Task 4: Benchmarks P4 真实页面矩阵扩容

**Files:**
- Create: `examples/fixtures/paginated-list.html`
- Create: `examples/fixtures/drawer-edit-form.html`
- Create: `examples/fixtures/toast-popconfirm.html`
- Create: `examples/fixtures/session-expired-dashboard.html`
- Modify: `examples/real-page-smoke.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Modify: `docs/guides/fixture-matrix.md`

- [ ] **Step 1: 先把 runtime 矩阵测试改成红灯**

```ts
expect(summary.results).toHaveLength(11);
expect(summary.results.map((item) => item.name)).toEqual([
  "checkbox-select",
  "delayed-panel",
  "upload-form",
  "spa-route",
  "session-dashboard",
  "filterable-list",
  "modal-bulk-action",
  "paginated-list",
  "drawer-edit-form",
  "toast-popconfirm",
  "session-expired-dashboard",
]);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
Expected: FAIL，当前矩阵仍只有 7 个 case。

- [ ] **Step 3: 新增本地 fixture**

```html
<button id="next-page">下一页</button>
<section id="page-summary" data-ready="false" data-page="1"></section>
```

```html
<section id="expired-shell" data-session="expired"></section>
<button id="return-login">返回登录</button>
```

```html
<button id="open-editor-drawer">编辑任务</button>
<aside id="editor-drawer" data-ready="false"></aside>
```

```html
<button id="archive-with-toast">归档并确认</button>
<div id="toast-popconfirm" data-ready="false"></div>
```

- [ ] **Step 4: 把新场景接入矩阵**

```ts
{
  name: "paginated-list",
  flow: buildFlow("flow_paginated_list", "分页列表流程", [...]),
},
{
  name: "drawer-edit-form",
  flow: buildFlow("flow_drawer_edit_form", "Drawer 编辑流程", [...]),
},
{
  name: "toast-popconfirm",
  flow: buildFlow("flow_toast_popconfirm", "轻量确认流程", [...]),
}
```

- [ ] **Step 5: 跑局部与仓库级回归**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test && PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add examples/fixtures/paginated-list.html examples/fixtures/drawer-edit-form.html examples/fixtures/toast-popconfirm.html examples/fixtures/session-expired-dashboard.html examples/real-page-smoke.ts packages/runtime/src/playwright-runner.test.ts docs/guides/fixture-matrix.md
git commit -m "feat: 扩展真实页面矩阵到后台压力场景"
```

## 主代理集成步骤

- [ ] **Step 1: 逐个回收已验收子代理并合并 worktree 分支**

Run:

```bash
git cherry-pick <recorder-p2-commit>
git cherry-pick <fragility-commit>
git cherry-pick <diagnostics-ui-commit>
git cherry-pick <benchmarks-p4-commit>
```

Expected: 四条轨道代码全部进入 `codex/real-page-stability-program`。

- [ ] **Step 2: 运行统一验收**

Run: `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint && PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:full`
Expected: PASS

- [ ] **Step 3: 更新留痕与编排板**

```bash
git add .codex/operations-log.md .codex/verification-report.md docs/superpowers/plans/2026-06-06-real-page-stability-orchestration.md
git commit -m "chore: 记录下一轮并行开发验收"
```
