# 真实页面稳定性 Wave 11：执行韧性扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前已完成的动作回弹恢复之上，把真实页面执行韧性扩展到 `click / press / upload`，建立 `p8` 动作韧性矩阵，并让 Studio 消费更广的 runtime 根因分类。

**Architecture:** 继续复用现有 `performRecoveredLocatorAction()`、fixture catalog 与 Studio 共享诊断链路，但把后续工作重开为 `Wave 11`。实现顺序是 runtime 先产出结构化字段与恢复能力，benchmarks 负责 `p8` 场景验证，Studio 最后消费 `runtimeCauseCategory` 与恢复尝试信息。

**Tech Stack:** TypeScript strict、Playwright、Vitest、pnpm、Electron/React、Turborepo

---

## 轨道总览

| 轨道 | 分支 | Worktree | 主要写入 |
|------|------|----------|----------|
| Runtime Cause Expansion | `codex/real-page-wave11-runtime-cause-expansion` | `.worktrees/codex-real-page-wave11-runtime-cause-expansion` | `packages/runtime/src/*` |
| Benchmarks P8 Expansion | `codex/real-page-wave11-benchmarks-p8` | `.worktrees/codex-real-page-wave11-benchmarks-p8` | `examples/*`、矩阵测试、`fixture-matrix.md` |
| Studio Runtime Category Expansion | `codex/real-page-wave11-studio-runtime-categories` | `.worktrees/codex-real-page-wave11-studio-runtime-categories` | `apps/studio/src/*` |

## 全局门槛

- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts real-page-matrix.test.ts`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`

### Task 1: Runtime Cause Expansion

**Files:**
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`

- [ ] **Step 1: 写 detached / 遮挡 / 暂不可操作的失败测试**
- [ ] **Step 2: 扩统一动作恢复封装到 `click / press / upload`**
- [ ] **Step 3: 为 `RuntimeErrorDiagnostic` 增加 `runtimeCauseCategory / recoveryTried / recoveredAttemptCount`**
- [ ] **Step 4: 在 Node 20 下运行 `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`**
- [ ] **Step 5: 提交 `feat: 扩展运行时动作根因恢复`**

### Task 2: Benchmarks P8 Expansion

**Files:**
- Create: `examples/fixtures/rerender-action-panel.html`
- Create: `examples/fixtures/dialog-save-surface.html`
- Modify: `examples/real-page-smoke.ts`
- Modify: `examples/run-real-page-smoke.ts`
- Modify: `examples/recorded-replay-smoke.ts`
- Modify: `packages/runtime/src/real-page-matrix.test.ts`
- Modify: `packages/runtime/src/recorded-replay-matrix.test.ts`
- Modify: `docs/guides/fixture-matrix.md`

- [ ] **Step 1: 新增两条动作韧性 fixture，并保持 fixture 总表口径一致**
- [ ] **Step 2: 在 `examples/real-page-smoke.ts` 建立 `p8` profile，保留 `p7` 默认兼容**
- [ ] **Step 3: 为 recorded replay baseline 补至少 `1-2` 条更贴近动作韧性的真实 fixture**
- [ ] **Step 4: 在 Node 20 下运行 `pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts real-page-matrix.test.ts`**
- [ ] **Step 5: 在 Node 20 下运行 `pnpm e2e:recorded-pages` 与 `pnpm e2e:real-pages`**
- [ ] **Step 6: 提交 `feat: 建立 Wave 11 P8 动作韧性矩阵`**

### Task 3: Studio Runtime Category Expansion

**Files:**
- Modify: `apps/studio/src/shared/studio-api-types.ts`
- Modify: `apps/studio/src/shared/failure-insights.ts`
- Modify: `apps/studio/src/shared/repair-suggestions.ts`
- Modify: `apps/studio/src/DiagnosticInspector.tsx`
- Modify: `apps/studio/src/shared/failure-insights.test.ts`
- Modify: `apps/studio/src/shared/repair-suggestions.test.ts`
- Modify: `apps/studio/src/DiagnosticInspector.test.tsx`

- [ ] **Step 1: 先补 `detached / intercepted / not-ready / not-editable / unknown` 的共享逻辑测试**
- [ ] **Step 2: 让 Studio 消费 `runtimeCauseCategory` 与恢复尝试字段**
- [ ] **Step 3: 在 Node 20 下运行 `pnpm --filter @flowweave/app-studio test`**
- [ ] **Step 4: 如有类型改动，再跑 `pnpm --filter @flowweave/app-studio typecheck`**
- [ ] **Step 5: 提交 `feat: 扩展 Studio 动作根因诊断`**

### Task 4: 主线集成与验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 依次并回 Runtime、Benchmarks、Studio 三条轨道**
- [ ] **Step 2: 在主线用 Node 20 跑统一验收命令**
- [ ] **Step 3: 更新 `.codex` 留痕与验收报告**
- [ ] **Step 4: 回收已通过轨道的 worktree 与本地分支**
