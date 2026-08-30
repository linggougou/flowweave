# vNext-2A Runtime 输入会话规划上下文摘要

日期：2026-08-30

## 当前基线

- `main` / `origin/main`：`655caee`
- vNext-1 已完成：本地 Node20/24、独立 R5 Judge、集成分支 CI、main CI 全部通过。
- v2 当前能力：可解析、预览、导入导出、保存、恢复；不可运行、不可编辑、不可在运行中收集输入。

## 已冻结真源

- `PROJECT_ROUTE_LOCK.md`
- `docs/exec-plans/completed/vnext-0-design-gate.md`
- `docs/exec-plans/completed/vnext-1-data-foundation.md`
- `docs/design-docs/vnext-runtime-input-session.md`
- `docs/design-docs/vnext-implementation-dag.md`

## 规划边界

- 只做 `vNext-2A Runtime 输入会话内核` 的计划冻结。
- 不进入 Electron bridge、Studio waitingForInput UI、模板编辑器、P3/P4。
- 继续保护 v1 默认运行路径；v2 capability 默认关闭，直到后续阶段完整验收。

## 已知关键约束

1. Runtime session 必须复用同一个 BrowserContext/Page，并能在 input 节点暂停后从下一步继续。
2. 会话状态固定为 `idle / running / waitingForInput / cancelling / completed / failed / cancelled`。
3. 15 分钟输入 deadline、10 秒取消 drain、单终态 compare-and-set 为硬门。
4. 敏感 Flow 在接受敏感输入前后都必须满足 artifact 和 canary 红线。
5. 2A 只能规划 Runtime 内核；Electron bridge 与 Studio UI 要在后续阶段独立实施。
