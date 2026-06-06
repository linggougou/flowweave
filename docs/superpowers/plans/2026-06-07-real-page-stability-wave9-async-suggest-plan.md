# 真实页面稳定性 Wave 9：异步 Suggest / Active-Descendant 键盘稳定性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FlowWeave 能稳定录制并回放真实页面里常见的“输入后异步 suggestions 准备，再用 `ArrowDown` / `ArrowUp` + `Enter` 完成选择”的键盘流程。

**Architecture:** 采用 3 条互斥轨道并行推进：扩展侧收紧导航目标录制条件，runtime 侧补 suggest-ready / active-descendant 窄等待，fixture/smoke 侧补异步命令面板基线与文档。继续复用 `keypress -> press` 协议，不新增 recorded event 类型。

**Tech Stack:** TypeScript strict、Vitest、Playwright、WXT、pnpm、Node v20.19.6

---

## 文件结构

- `apps/extension/entrypoints/content.ts`
  - 收紧 `isKeyboardNavigationTarget()` 的 suggest 判定。
- `apps/extension/lib/content-contract.test.ts`
  - 锁定负样本边界与 pending fill flush 语义。
- `packages/runtime/src/playwright-runner.ts`
  - 新增 suggest-ready / active-descendant 窄等待 helper。
- `packages/runtime/src/playwright-runner.test.ts`
  - 为 runtime 等待能力补独立回归。
- `packages/recorder/src/normalize.test.ts`
  - 锁定“导航键仍不触发 recorder 自动 wait”边界。
- `examples/fixtures/async-command-palette.html`
  - 新增异步命令面板 fixture。
- `examples/recorded-replay-smoke.ts`
  - recorded replay baseline 增加 async suggest case。
- `packages/runtime/src/recorded-replay-matrix.test.ts`
  - 同步 `12 -> 13` 条 baseline 契约。
- `examples/real-page-smoke.ts`
  - hand-written real-pages 增加 async suggest case。
- `packages/runtime/src/real-page-matrix.test.ts`
  - 同步 real-pages 汇总与计数契约。
- `docs/guides/recorded-replay-matrix.md`
  - 记录新的 recorded replay 场景。
- `docs/guides/fixture-matrix.md`
  - 记录新的异步命令面板 fixture 与矩阵数量。

### Task 1: Capture Heuristic Tightening

**Files:**
- Modify: `apps/extension/entrypoints/content.ts`
- Modify: `apps/extension/lib/content-contract.test.ts`

- [ ] **Step 1: 先写红灯合同测试**

覆盖：

- `aria-autocomplete="none"` 的输入框按 `ArrowDown` 不会录成 `keypress`
- 只有 `aria-controls`、但缺少 combobox / suggest 语义的普通输入框不会录制方向键
- 真正的 suggest 输入仍会录制 `ArrowDown`

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
```

Expected: FAIL，说明当前导航目标判定仍然过宽。

- [ ] **Step 3: 做最小实现**

实现方向：

- 在 `content.ts` 收紧 `isKeyboardNavigationTarget()`
- `role="combobox"` 继续允许
- `aria-autocomplete` 仅当值不是 `"none"` 时才算导航
- 单独的 `aria-controls` 不再自动视为 suggest 目标

- [ ] **Step 4: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/extension/entrypoints/content.ts apps/extension/lib/content-contract.test.ts
git commit -m "feat: 收紧键盘导航录制判定"
```

### Task 2: Press Wait Stabilization

**Files:**
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`

- [ ] **Step 1: 先写 runtime 红灯回归**

覆盖：

- suggest / combobox 输入 `fill` 后，会 best-effort 等待候选列表 ready
- `press ArrowDown` 后，会等待 `aria-activedescendant` 或 active option 生效
- 普通输入框 `press ArrowDown` 不应被新 helper 强绑等待

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected: FAIL，暴露当前 runtime 对 suggest ready 与 active-descendant 缺少专门等待。

- [ ] **Step 3: 做最小实现**

实现方向：

- 在 `playwright-runner.ts` 增加 suggest 目标判定 helper
- `fill` 后仅对 suggest 目标做短暂 ready 等待
- `ArrowDown / ArrowUp` 后仅对 suggest 目标做 active-descendant / active option 等待
- 保留既有 `waitForPageSettled()`，不要替换通用等待入口

- [ ] **Step 4: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/playwright-runner.ts packages/runtime/src/playwright-runner.test.ts
git commit -m "feat: 补齐 suggest 键盘等待稳定性"
```

### Task 3: Async Suggest Replay Matrix

**Files:**
- Modify: `packages/recorder/src/normalize.test.ts`
- Create: `examples/fixtures/async-command-palette.html`
- Modify: `examples/recorded-replay-smoke.ts`
- Modify: `packages/runtime/src/recorded-replay-matrix.test.ts`
- Modify: `examples/real-page-smoke.ts`
- Modify: `packages/runtime/src/real-page-matrix.test.ts`
- Modify: `docs/guides/recorded-replay-matrix.md`
- Modify: `docs/guides/fixture-matrix.md`

- [ ] **Step 1: 先写 recorded replay 与 real-pages 红灯**

新增 `async-command-palette` 场景：

- `fill` 输入更宽关键字
- 异步 suggestions 完成后用 `ArrowDown`
- `Enter` 命中目标命令
- 成功态断言落在稳定结果节点

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts real-page-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected: FAIL，说明当前矩阵尚未覆盖异步 suggest。

- [ ] **Step 3: 实现 fixture 与矩阵扩容**

实现方向：

- 新建 `examples/fixtures/async-command-palette.html`
- `recorded replay` baseline 从 `12` 扩到 `13`
- `real-pages` baseline 从 `20` 扩到 `21`
- `normalize.test.ts` 补一条“导航按键不额外推断 wait”的回归
- 文档与矩阵测试同步对齐计数

- [ ] **Step 4: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts real-page-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/recorder/src/normalize.test.ts examples/fixtures/async-command-palette.html examples/recorded-replay-smoke.ts packages/runtime/src/recorded-replay-matrix.test.ts examples/real-page-smoke.ts packages/runtime/src/real-page-matrix.test.ts docs/guides/recorded-replay-matrix.md docs/guides/fixture-matrix.md
git commit -m "feat: 扩展异步 suggest 回放矩阵"
```

### Task 4: 主代理集成与统一验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 合并通过轨道**

推荐顺序：

1. `Capture Heuristic Tightening`
2. `Press Wait Stabilization`
3. `Async Suggest Replay Matrix`

- [ ] **Step 2: 运行 Node 20 统一验收**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts real-page-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected: 全通过

- [ ] **Step 3: 补留痕并回收资源**

必须写明：

- 扩展层收紧了哪些负样本边界
- runtime 新增了哪些 suggest-ready / active-descendant 等待
- recorded replay 与 real-pages 分别扩到多少条
- worktree / 分支 / 子代理回收结果
