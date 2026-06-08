# 真实页面稳定性 Wave 12：Web 与 Scroll 合同收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持 Node 20 smoke 稳定的前提下，先吸收当前主工作区 Foundation 改动，再补齐 Web Flow 版本恢复链路与 `scroll` 录制/DSL/执行闭环，让真实页面录制与执行对长页面和历史版本恢复更可信。

**Architecture:** 这一轮采用“Foundation 先行 + 2 条并行主轨 + 1 条后继执行轨”的模式。主代理先在协调分支吸收当前已验证的 fragility、runtime TS 与 `doctor/smoke` 基线；随后并行启动 `Web Restore Contract` 与 `Scroll Capture Contract` 两条 worktree 轨道。待 `Scroll Capture Contract` 并回后，再启动独占 `packages/runtime` 的 `Scroll Runtime Contract`，最后由主代理做 Node 20 统一验收与回收。

**Tech Stack:** TypeScript strict、Vitest、Playwright、pnpm workspace、Turborepo、Electron、Vite、Node 20

---

## 轨道总览

| 轨道 | 分支 | Worktree | 主要写入 |
|------|------|----------|----------|
| Foundation Baseline | `codex/real-page-stability-program` | 主工作区 | `packages/page-intelligence`、`packages/runtime`、`scripts/doctor.mjs`、`package.json`、`apps/studio/package.json` |
| Web Restore Contract | `codex/real-page-wave12-web-restore-contract` | `.worktrees/codex-real-page-wave12-web-restore-contract` | `apps/web/server/*` |
| Scroll Capture Contract | `codex/real-page-wave12-scroll-capture-contract` | `.worktrees/codex-real-page-wave12-scroll-capture-contract` | `apps/extension`、`packages/shared`、`packages/recorder`、`packages/flow-dsl` |
| Scroll Runtime Contract | `codex/real-page-wave12-scroll-runtime-contract` | `.worktrees/codex-real-page-wave12-scroll-runtime-contract` | `packages/runtime`、`examples/*`、矩阵测试 |

## 全局门槛

- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime typecheck`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-web test`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:prepare`
- [ ] `CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`

### Task 1: Foundation Baseline

**Files:**
- Modify: `packages/page-intelligence/src/fragility.ts`
- Modify: `packages/page-intelligence/src/fragility.test.ts`
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Modify: `scripts/doctor.mjs`
- Modify: `package.json`
- Modify: `apps/studio/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: 核对当前工作树仅包含本轮已知 Foundation 改动**
  - 关注点：
    - `fragility` 的稳定 CSS 锚点判定
    - `runtime` 的 `ElementHandle` 兼容修正
    - `doctor/smoke` 的 `better-sqlite3` ABI 前置自检
    - `apps/studio/package.json` 与根 `package.json` 的依赖/脚本一致性

- [ ] **Step 2: 固化 fragility 的稳定 CSS 启发式**
  - 要求：
    - 对 `#id`、`[name=...]`、`[data-testid=...]` 等稳定锚点不误报 `CSS_ONLY`
    - 对 `nth-of-type`、结构组合器和纯结构空格选择器继续判为脆弱
    - 若已命中 `CSS_NTH_OF_TYPE`，不再重复给 `CSS_ONLY`

- [ ] **Step 3: 固化 runtime 与 smoke 基线**
  - 要求：
    - `packages/runtime/src/playwright-runner.ts` 继续使用显式 `ElementHandle` 状态对象，避免 TS/CLI 在 `Node 20` 下报错
    - `packages/runtime/src/playwright-runner.test.ts` 保持 ESM 导入后缀正确
    - `scripts/doctor.mjs` 支持 `--smoke` 模式并在 smoke 前检查 `better-sqlite3` ABI
    - 根 `package.json` 的 `smoke` / `smoke:full` 统一串联 `smoke:prepare`

- [ ] **Step 4: 用 Node 20 跑 Foundation 局部验证**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime typecheck
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:prepare
CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
```

Expected:

- fragility 测试通过
- runtime typecheck 通过
- smoke 前置自检通过
- `pnpm smoke` 通过

- [ ] **Step 5: 提交 Foundation 基线**

```bash
git add packages/page-intelligence packages/runtime scripts/doctor.mjs package.json apps/studio/package.json pnpm-lock.yaml
git commit -m "fix: 收紧本地执行与 fragility 基线"
```

### Task 2: Web Restore Contract

**Files:**
- Modify: `apps/web/server/index.ts`
- Modify: `apps/web/server/api.test.ts`
- Optional Create: `apps/web/server/create-server.ts`

- [ ] **Step 1: 先写红灯 HTTP 路由测试，锁定 restore 实际不可达**
  - 覆盖至少两条路径：
    - `POST /api/projects/:projectId/flow-versions/:versionId/restore` 成功恢复旧版本
    - 不存在版本时返回 `404` 或仓储错误被正确映射
  - 测试必须经过真实 HTTP 请求，而不是直接 new `ProjectKnowledgeRepository()`

- [ ] **Step 2: 抽出可测试的 server factory 或 request handler**
  - 要求：
    - 避免测试导入模块时直接抢占固定端口 `3847`
    - 允许测试注入临时 `ProjectKnowledgeRepository`
    - 保持当前生产入口 `pnpm --filter @flowweave/app-web start` 行为不变

- [ ] **Step 3: 修正 restore 路由分发条件**
  - 要求：
    - `GET /api/projects/:projectId/flow-versions/:versionId`
    - `POST /api/projects/:projectId/flow-versions/:versionId/restore`
    - 路径段判断清晰，不再出现外层长度和内层路径互相矛盾

- [ ] **Step 4: 用 Node 20 跑 Web 局部验证**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-web test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-web typecheck
```

Expected:

- `app-web` 测试通过，且 restore 路由有真实 HTTP 覆盖
- 类型检查通过

- [ ] **Step 5: 提交轨道分支**

```bash
git add apps/web/server
git commit -m "fix: 修复 web flow 版本恢复路由"
```

### Task 3: Scroll Capture Contract

**Files:**
- Modify: `packages/shared/src/recording-protocol.ts`
- Modify: `apps/extension/entrypoints/content.ts`
- Modify: `packages/recorder/src/normalize.ts`
- Modify: `packages/recorder/src/normalize.test.ts`
- Modify: `packages/flow-dsl/src/schema.ts`

- [ ] **Step 1: 先写红灯测试，锁定 scroll 从协议到 Flow 的缺口**
  - 覆盖至少这些场景：
    - `RecordedEvent` 允许带 scroll payload
    - `normalizeRecordedEvent(scroll)` 不再返回 `null`
    - `buildFlowFromEvents()` 会保留 scroll 步骤，而不是静默丢弃
    - `flowDocumentSchema` 能校验 scroll 步骤

- [ ] **Step 2: 定义 scroll 的统一步骤形态**
  - 建议形态：
    - `type: "scroll"`
    - `x` / `y` 为非负数
    - `target` 可选；无 `target` 表示页面滚动，有 `target` 表示容器滚动
  - 要求：
    - 不新增第二套 scroll 模型
    - 共享协议、normalize 结果和 DSL schema 三处字段保持同名

- [ ] **Step 3: 在扩展侧补 scroll 录制**
  - 要求：
    - 监听窗口与可滚动容器的 scroll
    - 做最小去抖，避免连续滚轮刷出噪声事件
    - 容器 scroll 需复用现有 target 解析逻辑，尽量保留 `strategies/hints`

- [ ] **Step 4: 在 recorder 与 DSL 层打通 scroll**
  - 要求：
    - `normalize.ts` 新增 `normalizeScroll()`
    - `buildFlowFromEvents()` 生成的 `variables`、`wait` 推断不被 scroll 干扰
    - `packages/flow-dsl/src/schema.ts` 新增 scroll step schema，并继续保持 strict typing

- [ ] **Step 5: 用 Node 20 跑 Capture 局部验证**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl typecheck
```

Expected:

- recorder 测试通过
- DSL 类型检查通过

- [ ] **Step 6: 提交轨道分支**

```bash
git add packages/shared apps/extension packages/recorder packages/flow-dsl
git commit -m "feat: 打通 scroll 录制与 dsl 合同"
```

### Task 4: Scroll Runtime Contract

**Files:**
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Modify: `packages/runtime/src/recorded-replay-matrix.test.ts`
- Optional Create: `examples/fixtures/scroll-playground.html`
- Optional Modify: `examples/recorded-replay-smoke.ts`

- [ ] **Step 1: 以前一轨道并回后的 scroll schema 为基线，先补红灯执行测试**
  - 覆盖至少两类执行：
    - 页面级 scroll：滚到指定 `x/y`
    - 容器级 scroll：定位目标后设置 `scrollTop/scrollLeft`
  - 优先使用本地 fixture 或现有 matrix harness，避免依赖不稳定公网页面

- [ ] **Step 2: 在 runtime 执行 scroll 步骤**
  - 要求：
    - 页面级 scroll 走 `page.evaluate(() => window.scrollTo(...))`
    - 容器级 scroll 走 locator 对应元素的 `scrollTo`
    - 执行后等待一帧或短暂稳定点，避免下一步立即读取旧布局

- [ ] **Step 3: 把 scroll 纳入 recorded replay / 真实页面回归**
  - 要求：
    - 至少补 1 条本地 fixture 证明录制后的 scroll 可回放
    - 不要求本轮立即把 scroll 加入所有公网基准，但要让矩阵有明确回归入口

- [ ] **Step 4: 用 Node 20 跑 Runtime 局部验证**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
```

Expected:

- runtime 测试通过
- recorded replay 基准通过

- [ ] **Step 5: 提交轨道分支**

```bash
git add packages/runtime examples
git commit -m "feat: 支持 scroll 回放执行"
```

### Task 5: 主线集成与统一验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 依次并回 Web Restore、Scroll Capture、Scroll Runtime 三条轨道**
  - 顺序：
    1. Foundation
    2. Web Restore Contract
    3. Scroll Capture Contract
    4. Scroll Runtime Contract

- [ ] **Step 2: 在主线用 Node 20 跑统一验收**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-web test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:prepare
CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
```

Expected:

- Web、录制、执行和 smoke 全部通过

- [ ] **Step 3: 更新 `.codex` 留痕与审查结论**
  - 记录：
    - 每条轨道的 agent / worktree / 验收命令
    - 合并顺序与冲突处理
    - 若同一阻塞连续 3 次，明确标记为阻塞

- [ ] **Step 4: 回收已通过轨道的 worktree 与子代理**
  - 回收条件：
    - 对应局部命令通过
    - 主线复验通过
    - 无未解决阻塞评审项
