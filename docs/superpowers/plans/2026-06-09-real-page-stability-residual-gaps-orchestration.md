# 真实页面稳定性残余缺口并行编排板

## 1. 当前状态

- 协调分支：`codex/real-page-stability-program`
- Node 基线：`v20.19.6`
- 路线真源：`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`
- 旧 Wave 13 计划状态：`superseded`
- 当前目标：只收口仍影响真实使用体验与后续并行开发的残余缺口

## 2. 轨道表

| 轨道 | 分支 | Worktree | 写入边界 | 状态 | 依赖 |
|------|------|----------|----------|------|------|
| Coordination Correction | `codex/real-page-stability-program` | 主工作区 | `.codex/*`、`docs/superpowers/plans/*` | `in_progress` | 无 |
| Electron Bundle Integrity | `codex/real-page-residual-electron-bundle` | `.worktrees/codex-real-page-residual-electron-bundle` | `apps/studio/scripts/*`、必要时 `apps/studio/package.json`、`.codex/*` | `pending` | Coordination |
| Studio Ambiguity Detail Insight | `codex/real-page-residual-studio-ambiguity-detail` | `.worktrees/codex-real-page-residual-studio-ambiguity-detail` | `apps/studio/src/DiagnosticInspector.tsx`、`apps/studio/src/shared/*`、相关测试 | `pending` | Coordination |
| Studio Layout Contract | `codex/real-page-residual-studio-layout-contract` | `.worktrees/codex-real-page-residual-studio-layout-contract` | `apps/studio/src/*test*`、必要时 `apps/studio/src/App.tsx` | `pending` | Coordination |
| Recorded Replay Guide Sync | `codex/real-page-residual-recorded-replay-guide` | `.worktrees/codex-real-page-residual-recorded-replay-guide` | `docs/guides/recorded-replay-matrix.md`、必要时 `docs/guides/fixture-matrix.md` | `pending` | Coordination |

## 3. 派发顺序

### 第一批立即并行

1. `Electron Bundle Integrity`
2. `Studio Ambiguity Detail Insight`
3. `Studio Layout Contract`

原因：

- 三条轨道写入边界相互独立
- 都直接服务当前用户体验与桌面端稳定性
- 不依赖对方先落地才能开始

### 第二批后置并行

1. `Recorded Replay Guide Sync`

原因：

- 文档口径需要以主线代码和 case catalog 为唯一真相
- 它对主功能不阻塞，但适合作为并行回收期间的低风险补齐轨道

## 4. 每轨最低验收口径

### Electron Bundle Integrity

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm exec electron .
codesign --verify --deep --strict node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/Electron.app
```

### Studio Ambiguity Detail Insight

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/failure-insights.test.ts src/shared/repair-suggestions.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

### Studio Layout Contract

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build
```

### Recorded Replay Guide Sync

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
```

## 5. 回收顺序

1. `Studio Ambiguity Detail Insight`
2. `Studio Layout Contract`
3. `Electron Bundle Integrity`
4. `Recorded Replay Guide Sync`

说明：

- `Studio` 两条轨道最贴近用户当前可见问题，优先验收与回收。
- `Electron Bundle Integrity` 可能需要更多本机证据，不适合作为其他轨道的阻塞前置。
- 文档轨道最后回收，以主线最终代码状态为准。

## 6. 阻塞记录规则

- 同一阻塞条件连续三次继续都无法推进时，才在 `.codex/operations-log.md` 标注为阻塞。
- 在此之前只记录：
  - 当前观察
  - 替代流程
  - 已完成验证

## 7. 统一主线复验

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
```
