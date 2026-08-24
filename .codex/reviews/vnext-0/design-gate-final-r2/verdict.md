# 结论

**REVISE（93/100）**。基于基线 `736402edc6145e159bf1394a443f14c462b130db` 对候选 `ac38032dca3064870bb1c8f93960363579fbc02c` 的 fresh L3 复核结果是：上一轮四项 required fixes 中有三项已实质闭合，但当前仍有 2 个 P2，不能作为 vNext-0 最终 PASS 归档。

# 为什么

- 范围门禁通过：`736402ed..ac38032` 只改了设计文档、ADR、计划与 `.codex` 留痕，没有任何 `apps/` 或 `packages/` 实现层 diff。
- 旧问题里最关键的三项已经补齐：
  - `ExecutionSessionSnapshot` 现已在 [vnext-runtime-input-session.md](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/design-docs/vnext-runtime-input-session.md:282) 给出 strict DTO 合同，覆盖 `idle / running / waitingForInput / cancelling / terminal`、sequence、禁止字段、reload 安全恢复与终态不可恢复。
  - remember 默认策略现已在产品、Studio UX 和迁移设计中统一为“新建字段与 v1→v2 升级候选默认 `remember: never`，只有非敏感字段可显式 opt-in `lastValue`，且不从 v1 历史播种最近值”。
  - [docs/domain/flow-dsl.md](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/domain/flow-dsl.md:42) 已把 `scroll` 纳入 v1 当前真实支持面，并和 schema/recorder/runtime 对齐，同时继续明确 `FLOW_SCHEMA_VERSION = 1`。
- 仍有两个不能忽略的问题：
  - [vnext-studio-linear-template-editor.md](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/design-docs/vnext-studio-linear-template-editor.md:153) 写 `fieldId` “项目内唯一”，而 [vnext-flow-schema-migration.md](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/design-docs/vnext-flow-schema-migration.md:260) 与其最近值表设计 [同文件](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/design-docs/vnext-flow-schema-migration.md:478) 又以 “Flow 内全局唯一” 和 `(flow_id, field_id)` 为真源。这会把唯一性校验、最近值键模型和测试实现导向两套不同口径。
  - 本轮按要求执行 `pnpm exec prettier --check` 时，当前 worktree 缺少 `node_modules/.bin/prettier`，因此上一轮的 Prettier required fix 不能在这次独立复核里 fresh verify。`package.json` 仍声明了 prettier，这更像是当前验证环境前置缺失，而不是候选把 prettier 依赖删掉；但按 Judge 规则，缺失证据不能靠猜测补 PASS。

# 必须修改

1. 统一 `fieldId` 的唯一性真源：明确到底是“Flow 内全局唯一”还是“项目内唯一”，并同步修正 Studio 设计、迁移/存储设计以及最近值键模型描述。
2. 在具备仓库本地依赖的验证环境中重新执行 `pnpm exec prettier --check` 覆盖本次评审范围文件，并把通过结果作为重新送审证据；在该证据补齐前，本轮不能把上一轮的 Prettier required fix 视为已闭合。

# 证据

- reviewed SHA：`ac38032dca3064870bb1c8f93960363579fbc02c`
- P0/P1/P2：`0 / 0 / 2`
- 命令结果：
  - `git status --short`：无输出，写审查包前 worktree clean
  - `git diff --check 736402ed..ac38032`：无输出
  - `git diff --name-only 736402ed..ac38032 | rg '^(apps|packages)/'`：无输出
  - `pnpm exec prettier --check ...`：`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`，`Command "prettier" not found`
  - 14 文件内部链接检查：`checkedFiles=14, filesWithLinks=10, totalLinks=46, broken=[]`
  - `TODO/TBD/FIXME/冲突标记`：无输出
- 上一轮四项 required fixes 回归表：

| 项目 | 结论 | 证据 |
| --- | --- | --- |
| `ExecutionSessionSnapshot` 固定合同 | Closed | [runtime session 设计](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/design-docs/vnext-runtime-input-session.md:282) |
| remember 默认冲突 | Closed | [产品规格](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/superpowers/specs/2026-06-10-backoffice-interactive-task-template-design.md:119), [Studio 设计](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/design-docs/vnext-studio-linear-template-editor.md:151), [迁移设计](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/design-docs/vnext-flow-schema-migration.md:359) |
| v1 `scroll` 真源 | Closed | [flow-dsl 真源](/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext0-design-judge-r2/docs/domain/flow-dsl.md:42) |
| 本地 Prettier 门禁 | Not verified | `pnpm exec prettier --check` 在当前 worktree 因缺少本地依赖阻塞 |
