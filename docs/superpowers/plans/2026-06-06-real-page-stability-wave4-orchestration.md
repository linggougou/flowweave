# 真实页面稳定性 Wave 4 并行编排板

更新时间：2026-06-06 22:06 CST

## 1. 主目标

在保持当前 `Node 20` 主链稳定的前提下，推进 Wave 4 三条并行轨道：

1. 录制端补齐 `contenteditable` 真实录制闭环
2. Studio 增强结构化修复建议
3. 真实页面矩阵扩展到 `p6`

## 2. 当前基线

- 协调分支：`codex/real-page-stability-program`
- 当前 HEAD：`9ab8388`
- Node 基线：`v20.19.6`
- 当前主门槛：
  - `pnpm lint`
  - `pnpm smoke`
  - `pnpm e2e:real-pages`

## 3. 轨道规划

| 轨道 | 分支 | Worktree | 负责范围 | 禁止修改 | 局部验收 |
|------|------|----------|----------|----------|----------|
| Recorder Contenteditable Contract | `codex/real-page-recorder-contenteditable` | `.worktrees/codex-real-page-recorder-contenteditable` | `apps/extension/**`、`packages/recorder/**` | `examples/**`、`apps/studio/**`、CI | `pnpm --filter @flowweave/recorder test` |
| Studio Repair Suggestions | `codex/real-page-diagnostics-suggestions` | `.worktrees/codex-real-page-diagnostics-suggestions` | `apps/studio/src/**` | `examples/**`、`packages/recorder/**`、CI | `pnpm --filter @flowweave/app-studio test && pnpm --filter @flowweave/app-studio typecheck` |
| Benchmarks P6 | `codex/real-page-benchmarks-p6` | `.worktrees/codex-real-page-benchmarks-p6` | `examples/**`、`docs/guides/fixture-matrix.md`、`packages/runtime/src/real-page-matrix.test.ts` | `apps/studio/**`、`packages/recorder/**`、CI | `pnpm --filter @flowweave/runtime test && pnpm e2e:real-pages` |

## 4. 主代理职责

- 维护 `.codex/operations-log.md` 与 `.codex/verification-report.md`
- 控制 worktree 与子代理边界
- 处理轨道间冲突
- 统一执行 Node 20 验收

## 5. 子代理提示要点

### Recorder Contenteditable Contract

- 关注 `contenteditable` 录制，不做额外选择器体系重写
- 只在必要范围补 DOM hints 与 normalize 回归

### Studio Repair Suggestions

- 复用现有 `FragilityIssue`、diagnostic、target hints
- 不新增新的远程接口或持久化结构

### Benchmarks P6

- 所有 fixture 保持单文件自包含
- `examples/real-page-smoke.ts` 允许新增 `p6` 档位，但尽量不破坏 `baseline` / `p5`

## 6. 合并顺序

1. Recorder Contenteditable Contract
2. Studio Repair Suggestions
3. Benchmarks P6

理由：

- Recorder 轨直接回应“录得到什么”的真实入口问题，优先级最高。
- Studio 建议层与 recorder/benchmarks 文件边界互斥，可并行但可更早并回帮助后续排障。
- Benchmarks P6 改动面最大，放最后更稳。

## 7. 统一验收

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

若 `Benchmarks P6` 扩了矩阵主入口，必要时再补：

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
4. 视情况删除对应 worktree
