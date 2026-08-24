# 结论

**REVISE（78/100）**。基于基线 `736402edc6145e159bf1394a443f14c462b130db` 对候选提交 `305e008856782ee23984c0c92b4551648367b392` 的独立 L3 复核结果是：设计主线已基本冻结完成，但还存在 2 个 P1 和 2 个 P2，当前不能作为 vNext-0 最终 PASS 归档。

# 为什么

- 范围门禁通过：`736402ed..305e008` 只改了设计文档、ADR、路线锁、计划和 `.codex` 留痕，没有实现层 diff。
- v1 兼容、显式 `expectedRevision + reportFingerprint` 升级、旧 Runtime 副作用前拒绝、原子保存/恢复/回滚、敏感值 fail-closed、DAG 最小交付/红灯测试/退出门禁/回滚点，这些核心边界大体都写清了。
- 但还有四个不能忽略的问题：
  1. `docs/design-docs/vnext-runtime-input-session.md:124-129,487-487` 把 `ExecutionSessionSnapshot` 当成 reload/snapshot 真源反复使用，却没有定义它的结构。后续 main/preload/renderer 会被迫各自发明字段，直接削弱“snapshot 始终是真源”的设计承诺。
  2. `docs/superpowers/specs/2026-06-10-backoffice-interactive-task-template-design.md:119` 与 `docs/design-docs/vnext-studio-linear-template-editor.md:133` 都写“记住上次输入”默认关闭，但 `docs/design-docs/vnext-flow-schema-migration.md:374` 又把所有非敏感 v1 变量迁成 `remember=lastValue`。这会让升级路径的持久化语义和产品合同打架。
  3. `docs/domain/flow-dsl.md:32-43` 的当前 v1 真源遗漏 `scroll`，而真实实现已经在 `packages/flow-dsl/src/schema.ts:58-96`、`packages/recorder/src/normalize.ts:421-445`、`packages/runtime/src/playwright-runner.ts:1946-1990` 支持它。当前基线文档不准，会误导迁移和回归判断。
  4. 显式静态格式门禁未过：`pnpm dlx prettier --check` 失败于 `docs/design-docs/vnext-runtime-input-session.md`、`.codex/operations-log.md`、`.codex/verification-report.md`。

# 必须修改

1. 在 Runtime 会话设计中补齐 `ExecutionSessionSnapshot` 的固定结构定义，并明确 waiting/running/terminal 快照各自允许携带的字段。
2. 统一 `remember` 的默认策略。若升级后确实要保留 `lastValue`，必须把这个升级例外在产品规格、Studio UX 和迁移规格里明确写成用户清楚确认的行为；否则改成默认 `never`。
3. 修正 `docs/domain/flow-dsl.md` 的当前 v1 步骤真源，把 `scroll` 纳入已实现支持面。
4. 修复 `Prettier --check` 失败文件，恢复显式静态格式门禁。

# 证据

- reviewed SHA：`305e008856782ee23984c0c92b4551648367b392`
- worktree 起始 HEAD：`326516688d1df18623685456f8f339bd267923a6`（含旧审查包；本次未将其作为证据）
- 范围核验：`git diff --name-only 736402edc6145e159bf1394a443f14c462b130db 305e008856782ee23984c0c92b4551648367b392`
- diff-check：`git diff --check 736402edc6145e159bf1394a443f14c462b130db 305e008856782ee23984c0c92b4551648367b392` 通过
- Prettier：`pnpm dlx prettier --check ...` 失败，命中 `docs/design-docs/vnext-runtime-input-session.md`、`.codex/operations-log.md`、`.codex/verification-report.md`
- 内部链接：13 个目标文件相对链接自检 `OK`
- TODO/TBD/冲突标记：未发现未解决命中
