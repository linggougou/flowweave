# 真实页面稳定性 Wave 6 并行编排板

更新时间：2026-06-07 01:52 CST

## 1. 主目标

在保持 `Node 20.19.6` 主链稳定的前提下，推进下一轮真实页面执行稳定性增强，重点解决：

1. 多步骤静态脆弱性预警缺口
2. runtime 非定位类失败缺少结构化诊断
3. Studio 只能消费目标类诊断的问题

## 2. 当前基线

- 协调分支：`codex/real-page-stability-program`
- 当前工作区：干净
- 已验证基线：
  - `pnpm --filter @flowweave/page-intelligence test -- fragility.test.ts`
  - `pnpm --filter @flowweave/app-studio test -- src/shared/failure-insights.test.ts DiagnosticInspector.test.tsx`
- 真实页面矩阵基线：
  - `pnpm e2e:real-pages` 上一轮通过，`p7` 共 `19` 个 case

## 3. 轨道规划

| 轨道 | 分支 | Worktree | 负责范围 | 禁止修改 | 局部验收 |
|------|------|----------|----------|----------|----------|
| Fragility Multi-Step Coverage | `codex/real-page-wave6-fragility` | `.worktrees/codex-real-page-wave6-fragility` | `packages/page-intelligence/src/fragility.ts`、`packages/page-intelligence/src/fragility.test.ts` | `packages/runtime/**`、`apps/studio/**`、`examples/**` | `pnpm --filter @flowweave/page-intelligence test -- fragility.test.ts` |
| Runtime Generic Diagnostic Envelope | `codex/real-page-wave6-runtime-diagnostic` | `.worktrees/codex-real-page-wave6-runtime-diagnostic` | `packages/runtime/src/playwright-runner.ts`、`packages/runtime/src/types.ts`、`packages/runtime/src/index.ts`、`packages/runtime/src/playwright-runner.test.ts` | `apps/studio/**`、`packages/page-intelligence/**`、`examples/**` | `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts` |
| Studio Unified Failure Insight | `codex/real-page-wave6-studio-diagnostic` | `.worktrees/codex-real-page-wave6-studio-diagnostic` | `apps/studio/src/shared/studio-api-types.ts`、`apps/studio/electron/services.ts`、`apps/studio/src/shared/failure-insights.ts`、`apps/studio/src/DiagnosticInspector.tsx` 与对应测试 | `packages/runtime/**`、`packages/page-intelligence/**`、`examples/**` | `pnpm --filter @flowweave/app-studio test -- src/shared/failure-insights.test.ts DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts && pnpm --filter @flowweave/app-studio typecheck` |

## 4. 契约先决条件

所有轨道统一遵循以下 envelope：

```ts
type StepDiagnosticKind = "target-resolution" | "runtime-error";
```

公共字段：

- `kind`
- `stepId`
- `stepIndex`
- `stepType`
- `message`
- `errorCode?`
- `cause?`
- `url?`
- `title?`

仅 `target-resolution` 允许额外携带：

- `strategyAttempts`
- `targetHints`

Studio 轨不得自行发明第三种 `kind`。

## 5. 主代理职责

- 维护 `.codex/operations-log.md` 与 `.codex/verification-report.md`
- 控制跨轨契约一致性
- 统一做 Node 20 验收
- 处理轨道合并顺序与回收

## 6. 合并顺序

1. Fragility Multi-Step Coverage
2. Runtime Generic Diagnostic Envelope
3. Studio Unified Failure Insight

理由：

- fragility 轨与其他轨道文件边界完全独立，可先快速并回。
- Studio 轨需要最终 runtime 诊断 envelope 形状，故排在 runtime 之后并回最稳。

## 7. 统一验收

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test -- fragility.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- src/shared/failure-insights.test.ts DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

如 runtime 轨改动影响较深，再补：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

## 8. 回收规则

满足以下条件即可回收轨道：

1. 改动范围没有越界
2. 局部命令通过
3. 规格复核通过
4. 代码质量复核无阻塞问题

回收动作：

1. 主代理复验
2. 合并分支
3. 关闭子代理
4. 删除 worktree 与分支
