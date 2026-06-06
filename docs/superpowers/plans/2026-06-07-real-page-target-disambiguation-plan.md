# 真实页面 Target Disambiguation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FlowWeave 在重复按钮、重复文案和列表行操作这类真实后台页面中，能更稳定地命中正确元素，并在无法唯一确认时给出明确歧义诊断。

**Architecture:** 采用 “Foundation 协议先行 + Recorder / Runtime / Studio / Benchmarks 四轨并行” 模式。Foundation 先为 `Target.hints` 补作用域线索字段；Recorder 负责采集与保真；Runtime 负责候选消解与歧义诊断；Studio 负责展示与修复建议；Benchmarks 负责重复元素 fixture 与整链回归。

**Tech Stack:** TypeScript strict、Vitest、Playwright、pnpm workspace、Turborepo、Electron

---

### Task 1: Foundation 协议基线

**Files:**
- Modify: `packages/flow-dsl/src/schema.ts`
- Modify: `apps/studio/src/shared/studio-api-types.ts`
- Test: `packages/flow-dsl/**`

- [ ] **Step 1: 先写或补红灯断言，冻结 target hints 新字段**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl test
```

Expected:

- 新增 `scopeText` / `scopeKind` 之前，相关断言先失败或类型不可用。

- [ ] **Step 2: 在 DSL 与 Studio 共享类型中补作用域字段**

要求：

- `Target.hints` 新增：
  - `scopeText?: string`
  - `scopeKind?: "row" | "listitem" | "dialog" | "tabpanel" | "section" | "card"`
- Studio API 类型同步补齐，不先改 UI 行为。

- [ ] **Step 3: 跑 Foundation 绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

Expected:

- 协议层和消费类型一致，不引入 TS 漂移。

- [ ] **Step 4: 提交协议基线**

```bash
git add packages/flow-dsl/src/schema.ts apps/studio/src/shared/studio-api-types.ts
git commit -m "feat: 扩展目标作用域提示协议"
```

### Task 2: Recorder Scope Hints

**Files:**
- Modify: `packages/recorder/src/target-from-dom.ts`
- Modify: `packages/recorder/src/target-from-dom.test.ts`
- Modify: `packages/recorder/src/normalize.ts`
- Modify: `packages/recorder/src/normalize.test.ts`
- Test: `packages/recorder/**`

- [ ] **Step 1: 为重复元素场景补红灯录制回归**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- target-from-dom.test.ts normalize.test.ts
```

Expected:

- 新增的作用域 hints 断言先失败。

- [ ] **Step 2: target-from-dom 采集最小作用域线索**

要求：

- 从最近语义容器抽取 `scopeText`
- 标记 `scopeKind`
- 避免把整段长文案或和元素本体重复的文本塞入 payload

- [ ] **Step 3: normalize 保真写入 Flow Target**

要求：

- `buildTargetHints()` 与 `buildTargetFromPayload()` 完整透传新字段
- 不回退既有 `nameAttr / placeholder / labelText / textSample` 行为

- [ ] **Step 4: 跑 Recorder 绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- target-from-dom.test.ts normalize.test.ts step-filter.test.ts
```

Expected:

- 既有 `45/45` 不回退，新增作用域 hints 回归通过。

- [ ] **Step 5: 提交 Recorder 轨道**

```bash
git add packages/recorder/src/target-from-dom.ts packages/recorder/src/target-from-dom.test.ts packages/recorder/src/normalize.ts packages/recorder/src/normalize.test.ts
git commit -m "feat: 为录制目标补充作用域线索"
```

### Task 3: Runtime Disambiguation

**Files:**
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Test: `packages/runtime/**`

- [ ] **Step 1: 为多命中候选消解写红灯回归**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected:

- 新增“重复按钮但应命中正确行”的 recorded replay 用例先失败。

- [ ] **Step 2: resolveTarget 加入候选打分与快路径保护**

要求：

- `matchedCount === 1` 时保持当前快路径
- `matchedCount > 1` 时基于 hints 和 scope 做候选打分
- 只有唯一高分候选才进入成功路径

- [ ] **Step 3: 产出歧义失败诊断**

要求：

- 候选并列或低分时不要静默 `.first()`
- diagnostic 中新增候选摘要，保留既有 `strategyAttempts`

- [ ] **Step 4: 跑 Runtime 绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected:

- 既有 `20/20` 不回退，新增歧义回归通过。

- [ ] **Step 5: 提交 Runtime 轨道**

```bash
git add packages/runtime/src/playwright-runner.ts packages/runtime/src/playwright-runner.test.ts
git commit -m "feat: 增强 runtime 歧义目标消解"
```

### Task 4: Studio Ambiguity Insight

**Files:**
- Modify: `apps/studio/src/DiagnosticInspector.tsx`
- Modify: `apps/studio/src/DiagnosticInspector.test.tsx`
- Modify: `apps/studio/src/shared/repair-suggestions.ts`
- Modify: `apps/studio/src/shared/repair-suggestions.test.ts`
- Modify: `apps/studio/src/shared/studio-api-types.ts`
- Test: `apps/studio/**`

- [ ] **Step 1: 为歧义定位失败补红灯展示回归**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts
```

Expected:

- 新增“多命中 / 候选并列”展示或建议断言先失败。

- [ ] **Step 2: Studio 类型与修复建议补齐歧义场景**

要求：

- 让 `repair-suggestions` 能区分：
  - 候选过多
  - 作用域不足
  - 需要重新录制到正确行或正确弹层

- [ ] **Step 3: DiagnosticInspector 展示更清晰的歧义上下文**

要求：

- 不替换现有诊断表格
- 在歧义场景下增加更直接的解释和下一步动作

- [ ] **Step 4: 跑 Studio 绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

Expected:

- 歧义建议与展示回归通过，类型不漂移。

- [ ] **Step 5: 提交 Studio 轨道**

```bash
git add apps/studio/src/DiagnosticInspector.tsx apps/studio/src/DiagnosticInspector.test.tsx apps/studio/src/shared/repair-suggestions.ts apps/studio/src/shared/repair-suggestions.test.ts apps/studio/src/shared/studio-api-types.ts
git commit -m "feat: 强化 studio 歧义定位洞察"
```

### Task 5: Benchmarks P7

**Files:**
- Create: `examples/fixtures/repeated-row-actions.html`
- Modify: `examples/real-page-smoke.ts`
- Modify: `docs/guides/fixture-matrix.md`
- Modify: `packages/runtime/src/real-page-matrix.test.ts`
- Test: `examples/**`、`packages/runtime/**`

- [ ] **Step 1: 先加红灯 fixture / matrix 回归**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts
```

Expected:

- 新增重复按钮场景的 matrix 断言先失败。

- [ ] **Step 2: 新增重复操作列 fixture**

要求：

- 至少两行共享同文案操作按钮
- 只有目标行操作成功后才会写入正确结果区
- 页面内不要依赖外部请求

- [ ] **Step 3: 把新 fixture 接入 matrix 与真实页面 smoke**

要求：

- `real-page-matrix.test.ts` 和 `examples/real-page-smoke.ts` 补矩阵入口
- `fixture-matrix.md` 同步记录场景说明
- recorded replay 定向回归由 Runtime 轨单独维护，Benchmarks 不改 `playwright-runner.test.ts`

- [ ] **Step 4: 跑 Benchmarks 绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected:

- 新场景并入后矩阵仍全绿。

- [ ] **Step 5: 提交 Benchmarks 轨道**

```bash
git add examples/fixtures/repeated-row-actions.html examples/real-page-smoke.ts docs/guides/fixture-matrix.md packages/runtime/src/real-page-matrix.test.ts
git commit -m "test: 新增歧义目标真实页面基准"
```

### Task 6: 主代理集成与统一验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`
- Modify: `docs/superpowers/plans/2026-06-07-real-page-target-disambiguation-orchestration.md`

- [ ] **Step 1: 按顺序并回 5 条轨道**

顺序：

1. Foundation
2. Recorder Scope Hints
3. Runtime Disambiguation
4. Studio Ambiguity Insight
5. Benchmarks P7

- [ ] **Step 2: 跑统一 Node 20 验收**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected:

- `smoke` 与真实页面矩阵同时通过。

- [ ] **Step 3: 更新留痕与编排板**

要求：

- 记录每条轨道的提交、复验、并回与回收结果
- 补齐最终验证报告评分

- [ ] **Step 4: 提交主代理收口**

```bash
git add .codex/operations-log.md .codex/verification-report.md docs/superpowers/plans/2026-06-07-real-page-target-disambiguation-orchestration.md
git commit -m "chore: 完成 target disambiguation 集成验收"
```
