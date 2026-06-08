# 真实页面稳定性残余缺口收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于当前已完成的真实页面歧义消解主链，只收口仍影响真实使用体验与后续并行开发的 4 个残余缺口，避免重复开发已经在主线存在的能力。

**Architecture:** 本轮采用“协调纠偏 + 4 条低耦合轨道并行 + Node 20 统一验收”的结构。协调分支先把旧 Wave 13 计划标记为过时并建立新的残余缺口编排板，再分别处理 Electron bundle 完整性、Studio 候选细节展示、Studio 布局回归 contract 与 recorded replay 指南同步，最后由主代理统一合并和复验。

**Tech Stack:** TypeScript strict、Vitest、React 19、Electron、Playwright、pnpm workspace、Turborepo、Node 20

---

## 先决事实

- `scopeText / scopeKind` 已完成，不再新开 Recorder 轨道。
- runtime 候选打分与歧义失败已完成，不再新开 Runtime 算法轨道。
- recorded replay case catalog 当前真实总数为 `25`，其中 `23` 个 fixture + `2` 个 runtime-generated。
- 本轮只允许处理残余收口，不得借机进入冻结区或横向扩张功能。

## Task 1: Coordination Correction

**Files:**
- Modify: `.codex/operations-log.md`
- Create: `.codex/context-summary-real-page-residual-gaps.md`
- Modify: `docs/superpowers/plans/2026-06-09-real-page-stability-wave13-target-disambiguation-plan.md`
- Modify: `docs/superpowers/plans/2026-06-09-real-page-stability-wave13-target-disambiguation-orchestration.md`
- Create: `docs/superpowers/plans/2026-06-09-real-page-stability-residual-gaps-plan.md`
- Create: `docs/superpowers/plans/2026-06-09-real-page-stability-residual-gaps-orchestration.md`

- [ ] 记录“Wave 13 主体已完成、旧计划过时”的纠偏结论
- [ ] 在旧 Wave 13 计划与编排板顶部补充“已过时，以 residual gaps 计划为准”
- [ ] 落盘新的残余缺口计划与编排板
- [ ] 清理旧的空 worktree，再按新编排重建 worktree

## Task 2: Electron Bundle Integrity

**Files:**
- Modify: `apps/studio/scripts/ensure-electron-dist.mjs`
- Optional Modify: `apps/studio/package.json`
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] 先确认当前 `ensure-electron-dist.mjs` 只覆盖“framework symlink 缺失”场景，明确签名残余问题是否属于脚本可修复范围
- [ ] 若能在不破坏现有启动链的前提下自动修复 bundle 完整性，则补最小实现与回归说明
- [ ] 若签名问题本质上来自上游缓存包或本机 bundle 状态，不强行做伪修复；要把它收束为脚本内明确检测与告警
- [ ] 使用 Node 20 验证：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm exec electron .
codesign --verify --deep --strict node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/Electron.app
```

- [ ] 只有在“能真实说明 residual risk 是已消除还是已明确受控”后才允许回收轨道

## Task 3: Studio Ambiguity Detail Insight

**Files:**
- Modify: `apps/studio/src/shared/studio-api-types.ts`
- Modify: `apps/studio/src/DiagnosticInspector.tsx`
- Modify: `apps/studio/src/shared/failure-insights.ts`
- Modify: `apps/studio/src/shared/repair-suggestions.ts`
- Modify: `apps/studio/src/DiagnosticInspector.test.tsx`
- Modify: `apps/studio/src/shared/failure-insights.test.ts`
- Modify: `apps/studio/src/shared/repair-suggestions.test.ts`

- [ ] 先补失败测试，锁定当前 Studio 还看不到 `selectedIndex / ambiguityReason / candidateSummaries`
- [ ] 将 runtime 已有字段完整映射到 Studio 共享类型
- [ ] 在 Inspector 中展示：
  - 当前选中的候选序号
  - 歧义原因
  - 候选摘要列表
  - 哪些线索帮助了收窄、哪些仍不足
- [ ] 保持历史执行兼容：缺少新字段时不得崩溃
- [ ] 使用 Node 20 验证：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/failure-insights.test.ts src/shared/repair-suggestions.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

## Task 4: Studio Layout Contract

**Files:**
- Modify: `apps/studio/src/App.tsx`
- Modify: `apps/studio/src/App.test.tsx` 或 `apps/studio/src/DiagnosticInspector.test.tsx`
- Optional Create: `apps/studio/src/shared/layout-contract.test.ts`
- Modify: `.codex/verification-report.md`

- [ ] 不重复改现有布局逻辑，先围绕“左侧可滚动、右侧无堆叠”设计自动化 contract
- [ ] 优先选择不依赖真实 Electron 窗口的 DOM / render 级验证
- [ ] 最低需要锁住：
  - 项目列表位于真实滚动容器内
  - 右侧两个主内容面板不再纵向压缩重叠
  - 修复后关键 class / 结构若回退，测试能红
- [ ] 使用 Node 20 验证：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build
```

## Task 5: Recorded Replay Guide Sync

**Files:**
- Modify: `docs/guides/recorded-replay-matrix.md`
- Optional Modify: `docs/guides/fixture-matrix.md`
- Verify Against: `examples/recorded-replay-smoke.ts`
- Verify Against: `packages/runtime/src/recorded-replay-matrix.test.ts`

- [ ] 将 recorded replay 指南从 `13` 条旧口径更新为当前真实口径
- [ ] 明确区分：
  - `23` 个真实 fixture
  - `2` 个 runtime-generated case
  - 总计 `25` 条 case
- [ ] 把 `scroll-runtime-contract` 与 `placeholder-disambiguation` 一并写入指南
- [ ] 若文档与 `fixture-matrix.md` 的名词或统计口径不一致，同步收口
- [ ] 使用 Node 20 验证：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
```

## 主线统一门槛

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
```

## 完成定义

- 旧 Wave 13 计划已被显式标记过时，不会再误导后续 agent。
- 4 条残余轨道都已建立独立 worktree，并有明确写入边界。
- 至少启动首批 3 条独立 subagent 轨道：
  - Electron Bundle Integrity
  - Studio Ambiguity Detail Insight
  - Studio Layout Contract
- 每条回收前都要经过主代理 Node 20 复验。
