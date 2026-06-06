# 真实页面稳定性 Wave 5 并行编排板

更新时间：2026-06-06 23:11 CST

## 1. 主目标

在保持 `Node 20` 主链稳定的前提下，推进下一轮真实页面稳定性增强，重点解决：

1. 复杂异步页面录制导出的 Flow 稳定性
2. recorded replay 整链证明覆盖面
3. 真实页面矩阵长期观测性
4. Studio 应用内排障证据效率

## 2. 当前基线

- 协调分支：`codex/real-page-stability-program`
- 当前 HEAD：`14873f2`
- Node 基线：`v20.19.6`
- 当前主门槛：
  - `pnpm lint`
  - `pnpm smoke`
  - `pnpm e2e:real-pages`

## 3. 轨道规划

| 轨道 | 分支 | Worktree | 负责范围 | 禁止修改 | 局部验收 |
|------|------|----------|----------|----------|----------|
| Recorder Async Stabilization | `codex/real-page-recorder-async-stability` | `.worktrees/codex-real-page-recorder-async-stability` | `apps/extension/entrypoints/content.ts`、`apps/extension/lib/content-contract.test.ts`、`packages/recorder/src/normalize.ts`、必要时 `packages/recorder/src/step-filter.ts` | `examples/**`、`apps/studio/**` | `pnpm --filter @flowweave/app-extension test -- lib/content-contract.test.ts && pnpm --filter @flowweave/recorder test -- src/normalize.test.ts src/step-filter.test.ts` |
| Runtime Recorded Replay Expansion | `codex/real-page-runtime-recorded-replay` | `.worktrees/codex-real-page-runtime-recorded-replay` | `packages/runtime/src/playwright-runner.test.ts`、必要时相关 fixture | `apps/studio/**`、`examples/real-page-smoke.ts` | `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts` |
| Benchmarks Observability | `codex/real-page-benchmarks-observability` | `.worktrees/codex-real-page-benchmarks-observability` | `examples/real-page-smoke.ts`、`examples/run-real-page-smoke.ts`、`packages/runtime/src/real-page-matrix.test.ts`、`docs/guides/fixture-matrix.md` | `packages/recorder/**`、`apps/studio/**` | `pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts && pnpm e2e:real-pages` |
| Studio Failure Insight Workbench | `codex/real-page-studio-failure-insights` | `.worktrees/codex-real-page-studio-failure-insights` | `apps/studio/src/App.tsx`、`apps/studio/src/DiagnosticInspector.tsx`、`apps/studio/src/shared/failure-insights.ts`、`packages/ui/src/StepLogTable.tsx` | `examples/**`、`packages/recorder/**` | `pnpm --filter @flowweave/app-studio test && pnpm --filter @flowweave/app-studio typecheck` |

## 4. 主代理职责

- 维护 `.codex/operations-log.md` 与 `.codex/verification-report.md`
- 控制 worktree / 分支边界与合并顺序
- 处理轨道间冲突
- 做 Node 20 统一验收

## 5. 子代理提示要点

### Recorder Async Stabilization

- 只做有限边界的 wait 推断，不要把 recorder 改成“猜测所有用户意图”的规则引擎。
- `keydown` 触发提交型按键前，优先 flush 待提交 `fill`。
- 优先保护现有 `navigate / select / setChecked / upload` 稳定化规则不回退。

### Runtime Recorded Replay Expansion

- 优先复用现有 fixture，不新造大页面。
- 如果需要改 fixture，只允许补稳定锚点，不改既有语义。

### Benchmarks Observability

- 只增强观测字段，不新扩默认档位。
- 不能破坏 `baseline / p5 / p6` 的既有顺序与主入口。

### Studio Failure Insight Workbench

- 优先复用现有 `pageSnapshot`、`diagnostic`、`repair-suggestions` 数据。
- 重点是把失败根因前移到执行历史和诊断首屏，不是继续堆原始 JSON 视图。
- 不新增新的 Electron API，除非现有数据链确实不足。

## 6. 合并顺序

1. Recorder Async Stabilization
2. Runtime Recorded Replay Expansion
3. Benchmarks Observability
4. Studio Failure Insight Workbench

理由：

- Runtime 整链回归最依赖 Recorder 的新等待能力，先并 Recorder 更稳。
- Benchmarks 与 Studio 文件边界互斥，可并行开发，但集成时让矩阵轨先落可减少后续验收噪音。

## 7. 统一验收

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

如 Benchmarks 轨额外调整了默认输出，再补：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:full
```

## 8. 回收规则

满足以下条件即可回收轨道：

1. 授权范围内改动完整
2. 局部命令通过
3. 规格复核通过
4. 代码质量复核无阻塞问题

回收动作：

1. 记录轨道摘要
2. 合并分支
3. 关闭子代理
4. 删除对应 worktree
