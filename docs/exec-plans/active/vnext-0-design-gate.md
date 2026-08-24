# vNext-0 交互式任务模板设计门禁计划

## 1. 目标与阶段边界

本计划只冻结后续实现所需的产品、UX、数据、执行会话与安全合同，不修改业务代码。

最小闭环：录制所得线性 Flow → Studio 插入输入节点并绑定后续字段 → Runtime 执行到节点等待输入 → Studio 安全提交 → 从下一节点继续 → 取消/失败可诊断且敏感值不落普通历史。

明确不做：条件、循环、子流程、批量、协作、模板市场、AI、通用编排画布、任意表达式、任意 CSS/XPath 参数化、关闭 Studio 后恢复长会话。

## 2. 开发前事实基线

1. `FlowDocument` 当前为 schema v1，变量只有 `name/type/required/defaultValue`，步骤是线性浏览器动作与等待。
2. Runtime 当前以单次 Promise 和顺序 for-loop 执行，已有进度与取消，但没有等待输入会话。
3. Electron 当前以 invoke 式 request/response 为主；Studio 已有运行前变量草稿、类型解析和最近执行回填。
4. project-knowledge 当前会原样持久化执行变量；vNext 敏感字段必须改变默认策略。
5. Studio 当前能查看步骤、运行、重命名、版本恢复与差异，但没有模板编辑器。

## 3. 并行设计轨

状态：G1-G3 已完成并集成；独立终审首轮四项 required fixes 已闭合；R2 的 fieldId P2 已统一，等待具备本地依赖的 R3 最终复审。

### G1 产品与 UX

所有者只修改：

- `docs/superpowers/specs/2026-06-10-backoffice-interactive-task-template-design.md`
- `docs/design-docs/vnext-studio-linear-template-editor.md`

必须冻结：目标用户、术语、作者/执行者旅程、输入节点、变量来源/消费、允许绑定面、搜索后选择、保存/脏状态/撤销、运行态等待输入反馈、可访问性、错误与取消反馈、明确非目标。

### G2 DSL、迁移与存储

所有者只修改：

- `docs/design-docs/vnext-flow-schema-migration.md`
- `docs/adr/0009-vnext-input-node-and-schema-versioning.md`

必须冻结：规范 schema 草案、变量唯一归属、ID/命名规则、兼容矩阵、v1→vNext 迁移、导入导出、版本快照、旧 Runtime 拒绝、回滚与原子保存、敏感元数据但不含敏感值。

### G3 Runtime、Electron 与安全

所有者只修改：

- `docs/design-docs/vnext-runtime-input-session.md`
- `docs/adr/0010-vnext-runtime-input-session.md`

必须冻结：状态机、事件/命令、会话与输入请求身份、事件顺序、继续幂等、超时/迟到响应、取消、崩溃/退出清理、浏览器资源归属、敏感值从 renderer 到 runtime 的全生命周期、日志与历史脱敏。

## 4. 集成轨

主代理负责：

1. 在 G1-G3 之前冻结路线锁、变更单、任务上下文和本计划。
2. 每轨使用独立 Git worktree 与独立提交；不允许跨轨修改。
3. 逐项检查三份设计的名词、字段、状态、错误码、兼容矩阵和安全默认值。
4. 更新 ADR 索引、Flow DSL 文档中的“未来版本设计状态”说明，并生成后续实施 DAG。
5. 运行链接、格式、冲突标记、范围与 Git diff 静态检查。

## 5. 后续实施 DAG（本阶段需冻结，不执行）

```text
vNext-1A DSL v2 + 迁移器 + 兼容读取
             │
             ├──> vNext-1B knowledge 原子保存与安全执行上下文
             │
             └──> vNext-2A Runtime 输入会话内核
                           │
                           └──> vNext-2B Electron IPC/event 桥
                                         │
vNext-1A ──> vNext-3A Studio 线性模板编辑 ├──> vNext-3B 运行态输入与恢复
                                         │
                                         └──> vNext-4 纵向 E2E、迁移/回滚与发布门禁
```

设计阶段必须为每一节点定义红灯测试、最小交付、回滚点和退出门禁。冻结结果见 [`docs/design-docs/vnext-implementation-dag.md`](../../design-docs/vnext-implementation-dag.md)。

## 6. 验收合同

### 文档一致性

- 一个概念只有一个规范名称与字段定义。
- 产品、DSL、Runtime、Electron、Studio 和存储映射完整，无孤儿字段或隐式状态。
- 所有链接有效，ADR 索引同步，文档无冲突标记或“待定”的关键决策。

### 安全

- 敏感值不进入 Flow 定义、默认值、普通运行历史、步骤日志、错误、遥测或最近值。
- 输入请求严格绑定当前 session/request/node；重复、过期、跨窗口和取消后的提交均拒绝。
- renderer 不获得浏览器控制对象、任意通道或长期秘密存储能力。

### 兼容与恢复

- v1 Flow 的读取、编辑升级、导出、旧版本拒绝与回滚行为明确。
- 等待输入、继续、取消、失败、窗口关闭、应用退出与进程崩溃均有终态和资源清理语义。
- 设计不承诺关闭 Studio 后从输入节点恢复。

### 范围

- Git diff 不包含 `apps/`、`packages/`、migration 或构建配置实现改动。
- P3/P4、通用编排器与协作能力保持冻结。

## 7. 独立审查

采用 L3：Generator（G1-G3）→ 主代理 Verifier → Strict Judge → Anti-Slop → Chief Reviewer。

审查产物：

- `.codex/reviews/vnext-0/design-gate/scorecard.json`
- `.codex/reviews/vnext-0/design-gate/verdict.md`
- `.codex/reviews/vnext-0/design-gate-final/scorecard.json`（有效首轮独立终审，`REVISE`）
- `.codex/reviews/vnext-0/design-gate-final-r2/scorecard.json`（R2，`REVISE`）
- 最终复审使用新的 `design-gate-final-r3/` 目录，保留前轮证据不覆盖。

PASS 条件：总分达到门槛、无 P0/P1、required fixes 为空、所有设计门禁有可定位证据。

## 8. 完成与回收

1. Judge 为 REVISE 时回到对应原设计轨修订并复审。
2. PASS 后更新路线锁、post-v1 roadmap、operations log 与 verification report。
3. 将本计划迁移到 `docs/exec-plans/completed/`。
4. 确认各 worktree clean 且提交已集成后回收 Agent/worktree。
5. 停止在设计阶段；进入 vNext 实施前重新更新路线锁。
