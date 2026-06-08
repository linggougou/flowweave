# 真实页面稳定性 Wave 13 并行编排板

> **状态更新（2026-06-09）**：本文档依赖的“Wave 13 主体尚未实现”前提已失效，现已**过时**。请改以 `docs/superpowers/plans/2026-06-09-real-page-stability-residual-gaps-orchestration.md` 作为当前有效编排板。

## 1. 当前状态

- 协调分支：`codex/real-page-stability-program`
- Node 基线：`v20.19.6`
- 当前并行状态：无活跃 `.worktrees/*`
- 进入 Wave 13 前的先决条件：
  - 吸收当前 Studio shell / layout 已验证改动
  - 形成可派生的协调头

## 2. 轨道表

| 轨道 | 分支 | Worktree | 写入边界 | 状态 | 依赖 |
|------|------|----------|----------|------|------|
| Baseline Absorption | `codex/real-page-stability-program` | 主工作区 | `apps/studio/*`、`.codex/*` | `in_progress` | 无 |
| Recorder Scope Hints | `codex/real-page-wave13-recorder-scope-hints` | `.worktrees/codex-real-page-wave13-recorder-scope-hints` | `packages/shared`、`packages/flow-dsl`、`apps/extension`、`packages/recorder` | `pending` | Baseline |
| Runtime Disambiguation | `codex/real-page-wave13-runtime-disambiguation` | `.worktrees/codex-real-page-wave13-runtime-disambiguation` | `packages/runtime` | `pending` | Baseline |
| Studio Ambiguity Insight | `codex/real-page-wave13-studio-ambiguity-insight` | `.worktrees/codex-real-page-wave13-studio-ambiguity-insight` | `apps/studio/src/*` | `pending` | Baseline |
| Benchmarks Repeated Targets | `codex/real-page-wave13-benchmarks-repeated-targets` | `.worktrees/codex-real-page-wave13-benchmarks-repeated-targets` | `examples/*`、矩阵测试、`docs/guides/fixture-matrix.md` | `pending` | Recorder + Runtime |

## 3. 启动顺序

### 阶段 A：收口协调基线

1. 吸收当前 Studio shell / layout 修复。
2. 以 Node 20 重新确认：
   - `pnpm --filter @flowweave/app-studio typecheck`
   - `pnpm --filter @flowweave/app-studio test`
   - `pnpm --filter @flowweave/app-studio build`
3. 提交 `Baseline Absorption`。

### 阶段 B：第一批并行轨道

在基线提交后，同时启动：

1. `Recorder Scope Hints`
2. `Runtime Disambiguation`
3. `Studio Ambiguity Insight`

原因：

- 三条轨道写入边界基本隔离
- Benchmarks 需要等 Recorder / Runtime 合同更稳定后再并行，能减少返工

### 阶段 C：第二批并行轨道

在 `Recorder Scope Hints` 与 `Runtime Disambiguation` 至少各自形成可验收结果后，启动：

1. `Benchmarks Repeated Targets`

## 4. 回收顺序

1. `Recorder Scope Hints`
2. `Runtime Disambiguation`
3. `Studio Ambiguity Insight`
4. `Benchmarks Repeated Targets`

回收原则：

- 每条轨道先本地 Node 20 自验，再进入主代理复验
- 若复验失败，退回原轨道修复，不在主线上做临时热补丁

## 5. 每轨最低验收口径

### Recorder Scope Hints

- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- target-from-dom.test.ts normalize.test.ts step-filter.test.ts`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl typecheck`

### Runtime Disambiguation

- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts`

### Studio Ambiguity Insight

- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/failure-insights.test.ts src/shared/repair-suggestions.test.ts`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`

### Benchmarks Repeated Targets

- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts recorded-replay-matrix.test.ts`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`

## 6. 主线统一门槛

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
```

## 7. 风险与应对

- 风险 1：Studio 基线未先收口，后续 Studio 轨道会在错误布局 / 错误 Electron dist 上继续分叉。
  - 应对：强制先完成 `Baseline Absorption`，再开 Wave 13 worktree。

- 风险 2：Recorder 与 Runtime 同时变更 target hints，容易协议漂移。
  - 应对：Recorder 轨道负责字段保真，Runtime 轨道只消费既定字段；主代理只接受同字段名并回。

- 风险 3：Benchmarks 过早启动会写死错误 fixture 合同。
  - 应对：放到第二批轨道，等 Recorder / Runtime 至少完成局部红灯转绿后再启动。

- 风险 4：Electron `codesign` 残余问题干扰 Wave 13 判断。
  - 应对：把它标记为独立桌面壳风险，不作为本轮歧义目标功能验收阻塞项；但保留在 `.codex` 中持续跟踪。
