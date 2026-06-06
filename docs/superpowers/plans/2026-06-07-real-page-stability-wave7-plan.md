# 真实页面稳定性 Wave 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 FlowWeave 的下一阶段稳定性重点从“手写 Flow 可跑”推进到“真实录制回放闭环更可证实、更可验收”。

**Architecture:** 采用 3 条互斥轨道并行推进：扩展 background 合同测试、runtime recorded replay 覆盖扩张、独立 recorded replay smoke runner。优先复用现有 fixture、`buildFlowFromEvents()` 与 `executeFlow()`，只在红灯逼迫时做最小 recorder 修补。

**Tech Stack:** TypeScript strict、Vitest、Playwright、Electron/WXT、pnpm、Node v20.19.6

---

## 文件结构

- `apps/extension/entrypoints/background.ts`
  - 必要时抽出最小可测试辅助逻辑，保持消息处理链行为稳定。
- `apps/extension/lib/background-contract.test.ts`
  - 新增 background session/export/sync 合同测试。
- `packages/runtime/src/playwright-runner.test.ts`
  - 新增高价值 recorded replay 整链用例。
- `packages/recorder/src/normalize.ts`
  - 仅当 recorded replay 红灯暴露 wait 推断或去噪缺口时修改。
- `packages/recorder/src/normalize.test.ts`
  - 对应 recorder 层补红绿回归。
- `examples/recorded-replay-smoke.ts`
  - 新增 recorded replay 烟测入口。
- `packages/runtime/src/recorded-replay-matrix.test.ts`
  - 锁定 smoke summary 结构与关键 case 列表。
- `package.json`
  - 新增 `e2e:recorded-pages`。
- `docs/guides/recorded-replay-matrix.md`
  - 记录 smoke runner 使用方式、场景范围和验收命令。

### Task 1: Extension Session Export Contract

**Files:**
- Modify: `apps/extension/entrypoints/background.ts`
- Create: `apps/extension/lib/background-contract.test.ts`

- [ ] **Step 1: 先写红灯测试，锁定 background 消息处理链当前未被证明的行为**

覆盖：

- `MSG_RECORD_EVENT` 连续两次后，`eventCount` 应递增。
- `MSG_EXPORT_FLOW` 应调用 `buildFlowFromEvents()`，且返回 `filename + json`。
- `MSG_SYNC_KNOWLEDGE` 应调用 `saveFlowToKnowledge()`，并透传 `projectId / changeMessage`。

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- background-contract.test.ts
```

Expected: 新增测试失败，暴露当前 background 消息处理链没有自动化证明。

- [ ] **Step 3: 做最小实现或可测试性调整**

实现方向：

- 保持现有 `onMessage` 行为不变。
- 如测试难以稳定挂钩，可抽出最小 helper，但不要改消息协议。
- 优先 mock `browser.storage`、`buildFlowFromEvents()`、`saveFlowToKnowledge()`，避免新建复杂测试基座。

- [ ] **Step 4: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- background-contract.test.ts content-contract.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/extension/entrypoints/background.ts apps/extension/lib/background-contract.test.ts apps/extension/lib/content-contract.test.ts
git commit -m "test: 补强扩展导出链路合同"
```

### Task 2: Recorded Replay Coverage Expansion

**Files:**
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Modify: `packages/recorder/src/normalize.ts`
- Modify: `packages/recorder/src/normalize.test.ts`

- [ ] **Step 1: 写 recorded replay 红灯测试，先锁定 4 条新增高价值场景**

新增用例：

- `repeated-row-actions`
- `linked-filters`
- `session-dashboard`
- `drawer-double-save`

每条用例都必须使用：

- `parseRecordedEvent()`
- `buildFlowFromEvents()`
- `executeFlow()`

而不是手写 Flow。

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected: 至少部分新增用例失败，暴露当前 recorded replay 归一化或等待推断缺口。

- [ ] **Step 3: 如有必要，最小修补 recorder 归一化边界**

优先检查：

- `insertInferredWaitSteps()` 是否缺少当前场景必需的最小等待
- `filterNoisyInteractionSteps()` 是否保留了不该保留的重复交互
- `buildFlowVariables()` 是否漏声明了新增 recorded 场景变量

要求：

- 只修补被红灯证明的边界
- 不做“无限放宽”的广义 wait 推断

- [ ] **Step 4: recorder 层补对应单测**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
```

Expected: PASS

- [ ] **Step 5: runtime recorded replay 绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/runtime/src/playwright-runner.test.ts packages/recorder/src/normalize.ts packages/recorder/src/normalize.test.ts
git commit -m "test: 扩展 recorded replay 真实页面覆盖"
```

### Task 3: Recorded Replay Smoke Runner

**Files:**
- Create: `examples/recorded-replay-smoke.ts`
- Create: `packages/runtime/src/recorded-replay-matrix.test.ts`
- Modify: `package.json`
- Create: `docs/guides/recorded-replay-matrix.md`

- [ ] **Step 1: 先写 runner 结构测试，锁定 smoke summary 协议**

要求：

- summary 至少包含：
  - `profile`
  - `results`
  - `successCount`
  - `failureCount`
  - `totalDurationMs`
- case 名单应覆盖当前 recorded replay curated 集合。

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts
```

Expected: 由于 runner 与脚本尚不存在而失败。

- [ ] **Step 3: 实现 smoke runner 与脚本入口**

实现方向：

- 新建 `examples/recorded-replay-smoke.ts`
- 复用现有 fixture server / storage state / upload 文件资产思路
- 通过 `buildFlowFromEvents()` 构建每个 case
- `package.json` 新增：

```json
"e2e:recorded-pages": "tsx examples/recorded-replay-smoke.ts"
```

- [ ] **Step 4: 写使用文档**

文档至少写清：

- 这个 runner 证明什么
- 它和 `pnpm e2e:real-pages` 的区别
- Node 20 验收命令
- 当前覆盖的 recorded replay 场景族群

- [ ] **Step 5: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add examples/recorded-replay-smoke.ts packages/runtime/src/recorded-replay-matrix.test.ts package.json docs/guides/recorded-replay-matrix.md
git commit -m "feat: 新增 recorded replay smoke runner"
```

### Task 4: 主代理集成与统一验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 合并通过轨道**

顺序：

1. `Extension Session Export Contract`
2. `Recorded Replay Coverage Expansion`
3. `Recorded Replay Smoke Runner`

- [ ] **Step 2: 运行 Node 20 统一验收**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- background-contract.test.ts content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected: 全通过

- [ ] **Step 3: 补留痕**

必须写明：

- 新增 background 合同测试覆盖了哪些消息
- recorded replay 新增了哪些真实页面场景
- recorded smoke runner 的 profile / case 范围
- Node 20 统一验收结果
