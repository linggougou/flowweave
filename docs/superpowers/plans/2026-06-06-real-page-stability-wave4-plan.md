# 真实页面稳定性 Wave 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐真实录制对 `contenteditable` 的支持、扩展更贴近后台异常路径的 P6 真实页面矩阵，并让 Studio 直接给出结构化修复建议。

**Architecture:** 本轮拆为 3 条独立轨道：Recorder 轨只负责 `contenteditable` 录制闭环；Benchmarks 轨只负责 `p6` fixture 与矩阵统计；Studio 轨只负责把既有 diagnostic / fragility 数据转成可执行修复建议。三条轨道分别在独立 worktree 中开发，主代理统一集成并用 Node 20 验收。

**Tech Stack:** TypeScript strict、pnpm、Vitest、Playwright、Electron、React

---

### Task 1: Recorder Contenteditable Contract

**Files:**
- Modify: `apps/extension/entrypoints/content.ts`
- Modify: `packages/recorder/src/target-from-dom.ts`
- Modify: `packages/recorder/src/target-from-dom.test.ts`
- Modify: `packages/recorder/src/normalize.test.ts`
- Test: `pnpm --filter @flowweave/recorder test`

- [ ] **Step 1: 先写 contenteditable 红灯测试**

要求：

- `shouldRecordFill()` 对 `contenteditable` 返回 `true`
- `buildInteractionPayload()` 为 `contenteditable` 保留 `role=textbox` / `textSample`
- `content.ts` 采集的 `fill` 值不再局限于 `input/textarea`

- [ ] **Step 2: 跑 recorder 测试确认当前失败**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test
```

Expected:

- 新增 contenteditable 回归失败，证明当前录制闭环还没有覆盖该类控件。

- [ ] **Step 3: 扩展录制采集与 DOM 目标识别**

实现方向：

- `readFillValue()` 支持 `HTMLElement.isContentEditable`
- `shouldRecordFill()` 支持 `contenteditable`
- `inferRole()` / `readTextSample()` 对 `contenteditable` 给出更合理 hints

- [ ] **Step 4: 补 normalize / payload 回归并复跑**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test
```

Expected:

- recorder 测试通过，contenteditable 录制闭环成立。

- [ ] **Step 5: 提交**

```bash
git add apps/extension/entrypoints/content.ts packages/recorder/src/target-from-dom.ts packages/recorder/src/target-from-dom.test.ts packages/recorder/src/normalize.test.ts
git commit -m "feat: 支持 contenteditable 真实录制"
```

### Task 2: Studio Repair Suggestions

**Files:**
- Modify: `apps/studio/src/DiagnosticInspector.tsx`
- Modify: `apps/studio/src/DiagnosticInspector.test.tsx`
- Modify: `apps/studio/src/FragilityNotice.tsx`
- Create: `apps/studio/src/shared/repair-suggestions.ts`
- Create: `apps/studio/src/shared/repair-suggestions.test.ts`
- Test: `pnpm --filter @flowweave/app-studio test && pnpm --filter @flowweave/app-studio typecheck`

- [ ] **Step 1: 先写“修复建议”红灯测试**

要求：

- 至少覆盖以下建议来源：
  - `MISSING_ENVIRONMENT`
  - `MISSING_VARIABLE`
  - 失败策略错误提示
  - `contenteditable` / `upload` / `select` 目标 hints

- [ ] **Step 2: 跑 Studio 测试确认当前失败**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
```

Expected:

- 当前 DiagnosticInspector 只有“优先排查”摘要，没有结构化建议列表。

- [ ] **Step 3: 提取建议生成纯函数并接入 UI**

实现方向：

- `repair-suggestions.ts` 接收 `ExecutionStepLog` / `FragilityIssue[]`
- 返回按优先级排序的动作建议数组
- `DiagnosticInspector` 和 `FragilityNotice` 渲染建议条目，而不是只复述原消息

- [ ] **Step 4: 复跑测试与类型检查**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

Expected:

- Studio 测试与 typecheck 通过。

- [ ] **Step 5: 提交**

```bash
git add apps/studio/src/DiagnosticInspector.tsx apps/studio/src/DiagnosticInspector.test.tsx apps/studio/src/FragilityNotice.tsx apps/studio/src/shared/repair-suggestions.ts apps/studio/src/shared/repair-suggestions.test.ts
git commit -m "feat: 增强 Studio 修复建议层"
```

### Task 3: Benchmarks P6

**Files:**
- Modify: `examples/real-page-smoke.ts`
- Modify: `examples/run-real-page-smoke.ts`
- Modify: `packages/runtime/src/real-page-matrix.test.ts`
- Modify: `docs/guides/fixture-matrix.md`
- Create: `examples/fixtures/session-expired-retry.html`
- Create: `examples/fixtures/bulk-cross-page-selection.html`
- Create: `examples/fixtures/drawer-double-save.html`
- Test: `pnpm --filter @flowweave/runtime test && pnpm e2e:real-pages`

- [ ] **Step 1: 先写 P6 档位与汇总红灯**

要求：

- `real-page-matrix.test.ts` 断言新的 `p6` 场景顺序与数量
- 断言汇总里新增失败类型统计字段

- [ ] **Step 2: 补 3 个 P6 fixture**

优先场景：

- 会话恢复失败一次，二次重试成功
- 跨页批量选择并最终提交
- 抽屉第一次保存失败、修正后第二次保存成功

- [ ] **Step 3: 扩展矩阵汇总与 CLI 输出**

实现方向：

- `runRealPageFixtureMatrix()` 返回失败类型分布
- `run-real-page-smoke.ts` 打印失败类型汇总与最慢场景

- [ ] **Step 4: 跑局部绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected:

- runtime 测试通过
- `p6` 场景全部通过

- [ ] **Step 5: 更新矩阵文档并提交**

```bash
git add examples/real-page-smoke.ts examples/run-real-page-smoke.ts examples/fixtures docs/guides/fixture-matrix.md packages/runtime/src/real-page-matrix.test.ts
git commit -m "test: 扩展真实页面矩阵到 P6"
```

### Task 4: 主代理集成与统一验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 逐轨审查、合并与记录结果**

要求：

- 每条轨道都记录局部验证结果
- 每条轨道都记录是否存在残余风险

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
git commit -m "chore: 记录 Wave 4 并行验收"
```
