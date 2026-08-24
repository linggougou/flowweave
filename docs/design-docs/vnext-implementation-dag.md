# vNext 交互式任务模板实施 DAG（设计冻结候选）

> 状态：vNext-0 设计产物，尚未实现  
> 日期：2026-08-24  
> 目标：把已冻结合同拆成可独立测试、提交、回滚和会签的后续实施阶段

## 1. 规范接口字典

后续各阶段必须使用同一组物理名称，不得自行创造同义字段：

| 概念         | 规范合同                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Flow 版本    | `schemaVersion: 2`；v1/v2 版本分派，不静默升级                                                                              |
| 输入节点     | `steps[].type = "input"`；`inputNodeId = steps[].id`，文档不重复保存 inputNodeId                                            |
| 输入字段     | `input.fields[]` 是唯一真源；`fieldId + label + placeholder? + type + required + sensitive + remember + defaultValue?`      |
| 字段引用     | 白名单槽位中的完整 `{{fieldId}}`；不允许混合模板或递归任意对象插值                                                          |
| 搜索选择     | `selectionContext.searchStepId`；仅表达依赖和诊断，不改变线性顺序                                                           |
| 并发保存     | `expectedRevision` + 迁移 `reportFingerprint`；冲突拒绝覆盖                                                                 |
| 会话身份     | `executionId + sessionId + inputRequestId + inputNodeId + clientCommandId`                                                  |
| 会话状态     | `idle / running / waitingForInput / cancelling / completed / failed / cancelled`                                            |
| 输入事件     | `input-required`、`input-accepted`；后者只含 `resolvedFields[{fieldId, source}]`，不含值                                    |
| 非敏感初始值 | `initialValue? + initialValueSource?`，优先级 `lastValue → defaultValue → absent`                                           |
| 产物声明     | `artifactSafety{policyVersion, flowHasSensitiveFields, sensitiveValueAccepted, harCaptured, sensitiveAcceptedAtStepIndex?}` |
| 敏感默认     | 无 default、无 lastValue、只允许 `fill.value`、整次 HAR 关闭、首次接受后关闭后续截图/page/DOM                               |

规范文档：

- [产品规格](../superpowers/specs/2026-06-10-backoffice-interactive-task-template-design.md)
- [Studio 线性编辑器](./vnext-studio-linear-template-editor.md)
- [Flow Schema 与迁移](./vnext-flow-schema-migration.md)
- [Runtime 输入会话](./vnext-runtime-input-session.md)
- [ADR-0009](../adr/0009-vnext-input-node-and-schema-versioning.md)
- [ADR-0010](../adr/0010-vnext-runtime-input-session.md)

## 2. 依赖图

```text
vNext-1A Flow DSL v2 + 迁移器
       │
       ├───────────────┐
       ▼               ▼
vNext-1B Knowledge   vNext-2A Runtime session
原子保存/最近值          │
       │               ▼
       │          vNext-2B Electron bridge
       │               │
       └──────┬────────┘
              ▼
       vNext-3A Studio 模板编辑
              │
              ▼
       vNext-3B Studio 运行态输入
              │
              ▼
       vNext-4 纵向 E2E / 迁移回滚 / 发布门禁
```

1B 与 2A 可在 1A 后并行；2B 依赖 2A；3A 依赖 1A+1B；3B 依赖 1B+2B+3A；vNext-4 依赖全部前置阶段。

## 3. vNext-1A：Flow DSL v2 与迁移器

### 最小交付

- v1/v2 discriminated parser 与明确版本错误。
- v2 strict schema、跨步骤 field/reference/selection 校验。
- 白名单整值 binding compiler；v1 继续使用 legacy 路径。
- v1→v2 只读预览、确定性 ID/映射、阻塞项和 fingerprint。

### 红灯合同

- 老 parser 接受 input 节点或 strip 未知字段。
- 重复 fieldId、未来引用、混合模板、非法槽位、类型错配或敏感越界未被拒绝。
- 同一 v1 输入重复预览产生不同候选/fingerprint。
- 迁移改写 flowId/projectId/既有 browser stepId。

### 退出门禁

- flow-dsl 单元与迁移 fixture 全绿；v1 schema/portability/recorder 回归全绿。
- 无数据库、Electron、Studio UI 改动。

### 回滚点

- feature flag 保持关闭；删除 v2 exports 即回到纯 v1，现有资产不迁移。

## 4. vNext-1B：Knowledge 原子保存与安全执行上下文

### 最小交付

- Flow `revision`、`expectedRevision` 原子保存/恢复/升级。
- 升级事务同时完成安全 v1 快照、v2 写入、敏感历史清理和最近值清理。
- `flow_field_recent_values` 只保存 `sensitive:false && remember:lastValue` 的单字段最近值。
- v2 execution context 只存 field/source 无值元数据，并交叉校验 `artifactSafety`。

### 红灯合同

- 并发 expectedRevision 可以静默覆盖。
- 任一 SQL 故障留下半个版本、半次清理或 revision 漂移。
- sensitive/remember:never 值进入 SQLite、WAL、版本、普通历史或最近值。
- artifactSafety 与 Flow/step refs 矛盾仍可落盘。

### 退出门禁

- 事务故障注入、导入导出往返、恢复与并发测试全绿。
- canary 扫描 SQLite/WAL/SHM、导出和 execution API 零命中。

### 回滚点

- v2 feature flag 未开时只读取新增表/列，不迁移现有 Flow；schema migration 必须可重复执行且不删除 v1 数据。

## 5. vNext-2A：Runtime 输入会话内核

### 最小交付

- Runtime session 持有同一个 BrowserContext/Page、游标、Abort 与一次待处理 input request。
- input 节点暂停；合法提交后只从下一步骤继续。
- 15 分钟 input deadline、10 秒取消 drain、单终态 compare-and-set。
- 敏感 artifact policy、`artifactSafety` 与安全错误分类。

### 红灯合同

- 等待期间下一步提前执行、提交后重跑旧步骤或重建页面。
- 重复/迟到/错 node/field 提交产生第二次副作用。
- cancel/timeout/browser close 竞态产生两个终态或遗留资源。
- sensitive Flow 生成 HAR，或敏感接受后生成 screenshot/page/DOM ref。

### 退出门禁

- fake clock、并发、浏览器崩溃与资源故障注入全绿。
- canary 不出现在 Runtime result、日志、错误、diagnostic 或 artifact。

### 回滚点

- v1 `executeFlow` 路径继续存在；v2 capability 关闭时在副作用前拒绝，不降级执行。

## 6. vNext-2B：Electron 会话桥

### 最小交付

- 固定 start/submit/cancel/snapshot/event preload API，start 立即 ACK。
- 主进程单活跃 registry、sequence、安全 snapshot 与 clientCommandId 幂等缓存。
- owner window/webContents/main frame/精确 URL 校验。
- renderer reload 重连、process gone/window close/app quit/main crash sentinel 清理。

### 红灯合同

- 子 frame、错误 origin、第二窗口或旧 webContents 能控制会话。
- 动态 channel、原始 ipcRenderer、Browser/Page、路径或恢复 token 穿过 preload。
- 并发 start 启动两套浏览器；重复提交缓存正文或值摘要。
- renderer/app/main 故障留下敏感持久化或 Chromium 孤儿。

### 退出门禁

- Electron 安全边界、幂等、reload、quit 和 crash 故障注入全绿。
- Local API/Web/扩展不存在输入会话控制面。

### 回滚点

- capability flag 关闭新 IPC；v1 invoke 路径保持不变。

## 7. vNext-3A：Studio 线性模板编辑

### 最小交付

- v1 升级预览；v2 三栏线性步骤编辑。
- 插入/移动/删除 input 节点与字段；有限行内 binding。
- 来源/消费者、selectionContext、校验、预览、撤销/重做和脏状态。
- expectedRevision 原子保存、冲突保留草稿、保存并运行。

### 红灯合同

- 可编辑录制步骤顺序、输入任意表达式或绑定禁止槽位。
- 删除来源后保留孤儿 binding；移动 input 越过消费者仍可保存。
- 保存冲突覆盖远端版本；运行未保存草稿。
- 敏感字段可配置 default/lastValue 或非 fill 消费。

### 退出门禁

- reducer/组件/键盘/可访问性与 375px 布局合同全绿。
- 只实现编辑，不伪造 Runtime 已支持；v2 run capability 缺失时明确拒绝。

### 回滚点

- 隐藏“编辑模板”入口；已保存 v2 仍可只读导出，不交给 v1 Runtime。

## 8. vNext-3B：Studio 运行态输入

### 最小交付

- input-required → waitingForInput dialog、倒计时、提交/取消/错误反馈。
- `initialValue/initialValueSource` 只用于获准非敏感预填；敏感始终为空。
- ACK 后清空全部值，只用 resolvedFields 展示无值状态。
- sequence reducer、snapshot reload、焦点管理与 Esc/窗口关闭取消确认。

### 红灯合同

- 旧 session/迟到事件覆盖当前 UI；重复点击提交两次。
- ACK 后值仍在 DOM、React store、事件、toast 或 aria-live。
- reload 恢复编辑草稿或敏感值；取消后仍能提交。
- timeout 显示为 cancelled 或提供断点继续。

### 退出门禁

- Studio 交互、竞态、可访问性和敏感值 DOM/状态扫描全绿。
- 真实 Electron 在开头与中途 input 节点均能继续同一页面。

### 回滚点

- 关闭 v2 run capability；编辑/导出仍可用，但运行明确拒绝。

## 9. vNext-4：纵向 E2E、迁移回滚与发布门禁

### 最小交付

- v1 保持原运行；v1 显式升级、v2 编辑、保存、运行、输入、继续、历史与回滚完整闭环。
- 表单、筛选、搜索后选择三类 fixture；开头输入与中途输入。
- Node 20/24、recorded replay、portability、Electron、安装包与安全审计。

### 发布硬门

- 唯一 canary 扫描 SQLite/WAL/SHM、run directory、HAR/PNG/JSON、日志、错误、API、最近值、版本和导出零命中。
- 主进程 crash、renderer crash、窗口关闭、app quit 无 Chromium 孤儿或可恢复敏感会话。
- v1 全量回归、v2 migration fixture 与跨版本拒绝矩阵全绿。
- 独立 L3 Judge PASS，无 P0/P1，required fixes 为空。

### 回滚点

- 发布前保持 v2 capability 默认关闭；任一硬门失败只关闭 v2，不修改或自动降级已保存资产。

## 10. 路线约束

- 本 DAG 是设计阶段交付，不授权任何实现。
- 每一阶段开始前必须更新 `PROJECT_ROUTE_LOCK.md`，只开放该阶段最小影响单元。
- 任何条件、循环、子流程、批量、协作、AI、通用编排画布、任意 selector/表达式参数化都进入独立变更分流。
- 任何阶段失败都必须保留 v1 可运行路径，不得以删除旧门禁换取 v2 通过。
