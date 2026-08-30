# vNext-2A Runtime 输入会话规划执行计划

状态：Active（S4 计划冻结）
日期：2026-08-30
基线：`655caee`（vNext-1 最终审查与 Node20 证据完成并通过 integration/main 双矩阵后）

## 1. 阶段目标

冻结 `waitingForInput` Runtime session 的最小实现方案、验证矩阵、worktree 分工与回滚点，为下一步实施做准备；本阶段不写生产代码。

## 2. 最小可验收闭环

```text
现状审计
  → Runtime / Studio / Electron / Knowledge 影响面映射
  → 最小实现 DAG 与测试先行矩阵
  → 安全/回滚/故障注入策略冻结
  → 路线锁与执行计划可作为 2A 实施唯一真源
```

任何规划输出都不得默认等同于已授权编码。

## 3. 固定边界

- 只规划 `vNext-2A Runtime 输入会话内核`，不实施 `2B Electron bridge`、`3A Studio 编辑`、`3B 运行态输入 UI`。
- v1 `executeFlow` 路径继续作为生产真源；2A 实施前不得把 v2 交给旧 Runtime。
- 继续使用既有 `FLOW_SCHEMA_VERSION=1` 默认路径，v2 capability 保持关闭。
- 规划阶段只允许修改 `PROJECT_ROUTE_LOCK.md`、`docs/` 与 `.codex/`。

## 4. 分轨

### G0：现状与调用链审计

1. 盘点 `runtime`、`studio`、`electron preload/main`、`project-knowledge` 与 `local-api` 的现状边界。
2. 确认哪些能力已可复用，哪些必须新增且不能提前落到 2B/3A/3B。
3. 输出最小影响文件列表和潜在回滚点。

退出门禁：影响面、现状证据和非目标完整落盘。

### G1：Runtime 会话与状态机计划

1. 冻结 `idle / running / waitingForInput / cancelling / completed / failed / cancelled` 运行态计划。
2. 冻结 `input-required`、`input-accepted`、取消、超时、终态 compare-and-set 的测试矩阵。
3. 明确 BrowserContext/Page 复用、步游标、deadline、drain、重复提交幂等与资源回收策略。

退出门禁：状态机、事件顺序、失败语义和红灯合同形成单一计划真源。

### G2：安全、验证与回滚计划

1. 冻结敏感值生命周期、HAR/screenshot/page/DOM artifact policy、diagnostic/error 红线。
2. 规划 fake clock、并发、browser close、abort、timeout 和 canary 扫描验证矩阵。
3. 明确 Node 20/24、本地 smoke、独立 Judge 与最终集成/主干 CI 所需证据。

退出门禁：安全硬门、验证命令、回滚点和独立 Judge 条件完整。

### G3：实施 DAG 与 worktree 拆分

1. 把 2A 细分为可独立提交的实现轨。
2. 预先定义 subagent/worktree 的文件边界、交付物与回收规则。
3. 规划集成顺序，避免把 2A 与 2B/3A 混成大改。

退出门禁：实施 DAG、review lane 与集成策略冻结。

## 5. 红灯合同

- 把 2A 规划写成“可以直接编码”而没有新的路线锁阶段切换。
- 把 Electron IPC、Studio UI 或 Knowledge 新持久化需求混入 2A 内核实现范围。
- 允许 v2 在 capability 关闭时降级到 v1 Runtime 执行。
- 没有定义取消、超时、迟到提交、重复终态和敏感 artifact 的验证矩阵。

## 6. 输出物

1. 更新后的 `PROJECT_ROUTE_LOCK.md`。
2. `docs/exec-plans/active/vnext-2a-runtime-session-planning.md`。
3. `docs/change-requests/2026-08-30-vnext-2a-planning-unfreeze.md`。
4. `.codex/context-summary-vnext-2a-runtime-session-planning.md`。

## 7. 阶段出口与后续

本计划完成只代表 `vNext-2A` 可以进入实施前冻结，不代表 2A 已获准编码。真正进入实现前，必须再次更新路线锁，把当前阶段切换为 `vNext-2A S5 实施`，并继续沿用独立 worktree、TDD、Node 20/24 与 Judge 会签流程。
