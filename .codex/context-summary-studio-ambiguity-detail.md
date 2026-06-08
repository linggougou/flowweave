# Studio Ambiguity Detail Insight 上下文摘要

## 任务边界

- Worktree: `/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-residual-studio-ambiguity-detail`
- 分支: `codex/real-page-residual-studio-ambiguity-detail`
- 路线真源: `docs/superpowers/plans/2026-05-26-run-first-roadmap.md`
- 轨道目标: 只消费 runtime 已有的 `selectedIndex`、`ambiguityReason`、`candidateSummaries`，补齐 Studio 的类型、诊断展示和中文解释，不重做 runtime 算法。
- 写入边界:
  - `apps/studio/src/shared/studio-api-types.ts`
  - `apps/studio/src/DiagnosticInspector.tsx`
  - `apps/studio/src/shared/failure-insights.ts`
  - `apps/studio/src/shared/repair-suggestions.ts`
  - `apps/studio/src/DiagnosticInspector.test.tsx`
  - `apps/studio/src/shared/failure-insights.test.ts`
  - `apps/studio/src/shared/repair-suggestions.test.ts`
  - `.codex/context-summary-studio-ambiguity-detail.md`

## 任务前确认

- 项目根无物理 `PROJECT_ROUTE_LOCK.md`，按项目 `AGENTS.md` 约定使用 `docs/superpowers/plans/2026-05-26-run-first-roadmap.md` 作为等效路线锁。
- 现有 runtime 已在 `packages/runtime/src/types.ts` 暴露:
  - `StrategyAttempt.selectedIndex`
  - `StrategyAttempt.ambiguityReason`
  - `StrategyAttempt.candidateSummaries`
- 现有 Studio 只消费了基础 `strategyAttempts` 和 `targetHints`，尚未把候选并列细节讲完整。

## 实施方式

- 按 TDD 先补 3 组红测:
  - `DiagnosticInspector` 必须展示候选细节、选中候选序号、歧义原因、候选摘要列表，以及“帮助收窄 / 仍不足”说明。
  - `failure-insights` 必须把候选并列失败总结成更可执行的中文洞察。
  - `repair-suggestions` 必须把歧义原因和候选命中线索写进建议依据。
- 再做最小实现:
  - Studio 类型层新增 `StudioDiagnosticCandidateSummary`，并在 `StudioDiagnosticStrategyAttempt` 上补齐 3 个 runtime 字段映射。
  - `DiagnosticInspector` 新增候选细节区块，并在策略表中补充“选中候选 / 歧义原因”列。
  - `failure-insights` 和 `repair-suggestions` 基于候选摘要提炼“已命中的收窄线索”和“仍不足”的解释。
- 历史兼容策略:
  - 所有新增字段都按可选处理。
  - 没有 `candidateSummaries` / `ambiguityReason` / `selectedIndex` 时仍走原有回退文案，不允许崩溃。

## 验证

- 先跑红测，确认缺口确实存在。
- 定向测试:
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/failure-insights.test.ts src/shared/repair-suggestions.test.ts`
  - 结果: 通过，`36/36`
- 类型检查:
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
  - 结果: 通过

## 验证环境说明

- 该 worktree 起初没有可用依赖目录，测试与类型检查无法直接启动。
- 为了只在当前 worktree 做本地验证，临时创建了指向主工作区依赖目录的未跟踪 `node_modules` 符号链接。
- 这些依赖目录仅用于本地验证，不属于本轨道提交内容，提交前需保持未纳入版本控制。
