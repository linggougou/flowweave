# vNext-2A Runtime 输入会话规划解冻单

日期：2026-08-30
状态：Approved

## 1. 背景

vNext-1 数据基础已完成本地总验收、独立 R5 Judge、集成分支 Node 20/24 CI，以及 `main` Node 20/24 CI。当前仓库已经具备：

1. 显式 v1/v2 parser 与 strict v2 schema。
2. v1 → v2 确定性升级预览与 fingerprint。
3. Knowledge revision/CAS、原子保存/恢复/升级与安全最近值。
4. Runtime、Studio、Local API、旧 recorder POST 对 v2 的副作用前拒绝。

按照 vNext-0 DAG，下一阶段应先进入 `vNext-2A Runtime 输入会话` 的计划冻结，而不是直接编码。

## 2. 本次只解冻什么

只解冻 `vNext-2A` 的规划工作，包含：

1. Runtime waitingForInput 会话内核的最小实现边界。
2. TDD / 故障注入 / canary / 双 Node 的验证矩阵。
3. worktree / subagent 的分轨拆分、回滚点和集成策略。
4. 对 Runtime、Studio、Electron、project-knowledge 的真实影响面映射。

## 3. 明确不解冻什么

以下内容继续冻结，不得在本次规划阶段进入编码：

1. Runtime 输入会话生产实现。
2. Electron 会话桥与 preload 新 IPC。
3. Studio 运行态输入 UI、waitingForInput dialog、编辑器改造。
4. vNext-2B、vNext-3A/3B、P3、P4 的任何业务代码。

## 4. 进入下一阶段的条件

只有在以下条件同时满足后，才允许把 `vNext-2A` 从规划切到实施：

1. `PROJECT_ROUTE_LOCK.md` 更新为 `vNext-2A S5 实施`。
2. `docs/exec-plans/active/vnext-2a-runtime-session-planning.md` 已冻结并通过本地静态核对。
3. 明确最小可验收闭环、红灯合同、回滚点、worktree 分工和独立 Judge 门禁。
4. 继续保持“v1 可运行路径不受影响、v2 capability 默认关闭直到 2A 完整验收”的边界。
