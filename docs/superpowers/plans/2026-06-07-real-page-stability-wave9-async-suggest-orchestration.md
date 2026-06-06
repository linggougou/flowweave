# 真实页面稳定性 Wave 9 并行编排板

生成时间：2026-06-07 03:54:29 CST

## 1. 波次主题

- 主题：`异步 Suggest / Active-Descendant 键盘稳定性`
- 目标：把真实后台里“输入后异步 suggestions 准备，再用 `ArrowDown` / `ArrowUp` + `Enter` 完成选择”的链路纳入稳定录制与回放主线。

## 2. 并行轨道

| 轨道 | 分支 | worktree | 主要写入范围 | 禁止写入范围 | Node 20 验收 |
| --- | --- | --- | --- | --- | --- |
| Capture Heuristic Tightening | `codex/real-page-wave9-capture-tightening` | `.worktrees/codex-real-page-wave9-capture-tightening` | `apps/extension/entrypoints/content.ts`、`apps/extension/lib/content-contract.test.ts` | `packages/runtime/**`、`examples/**`、`docs/guides/**` | `pnpm --filter @flowweave/app-extension test -- content-contract.test.ts` |
| Press Wait Stabilization | `codex/real-page-wave9-press-wait` | `.worktrees/codex-real-page-wave9-press-wait` | `packages/runtime/src/playwright-runner.ts`、`packages/runtime/src/playwright-runner.test.ts` | `apps/extension/**`、`examples/**`、`packages/recorder/**`、`docs/guides/**` | `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts` |
| Async Suggest Replay Matrix | `codex/real-page-wave9-async-suggest-matrix` | `.worktrees/codex-real-page-wave9-async-suggest-matrix` | `packages/recorder/src/normalize.test.ts`、`examples/fixtures/async-command-palette.html`、`examples/recorded-replay-smoke.ts`、`packages/runtime/src/recorded-replay-matrix.test.ts`、`examples/real-page-smoke.ts`、`packages/runtime/src/real-page-matrix.test.ts`、`docs/guides/recorded-replay-matrix.md`、`docs/guides/fixture-matrix.md` | `apps/extension/**`、`packages/runtime/src/playwright-runner.ts`、`packages/runtime/src/playwright-runner.test.ts` | `pnpm --filter @flowweave/recorder test -- normalize.test.ts` + `pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts real-page-matrix.test.ts` + `pnpm e2e:recorded-pages` + `pnpm e2e:real-pages` |

## 3. 主代理职责

1. 维护 Wave 9 的 spec / plan / orchestration 与 `.codex` 留痕一致。
2. 分派前确认：
   - `git worktree list` 当前仅剩主工作区
   - `.worktrees/` 仍被 Git ignore
3. 为每条轨道明确：
   - 目标
   - 写入边界
   - 必跑命令
   - 不允许扩大范围的约束
4. 统一使用 `Node v20.19.6` 复验。
5. 合并顺序：
   1. `Capture Heuristic Tightening`
   2. `Press Wait Stabilization`
   3. `Async Suggest Replay Matrix`
6. 验收通过后：
   - 更新 `.codex/operations-log.md`
   - 更新 `.codex/verification-report.md`
   - 回收 worktree / 分支 / 子代理

## 4. 轨道输入摘要

### 4.1 Capture Heuristic Tightening

- 关键现状：
  - 当前 `isKeyboardNavigationTarget()` 只要命中 `aria-controls` 就会放开方向键，容易误录。
- 本轨必须保证：
  - `aria-autocomplete="none"` 不再被误判为 suggest
  - 只有真实 combobox / suggest 目标继续录 `ArrowDown / ArrowUp`
  - pending fill flush 边界不回退

### 4.2 Press Wait Stabilization

- 关键现状：
  - runtime `press` 后只有通用 `waitForPageSettled()`
  - 还不会专门等 `aria-activedescendant` 或 active option ready
- 本轨必须保证：
  - 只在 suggest / combobox 目标上增加窄等待
  - 普通输入不被强绑新等待
  - 既有 `click / select / setChecked / upload` 不回退

### 4.3 Async Suggest Replay Matrix

- 关键现状：
  - `keyboard-command-palette` 目前是同步过滤
  - recorded replay baseline 仍停在 `12`
  - real-pages 实跑已含 Wave 8 键盘场景，但相关文档与测试计数仍有漂移
- 本轨新增目标：
  - `async-command-palette` fixture
  - recorded replay baseline `12 -> 13`
  - real-pages baseline `20 -> 21`
  - docs / matrix test 与真实数量同步

## 5. 风险与补救

- **风险 1：扩展侧负样本收紧不够**
  - 补救：在 contract test 里同时覆盖 `aria-autocomplete="none"` 和“仅有 `aria-controls`”的输入框。

- **风险 2：runtime 等待逻辑过宽**
  - 补救：把触发条件限制在 suggest / combobox，并使用短超时 + best-effort。

- **风险 3：fixture 只模拟同步状态**
  - 补救：新增 debounce、loading、异步候选挂载、`aria-activedescendant` 更新四段式状态变化。

- **风险 4：矩阵数字继续漂移**
  - 补救：同一轨道内同时修改：
    - `examples/recorded-replay-smoke.ts`
    - `packages/runtime/src/recorded-replay-matrix.test.ts`
    - `examples/real-page-smoke.ts`
    - `packages/runtime/src/real-page-matrix.test.ts`
    - 文档

## 6. 统一验收命令

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts real-page-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

## 7. 完成定义

满足以下条件才允许回收 Wave 9 资源：

1. 三条轨道都已提交并并回协调分支。
2. Node 20 统一验收通过。
3. `.codex/operations-log.md` 与 `.codex/verification-report.md` 已补 Wave 9 留痕。
4. `git worktree list` 不再保留 Wave 9 临时 worktree。
