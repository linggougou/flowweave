# 真实页面稳定性 Wave 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把真实页面稳定性增强推进到“录制导出更稳、整链回放可证、矩阵观测性更强、Studio 失败根因更直观”的下一阶段。

**Architecture:** 本轮拆为 4 条低耦合轨道。Recorder 轨横跨扩展录制与 recorder 导出稳定化；Runtime 轨只负责 recorded replay 整链回归；Benchmarks 轨只负责矩阵观测性；Studio 轨只负责应用内失败根因工作台。主代理统一集成并在 Node 20 下验收。

**Tech Stack:** TypeScript strict、pnpm、Vitest、Playwright、Electron、React

---

### Task 1: Recorder Async Stabilization

**Files:**
- Modify: `apps/extension/entrypoints/content.ts`
- Modify: `apps/extension/lib/content-contract.test.ts`
- Modify: `packages/recorder/src/normalize.ts`
- Modify: `packages/recorder/src/normalize.test.ts`
- Optional Modify: `packages/recorder/src/step-filter.ts`
- Optional Modify: `packages/recorder/src/step-filter.test.ts`
- Test: `pnpm --filter @flowweave/app-extension test -- lib/content-contract.test.ts`
- Test: `pnpm --filter @flowweave/recorder test -- src/normalize.test.ts src/step-filter.test.ts`

- [ ] **Step 1: 先写录制异步稳定红灯测试**

要求：

- `keydown` 触发 `Enter / Tab / Escape` 或提交型快捷键时，会先 flush 待提交 `fill`，再记录 `keypress`。
- 当相邻事件存在明显异步间隔且下一目标发生变化时，`buildFlowFromEvents()` 能补出最小 `wait`。
- 已有 `navigate / select / upload` 去重规则不回退。

- [ ] **Step 2: 跑扩展与 recorder 定向测试确认当前失败**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- lib/content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- src/normalize.test.ts src/step-filter.test.ts
```

Expected:

- 新增 `keypress` flush / wait 推断回归失败。

- [ ] **Step 3: 在 content / normalize 中补最小稳定化规则**

实现方向：

- 先在 `content.ts` 中收口待提交输入，再发 `keypress`
- 只在有限场景插入 `wait urlIncludes` 或 `wait visible`
- 不推断跨页面或同目标的冗余等待
- 仅在必要时调整 `step-filter.ts`，保持现有去噪稳定

- [ ] **Step 4: 复跑扩展与 recorder 测试**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- lib/content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- src/normalize.test.ts src/step-filter.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test
```

Expected:

- 扩展与 recorder 测试通过。

- [ ] **Step 5: 提交**

```bash
git add apps/extension/entrypoints/content.ts apps/extension/lib/content-contract.test.ts packages/recorder/src/normalize.ts packages/recorder/src/normalize.test.ts packages/recorder/src/step-filter.ts packages/recorder/src/step-filter.test.ts
git commit -m "feat: 增强录制异步稳定性"
```

### Task 2: Runtime Recorded Replay Expansion

**Files:**
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Optional Modify: `examples/fixtures/contenteditable-editor.html`
- Optional Modify: `examples/fixtures/empty-results-retry.html`
- Optional Modify: `examples/fixtures/linked-filters.html`
- Test: `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`

- [ ] **Step 1: 先写 recorded replay 红灯测试**

要求：

- 新增至少 2 条 recorded replay 整链回归：
  - `contenteditable-editor`
  - `session-expired-retry`
  - 若节奏允许，再补 `bulk-cross-page-selection`

- [ ] **Step 2: 跑 runtime 定向测试确认当前失败或缺失**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected:

- 新增 recorded replay 用例当前失败，或必须依赖 Recorder 轨新增等待能力才会通过。

- [ ] **Step 3: 让整链回归转绿**

实现方向：

- 优先复用现有 fixture
- 如需微调 fixture，只允许补稳定锚点，不改页面语义

- [ ] **Step 4: 复跑 runtime 定向测试**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected:

- recorded replay 定向测试通过。

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/playwright-runner.test.ts examples/fixtures
git commit -m "test: 扩展 recorded replay 整链回归"
```

### Task 3: Benchmarks Observability

**Files:**
- Modify: `examples/real-page-smoke.ts`
- Modify: `examples/run-real-page-smoke.ts`
- Modify: `packages/runtime/src/real-page-matrix.test.ts`
- Modify: `docs/guides/fixture-matrix.md`
- Test: `pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts && pnpm e2e:real-pages`

- [ ] **Step 1: 先写最慢场景排行红灯**

要求：

- `real-page-matrix.test.ts` 断言矩阵汇总中新增最慢场景排行字段。
- CLI 输出最慢场景排行。

- [ ] **Step 2: 跑局部测试确认当前失败**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts
```

Expected:

- 新增排行断言失败。

- [ ] **Step 3: 扩展矩阵汇总与 CLI**

实现方向：

- 基于 `results.durationMs` 生成稳定排行
- 不改变 `baseline / p5 / p6` 当前顺序与默认档位

- [ ] **Step 4: 跑矩阵局部绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected:

- matrix 测试与 `p6` 执行通过。

- [ ] **Step 5: 更新文档并提交**

```bash
git add examples/real-page-smoke.ts examples/run-real-page-smoke.ts packages/runtime/src/real-page-matrix.test.ts docs/guides/fixture-matrix.md
git commit -m "test: 增强真实页面矩阵观测性"
```

### Task 4: Studio Failure Insight Workbench

**Files:**
- Modify: `apps/studio/src/App.tsx`
- Modify: `apps/studio/src/DiagnosticInspector.tsx`
- Modify: `apps/studio/src/DiagnosticInspector.test.tsx`
- Create or Modify: `apps/studio/src/shared/failure-insights.ts`
- Create or Modify: `apps/studio/src/shared/failure-insights.test.ts`
- Modify: `packages/ui/src/StepLogTable.tsx`
- Test: `pnpm --filter @flowweave/app-studio test && pnpm --filter @flowweave/app-studio typecheck`

- [ ] **Step 1: 先写失败根因工作台红灯测试**

要求：

- 执行历史列表能前移失败原因或优先排查摘要
- page snapshot 摘要能直接展示
- artifact 入口拆分可见

- [ ] **Step 2: 跑 Studio 测试确认当前失败**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
```

Expected:

- 当前执行历史与诊断面板还没有新的失败摘要块。

- [ ] **Step 3: 先抽纯函数，再接入执行历史和诊断面板**

实现方向：

- 把 page snapshot / strategyAttempts / target hints 摘成 `failure-insights` 纯函数
- `App.tsx` 负责把摘要喂给 `StepLogTable`
- `DiagnosticInspector` 只负责渲染详情与 artifact 入口

- [ ] **Step 4: 复跑 Studio 测试与类型检查**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

Expected:

- Studio 测试与 typecheck 通过。

- [ ] **Step 5: 提交**

```bash
git add apps/studio/src/App.tsx apps/studio/src/DiagnosticInspector.tsx apps/studio/src/DiagnosticInspector.test.tsx apps/studio/src/shared packages/ui/src/StepLogTable.tsx
git commit -m "feat: 增强 Studio 失败根因工作台"
```

### Task 5: 主代理集成与统一验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 逐轨审查、合并与记录结果**

要求：

- 记录每条轨道的局部验证结果、边界符合性与残余风险。

- [ ] **Step 2: 跑 Node 20 统一验收**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected:

- lint / smoke / 真实页面矩阵全部通过。

- [ ] **Step 3: 提交协调分支验收记录**

```bash
git add .codex/operations-log.md .codex/verification-report.md
git commit -m "chore: 记录 Wave 5 并行验收"
```
