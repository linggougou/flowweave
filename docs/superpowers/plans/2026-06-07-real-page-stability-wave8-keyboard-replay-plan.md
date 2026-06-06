# 真实页面稳定性 Wave 8：键盘驱动录制回放补齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FlowWeave 能稳定录制并回放真实页面里常见的“ArrowDown / ArrowUp + Enter”键盘导航流程。

**Architecture:** 采用 2 条互斥轨道并行推进：扩展内容脚本补键盘导航录制合同，runtime/fixture 侧补键盘命令面板 recorded replay 与 smoke matrix。继续复用现有 `keypress -> press` 协议，不新增事件类型。

**Tech Stack:** TypeScript strict、Vitest、Playwright、WXT、pnpm、Node v20.19.6

---

## 文件结构

- `apps/extension/entrypoints/content.ts`
  - 扩展按键录制判定，只在键盘导航型目标上放开 `ArrowDown / ArrowUp`。
- `apps/extension/lib/content-contract.test.ts`
  - 锁定方向键录制与 pending fill flush 边界。
- `packages/recorder/src/normalize.test.ts`
  - 如有必要，补方向键 `keypress -> press` 归一化回归。
- `examples/fixtures/keyboard-command-palette.html`
  - 新增真实页面风格的键盘命令面板 fixture。
- `packages/runtime/src/playwright-runner.test.ts`
  - 新增 keyboard-command-palette recorded replay 用例。
- `examples/recorded-replay-smoke.ts`
  - baseline 增加 `keyboard-command-palette`。
- `packages/runtime/src/recorded-replay-matrix.test.ts`
  - 同步 summary 契约。
- `examples/real-page-smoke.ts`
  - 新增 hand-written keyboard-command-palette 场景。
- `docs/guides/recorded-replay-matrix.md`
  - 文档补充键盘导航场景。

### Task 1: Keyboard Capture Contract

**Files:**
- Modify: `apps/extension/entrypoints/content.ts`
- Modify: `apps/extension/lib/content-contract.test.ts`
- Modify: `.codex/operations-log.md`

- [ ] **Step 1: 先写红灯合同测试**

覆盖：

- 在 `role="combobox"` / `aria-autocomplete` 目标上，`ArrowDown` 会被录成 `keypress`。
- `ArrowDown` 不会像 `Enter` 那样先 flush pending fill。
- 普通非导航型输入框上的 `ArrowDown` 不应被录制。

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
```

Expected: FAIL，说明当前内容脚本还不会录方向键导航。

- [ ] **Step 3: 做最小实现**

实现方向：

- 在 `content.ts` 新增键盘导航型目标判断 helper。
- `ArrowDown / ArrowUp` 仅对组合框 / suggest / 原生 `select` 生效。
- `Enter / Tab / Escape` 的现有 flush 语义保持不变。

- [ ] **Step 4: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/extension/entrypoints/content.ts apps/extension/lib/content-contract.test.ts
git commit -m "feat: 补齐键盘导航录制合同"
```

### Task 2: Keyboard Replay Matrix

**Files:**
- Create: `examples/fixtures/keyboard-command-palette.html`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Modify: `examples/recorded-replay-smoke.ts`
- Modify: `packages/runtime/src/recorded-replay-matrix.test.ts`
- Modify: `examples/real-page-smoke.ts`
- Modify: `docs/guides/recorded-replay-matrix.md`
- Modify: `packages/recorder/src/normalize.test.ts`

- [ ] **Step 1: 先写 recorded replay 红灯**

新增 `keyboard-command-palette` recorded event 场景：

- `fill` 输入关键词
- `keypress ArrowDown`
- `keypress Enter`
- 验证结果面板或详情面板进入成功态

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts
```

Expected: FAIL，暴露当前没有键盘导航 fixture / baseline 契约。

- [ ] **Step 3: 实现 fixture 与矩阵扩容**

实现方向：

- 新建 `examples/fixtures/keyboard-command-palette.html`
- 在 `playwright-runner.test.ts` 增加 recorded replay case
- 在 `examples/recorded-replay-smoke.ts` baseline 中加入 `keyboard-command-palette`
- 在 `examples/real-page-smoke.ts` 加入 hand-written 对应场景
- 若 recorder 层需要额外方向键回归，只补测试，不轻易改生产代码

- [ ] **Step 4: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add examples/fixtures/keyboard-command-palette.html packages/runtime/src/playwright-runner.test.ts examples/recorded-replay-smoke.ts packages/runtime/src/recorded-replay-matrix.test.ts examples/real-page-smoke.ts docs/guides/recorded-replay-matrix.md packages/recorder/src/normalize.test.ts
git commit -m "feat: 扩展键盘导航回放矩阵"
```

### Task 3: 主代理集成与统一验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 合并通过轨道**

顺序：

1. `Keyboard Capture Contract`
2. `Keyboard Replay Matrix`

- [ ] **Step 2: 运行 Node 20 统一验收**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected: 全通过

- [ ] **Step 3: 补留痕并回收资源**

必须写明：

- 扩展层放开了哪些按键、在哪些目标上生效
- 新增了哪个键盘导航 fixture 与 recorded replay baseline
- 是否需要修改 recorder 生产代码
- worktree / 分支 / 子代理回收结果
