# 真实页面稳定性 Wave 10：动作级韧性与 P8 技术根因观测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升 FlowWeave 在真实页面上对瞬态 DOM 抖动、短暂不可操作态和局部遮挡的执行韧性，同时收敛矩阵场景单一真相并补齐 recorded replay 覆盖缺口。

**Architecture:** 不改 Flow DSL，继续复用既有 Target hints、候选消歧、页面快照与诊断 JSON。把新增工作拆成 Runtime Action Resilience、Benchmarks P8、Studio Runtime Cause Insight 三条互斥写入轨道，由主代理统一在 Node 20 下回收与验收。

**Tech Stack:** TypeScript strict、Playwright、Vitest、pnpm、Turborepo、Electron/React 共享逻辑

---

## 任务分解总览

| 任务 | 目标 | 主要写入 |
|------|------|----------|
| Task 1 | runtime 动作级恢复与结构化根因分类 | `packages/runtime/src/*` |
| Task 2 | P8 fixture、矩阵单一真相与 recorded replay 缺口补齐 | `examples/*`、`packages/runtime/src/*matrix*.test.ts`、文档 |
| Task 3 | Studio 动作失败根因洞察与修复建议 | `apps/studio/src/*shared*`、`DiagnosticInspector*` |
| Task 4 | 主线集成与 Node 20 验收 | `.codex/*`、主线验证 |

## Worktree 规划

| 轨道 | 分支 | Worktree 路径 | 负责范围 |
|------|------|---------------|----------|
| Runtime Action Resilience | `codex/real-page-wave10-runtime-resilience` | `.worktrees/codex-real-page-wave10-runtime-resilience` | `packages/runtime/src/playwright-runner.ts`、`types.ts`、`playwright-runner.test.ts` |
| Benchmarks P8 | `codex/real-page-wave10-benchmarks-p8` | `.worktrees/codex-real-page-wave10-benchmarks-p8` | `examples/*`、矩阵测试、`docs/guides/fixture-matrix.md` |
| Studio Runtime Cause Insight | `codex/real-page-wave10-studio-runtime-cause` | `.worktrees/codex-real-page-wave10-studio-runtime-cause` | `apps/studio/src/shared/*`、`DiagnosticInspector*` |

## 全局验收标准

- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts real-page-matrix.test.ts`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector failure-insights repair-suggestions`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`

### Task 1: Runtime Action Resilience

**Files:**
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Modify: `packages/runtime/src/types.ts`

- [ ] **Step 1: 先补失败测试，复现动作瞬态问题**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

目标：

- 新增至少 2 条测试：
  - 首次动作因 detached / rerender 失败，重新定位后二次成功
  - 首次动作因遮挡或短暂不可操作失败，轻量恢复后二次成功

- [ ] **Step 2: 实现动作封装与错误分类**

实现点：

- 为 `click / fill / select / setChecked / press / upload` 提供统一动作执行入口
- 识别可恢复错误并做一次 re-resolve + retry
- 为 `RuntimeErrorDiagnostic` 增加结构化字段：
  - `runtimeCauseCategory`
  - `recoveryTried`
  - `recoveredAttemptCount`

- [ ] **Step 3: 跑 runtime 定向回归**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected:

- PASS

- [ ] **Step 4: 提交**

```bash
git add packages/runtime/src/playwright-runner.ts packages/runtime/src/playwright-runner.test.ts packages/runtime/src/types.ts
git commit -m "feat: 增强运行时动作级韧性"
```

### Task 2: Benchmarks P8 与矩阵单一真相

**Files:**
- Create: `examples/fixtures/rerender-action-panel.html`
- Create: `examples/fixtures/dialog-save-surface.html`
- Modify: `examples/real-page-smoke.ts`
- Modify: `examples/run-real-page-smoke.ts`
- Modify: `examples/recorded-replay-smoke.ts`
- Modify: `packages/runtime/src/real-page-matrix.test.ts`
- Modify: `packages/runtime/src/recorded-replay-matrix.test.ts`
- Modify: `docs/guides/fixture-matrix.md`

- [ ] **Step 1: 新增 fixture 与最小 case 设计**

要求：

- 先统一矩阵总表与 case 归属：
  - 明确 `examples/fixtures` 当前实体页名单
  - 明确 `placeholder-disambiguation` 属于临时生成页，不进入 fixture HTML 总表
  - 把 `keyboard-command-palette` 等主线场景补齐到文档总览
- `rerender-action-panel.html`
  - 让目标按钮或输入框在操作前后发生一次受控 rerender
- `dialog-save-surface.html`
  - 页面主区和弹层都存在保存动作，且弹层动作存在短暂不可操作窗口

- [ ] **Step 2: 扩 `real-page-smoke` 为 `p8` 档位**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts
```

目标：

- 新增 `p8` profile
- 保留 `p7` 兼容逻辑
- 汇总中增加技术根因统计字段或兼容新字段

- [ ] **Step 3: recorded replay 至少接一条动作韧性场景**
- [ ] **Step 3: recorded replay 补至少 2 条当前缺失家族**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts
```

Expected:

- PASS
- recorded replay 新增至少 `2` 条此前未覆盖的真实 fixture 家族

- [ ] **Step 4: 跑 smoke**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected:

- PASS

- [ ] **Step 5: 提交**

```bash
git add examples/fixtures/rerender-action-panel.html examples/fixtures/dialog-save-surface.html examples/real-page-smoke.ts examples/run-real-page-smoke.ts examples/recorded-replay-smoke.ts packages/runtime/src/real-page-matrix.test.ts packages/runtime/src/recorded-replay-matrix.test.ts docs/guides/fixture-matrix.md
git commit -m "feat: 建立 P8 动作韧性基准矩阵"
```

### Task 3: Studio Runtime Cause Insight

**Files:**
- Modify: `apps/studio/src/shared/studio-api-types.ts`
- Modify: `apps/studio/src/shared/failure-insights.ts`
- Modify: `apps/studio/src/shared/failure-insights.test.ts`
- Modify: `apps/studio/src/shared/repair-suggestions.ts`
- Modify: `apps/studio/src/shared/repair-suggestions.test.ts`
- Modify: `apps/studio/src/DiagnosticInspector.tsx`
- Modify: `apps/studio/src/DiagnosticInspector.test.tsx`

- [ ] **Step 1: 先补共享逻辑失败测试**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector failure-insights repair-suggestions
```

目标：

- 新增 `runtimeCauseCategory=detached/intercepted/not-ready/not-editable` 的洞察与建议断言

- [ ] **Step 2: 实现诊断展示与建议**

要求：

- `FailureInsight` 优先展示动作根因和是否已尝试恢复
- `DiagnosticInspector` 能区分“定位问题”和“动作问题”
- `repair-suggestions.ts` 提供更贴近根因的建议

- [ ] **Step 3: 跑 Studio 共享逻辑回归**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector failure-insights repair-suggestions
```

Expected:

- PASS

- [ ] **Step 4: 提交**

```bash
git add apps/studio/src/shared/studio-api-types.ts apps/studio/src/shared/failure-insights.ts apps/studio/src/shared/failure-insights.test.ts apps/studio/src/shared/repair-suggestions.ts apps/studio/src/shared/repair-suggestions.test.ts apps/studio/src/DiagnosticInspector.tsx apps/studio/src/DiagnosticInspector.test.tsx
git commit -m "feat: 增强动作失败根因洞察"
```

### Task 4: 主线集成与 Node 20 验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 回收通过轨道并合并**

顺序：

1. Runtime Action Resilience
2. Benchmarks P8
3. Studio Runtime Cause Insight

- [ ] **Step 2: 跑 Node 20 统一验收**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts real-page-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector failure-insights repair-suggestions
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected:

- 全部 PASS

- [ ] **Step 3: 更新留痕与验收**

要求：

- `.codex/operations-log.md` 记录：
  - 新轨道
  - Node 20 验证
  - 合并与回收状态
- `.codex/verification-report.md` 新增 Wave 10 验收节

- [ ] **Step 4: 提交**

```bash
git add .codex/operations-log.md .codex/verification-report.md
git commit -m "docs: 更新 Wave 10 验收留痕"
```
