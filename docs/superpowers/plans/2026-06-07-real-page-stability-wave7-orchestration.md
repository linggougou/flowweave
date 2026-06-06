# 真实页面稳定性 Wave 7 并行编排板

生成时间：2026-06-07 02:29:38 CST

## 1. 波次主题

- 主题：`真实录制回放闭环 + recorded replay 矩阵`
- 目标：把 FlowWeave 的稳定性证据从“手写 Flow 可跑”推进到“真实录制导出与回放也有独立整链基线”。

## 2. 并行轨道

| 轨道 | 分支 | worktree | 主要写入范围 | 禁止写入范围 | Node 20 验收 |
| --- | --- | --- | --- | --- | --- |
| Extension Session Export Contract | `codex/real-page-wave7-extension-export` | `.worktrees/codex-real-page-wave7-extension-export` | `apps/extension/entrypoints/background.ts`、`apps/extension/lib/background-contract.test.ts`、必要时 `apps/extension/lib/content-contract.test.ts` | `packages/runtime/**`、`examples/**` | `pnpm --filter @flowweave/app-extension test -- background-contract.test.ts content-contract.test.ts` |
| Recorded Replay Coverage Expansion | `codex/real-page-wave7-recorded-replay` | `.worktrees/codex-real-page-wave7-recorded-replay` | `packages/runtime/src/playwright-runner.test.ts`、必要时 `packages/recorder/src/normalize.ts`、`packages/recorder/src/normalize.test.ts` | `apps/studio/**`、`examples/**`、`package.json` | `pnpm --filter @flowweave/recorder test -- normalize.test.ts` + `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts` |
| Recorded Replay Smoke Runner | `codex/real-page-wave7-recorded-smoke` | `.worktrees/codex-real-page-wave7-recorded-smoke` | `examples/recorded-replay-smoke.ts`、`packages/runtime/src/recorded-replay-matrix.test.ts`、`package.json`、`docs/guides/recorded-replay-matrix.md` | `apps/extension/**`、`apps/studio/**`、`packages/recorder/**` | `pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts` + `pnpm e2e:recorded-pages` |

## 3. 主代理职责

1. 保持 Wave 7 主题、设计、计划、编排板与 `.codex` 留痕一致。
2. 在分派前确认 `.worktrees/` 仍被 Git ignore。
3. 为每条轨道提供清晰输入：
   - 目标
   - 文件边界
   - 必跑命令
   - 不允许扩大范围的约束
4. 统一用 `Node v20.19.6` 复验。
5. 合并顺序：
   1. `Extension Session Export Contract`
   2. `Recorded Replay Coverage Expansion`
   3. `Recorded Replay Smoke Runner`
6. 验收通过后：
   - 更新 `.codex/operations-log.md`
   - 更新 `.codex/verification-report.md`
   - 回收 worktree / 分支 / 子代理

## 4. 轨道输入摘要

### 4.1 Extension Session Export Contract

- 关键现状：
  - `background.ts` 当前承接 `MSG_RECORD_EVENT / MSG_EXPORT_FLOW / MSG_SYNC_KNOWLEDGE`
  - 但没有自动化合同测试
- 最重要验收：
  - session 累积事件
  - 导出 JSON 与文件名稳定
  - sync 知识库时透传 `projectId / apiBase / changeMessage`

### 4.2 Recorded Replay Coverage Expansion

- 关键现状：
  - 当前 recorded replay 仅 `7` 条
  - `p7` 手写矩阵已 `19` 条
- 本轮新增目标：
  - `repeated-row-actions`
  - `linked-filters`
  - `session-dashboard`
  - `drawer-double-save`
- 允许的最小修补：
  - `normalize.ts`
  - `normalize.test.ts`

### 4.3 Recorded Replay Smoke Runner

- 关键现状：
  - recorded replay 证据分散在 runtime 单测
  - 没有独立 smoke 命令
- 本轮新增目标：
  - `examples/recorded-replay-smoke.ts`
  - `pnpm e2e:recorded-pages`
  - 文档说明 recorded 与 hand-written matrix 的职责分工

## 5. 风险与补救

- **风险 1：新 worktree 缺少 workspace 依赖产物**
  - 补救：分派后若测试报 `Failed to resolve entry for package`，先在对应 worktree 执行必要 build，再重跑基线。

- **风险 2：recorded replay 新场景暴露 recorder wait 推断缺口**
  - 补救：只在 `packages/recorder/**` 做最小边界修补，并以 `normalize.test.ts` 锁定，不做无限泛化。

- **风险 3：smoke runner 与 runtime 单测重复造 case**
  - 补救：runner 只维护 curated smoke case，runtime 单测继续维护更细粒度断言，职责分开。

## 6. 统一验收命令

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- background-contract.test.ts content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

## 7. 完成定义

满足以下条件才允许回收 Wave 7 资源：

1. 三条轨道都已提交并并回协调分支。
2. Node 20 统一验收通过。
3. `.codex/operations-log.md` 与 `.codex/verification-report.md` 已补 Wave 7 留痕。
4. `git worktree list` 不再保留 Wave 7 临时 worktree。
