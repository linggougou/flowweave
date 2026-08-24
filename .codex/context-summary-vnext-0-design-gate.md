# vNext-0 设计门禁上下文摘要

## 任务与授权

- 用户于 2026-08-24 明确要求“解冻 vNext 设计阶段”。
- 本授权只覆盖产品、UX、DSL 迁移、Runtime/Electron 会话、安全模型、ADR、验收合同与实施 DAG。
- 不覆盖业务代码、数据库迁移、P3、P4、云协作或通用编排器。

## 稳定基线

- 起点：`main` / `origin/main` 提交 `736402edc6145e159bf1394a443f14c462b130db`，工作区 clean。
- P2.8 已完成并归档；Node 20/24、本地 Electron、recorded replay、可移植性、安全审计及远端矩阵已有通过证据。
- 用户 stash 保持不动：`stash@{0}` 与 `stash@{1}`。

## 已确认方向

- 面向后台管理类网站的交互式任务模板。
- 第一版为 Studio Desktop、单人、线性流程。
- 使用显式输入节点和原始录制步骤上的有限行内绑定。
- 搜索词绑定与后续选择动作依赖分开表达。
- 不做条件、循环、批量、协作、自动抽变量或 AI。

## 真实实现缺口

1. DSL 只有 v1 变量与浏览器步骤，没有输入节点和迁移器。
2. Studio 只有运行前变量输入，没有线性模板编辑与运行中输入 UI。
3. Runtime 为单 Promise 顺序执行，没有 `waitingForInput` 会话状态。
4. Electron 以 invoke request/response 为主，缺少受控命令/事件会话桥。
5. 执行上下文当前会原样持久化 variables，不能直接承载敏感输入。

## 设计硬门

- 变量与输入字段不得出现双重真源。
- 旧 Flow 兼容、迁移、导入导出、快照恢复与旧 Runtime 拒绝必须成矩阵。
- 会话提交必须绑定 session/request/node 并具备幂等、迟到拒绝和取消语义。
- 敏感值默认不落 Flow、日志、错误、普通历史或最近值。
- 本阶段 Git diff 不得包含业务实现。

## 工具替代

- 当前会话未提供可调用 CodeGraph 工具。原用途：结构调用关系与影响分析。
- 替代：使用 `rg`、源码定向阅读、类型与测试文件交叉映射；结果必须写入各设计的“现状映射”。

## 已集成设计产物

- 产品规格：`docs/superpowers/specs/2026-06-10-backoffice-interactive-task-template-design.md`
- Studio UX：`docs/design-docs/vnext-studio-linear-template-editor.md`
- DSL / 迁移 / 存储：`docs/design-docs/vnext-flow-schema-migration.md`
- Runtime / Electron / 安全：`docs/design-docs/vnext-runtime-input-session.md`
- 实施拆分：`docs/design-docs/vnext-implementation-dag.md`
- ADR：`docs/adr/0009-vnext-input-node-and-schema-versioning.md`、`docs/adr/0010-vnext-runtime-input-session.md`

上述内容均为设计冻结候选，不代表代码已实现。下一门禁是独立 L3 Judge；只有 PASS 且 required fixes 为空才允许归档 vNext-0。
