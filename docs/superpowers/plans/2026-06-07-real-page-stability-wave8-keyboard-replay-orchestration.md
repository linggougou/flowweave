# 真实页面稳定性 Wave 8 并行编排板

生成时间：2026-06-07 04:05:00 CST

## 1. 波次主题

- 主题：`键盘驱动录制回放补齐`
- 目标：把真实用户常见的键盘导航录制能力补进 recorded replay 主线，尤其是 `ArrowDown / ArrowUp + Enter` 类交互。

## 2. 并行轨道

| 轨道 | 分支 | worktree | 主要写入范围 | 禁止写入范围 | Node 20 验收 |
| --- | --- | --- | --- | --- | --- |
| Keyboard Capture Contract | `codex/real-page-wave8-keyboard-capture` | `.worktrees/codex-real-page-wave8-keyboard-capture` | `apps/extension/entrypoints/content.ts`、`apps/extension/lib/content-contract.test.ts` | `packages/runtime/**`、`examples/**` | `pnpm --filter @flowweave/app-extension test -- content-contract.test.ts` |
| Keyboard Replay Matrix | `codex/real-page-wave8-keyboard-replay` | `.worktrees/codex-real-page-wave8-keyboard-replay` | `examples/fixtures/keyboard-command-palette.html`、`packages/runtime/src/playwright-runner.test.ts`、`examples/recorded-replay-smoke.ts`、`packages/runtime/src/recorded-replay-matrix.test.ts`、`examples/real-page-smoke.ts`、`docs/guides/recorded-replay-matrix.md`、必要时 `packages/recorder/src/normalize.test.ts` | `apps/extension/**`、`apps/studio/**` | `pnpm --filter @flowweave/recorder test -- normalize.test.ts` + `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts` + `pnpm e2e:recorded-pages` + `pnpm e2e:real-pages` |

## 3. 主代理职责

1. 维护 Wave 8 的 spec / plan / orchestration 与 `.codex` 留痕一致。
2. 分派前确认 `.worktrees/` 仍被 Git ignore。
3. 为每条轨道明确：
   - 目标
   - 文件边界
   - 必跑命令
   - 不允许扩大范围的约束
4. 统一使用 `Node v20.19.6` 复验。
5. 合并顺序：
   1. `Keyboard Capture Contract`
   2. `Keyboard Replay Matrix`
6. 验收通过后：
   - 更新 `.codex/operations-log.md`
   - 更新 `.codex/verification-report.md`
   - 回收 worktree / 分支 / 子代理

## 4. 轨道输入摘要

### 4.1 Keyboard Capture Contract

- 关键现状：
  - `content.ts` 当前只稳定录 `Enter / Tab / Escape`
  - `ArrowDown / ArrowUp` 在真实组合框 / suggest 输入上仍会被忽略
- 最重要验收：
  - 方向键会被录制
  - 方向键不会错误 flush pending fill
  - 普通非导航型输入框不会被放大成噪声

### 4.2 Keyboard Replay Matrix

- 关键现状：
  - runtime 已支持 `press`
  - 但没有真实页面风格的 recorded replay 键盘导航 fixture
- 本轮新增目标：
  - `keyboard-command-palette` fixture
  - recorded replay 单测
  - recorded smoke baseline
  - real-pages smoke 对应场景

## 5. 风险与补救

- **风险 1：方向键录制过宽**
  - 补救：只放开 `ArrowDown / ArrowUp`，并限定在组合框 / suggest / `select` 目标。

- **风险 2：fixture 过于理想化**
  - 补救：增加异步结果刷新、当前高亮项、Enter 确认后的详情面板，避免静态占位。

- **风险 3：recorded replay 与 hand-written 覆盖脱节**
  - 补救：同名场景同时进入 `playwright-runner.test.ts`、`e2e:recorded-pages` 与 `e2e:real-pages`。

## 6. 统一验收命令

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

## 7. 完成定义

满足以下条件才允许回收 Wave 8 资源：

1. 两条轨道都已提交并并回协调分支。
2. Node 20 统一验收通过。
3. `.codex/operations-log.md` 与 `.codex/verification-report.md` 已补 Wave 8 留痕。
4. `git worktree list` 不再保留 Wave 8 临时 worktree。
