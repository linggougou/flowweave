# vNext-1A/1B 数据基础执行计划

状态：Active（S4 计划冻结）  
日期：2026-08-30  
基线：`8f83604`（vNext-0 R3 PASS 后的归档提交）

## 1. 阶段目标

把 vNext-0 已冻结的数据合同落为可独立验证的 DSL 与 knowledge 基础，同时保持 v1 默认路径和全部现有资产不变。阶段完成时可以安全地解析、预览并原子保存 v2，但尚不能执行、编辑或在运行中收集输入。

## 2. 最小可验收闭环

```text
v1 Flow
  → 纯函数升级预览（确定性 candidate / mapping / issues / fingerprint）
  → 用户显式确认（expectedRevision + reportFingerprint）
  → 单事务保存 v1 快照、v2 当前文档、revision 与清理
  → v2 可读取/导出/恢复，旧 Runtime 与旧写入口在副作用前拒绝
```

任何步骤失败都不得自动重试为覆盖、静默降级为 v1，或留下半个版本。

## 3. 固定合同

- v1 默认：`FLOW_SCHEMA_VERSION` 继续为 `1`；v1 parser、recorder、portability 和 Runtime 路径不改变语义。
- v2：`schemaVersion: 2`，顶层无 `variables[]`，`input.fields[]` 是唯一字段定义真源。
- 身份：`inputNodeId = input step.id`；`fieldId` 在单个 Flow 内全局唯一，不同 Flow 可重复。
- 引用：只接受允许槽位中的完整 `{{fieldId}}`；混合模板、未来引用、非法槽位和类型错配均拒绝。
- 升级：纯预览不写数据库；确定性 ID、canonical JSON 与 fingerprint 对相同输入稳定。
- 并发：所有 v2 写入使用 `expectedRevision`；最终 CAS 失败时整个事务回滚。
- 敏感：`remember: never`；无 default/lastValue；仅允许 `fill.value`；值不得进入 Flow、版本、execution、API、日志、SQLite/WAL/SHM。
- 错误分层：DSL 结构/策略错误使用 `FLOW_SENSITIVE_POLICY_INVALID`；未来 Runtime 在解析后的运行时绑定拒绝使用 `FLOW_SENSITIVE_BINDING_FORBIDDEN`。本阶段不混用两层错误。

## 4. 分轨与依赖

### G1A：DSL v2 与升级预览

所有权：`packages/shared` 中兼容的版本/错误合同、`packages/flow-dsl` 及其测试/fixture。

实施顺序：

1. 先写 v1/v2 版本分派、strict、引用与迁移稳定性的红灯测试。
2. 保留 `FlowDocument` / `NormalizedStep` 为 v1 兼容别名，新增显式 `FlowDocumentV1`、`FlowDocumentV2` 与受支持联合类型。
3. 实现 `parseFlowDocumentV1`、`parseFlowDocumentV2` 和按 schemaVersion 分派的 parser。
4. 实现跨步骤 field/reference/selection 校验与白名单 binding compiler；禁止复用 v1 的递归插值。
5. 实现纯函数升级预览、canonical JSON、确定性身份/映射、阻塞项与 fingerprint。

退出门禁：flow-dsl 单元/fixture、recorder、portability、typecheck、lint 全绿；无数据库、Electron 或 Studio UI 改动；独立 Judge PASS。

### G1A-C：旧消费者与执行入口兼容护栏

所有权：`packages/runtime` 的入口 guard；以及现有 v1-only 消费者对 `parseFlowDocumentV1` 的显式锁定与最小回归。后者只解决联合 parser 上线后的类型/版本边界，不为这些消费者增加 v2 能力。

实施顺序：

1. 用测试证明 v2 在创建 run directory、发 progress、启动 Chromium 或写 artifact 前被拒绝。
2. guard 只接受 v1，错误可诊断；不引入 v2 执行分支。
3. `ai-orchestrator`、Extension 导入/导出、旧 Studio portability、Local API recorder POST、Knowledge legacy repository/debug 路径中仍属于 v1-only 的消费者改用显式 v1 parser；通用 parser 不得因兼容压力退回 v1 返回类型。
4. 每个旧写入口对 v2 明确拒绝且无写入；Knowledge 的受控 v2 读取/保存只在 G1B 新 API 中开放。

退出门禁：Runtime 定向测试、全仓 typecheck 和相关 v1 消费者回归全绿；独立 Judge PASS。Runtime guard 可与 G1A 并行开发；旧消费者锁定补丁在 G1A 合入后执行。

### G1B：Knowledge revision 与原子升级

依赖：G1A PASS 并集成。

所有权：`packages/project-knowledge` 数据库/schema/repository；仅在必要时触达 `packages/local-api` 和 `apps/studio` 的旧入口 guard。

实施顺序：

1. 先写旧库升级、重复打开、并发 CAS、事务故障和敏感 canary 红灯测试。
2. 建立集中、幂等的 writable-open migration；只增列/增表，不删除 v1 数据。
3. 增加 flow revision 与安全版本元数据；实现 revision-aware save/restore。
4. 实现 upgrade transaction：校验 fingerprint/expectedRevision，写安全 v1 快照，保存 v2，清理不合规历史/最近值，最后 CAS。
5. 增加 `(flow_id, field_id)` 最近值表，只允许 `sensitive:false && remember:lastValue`。
6. vNext-2 前拒绝 v2 execution；repository 层必须成为最终防线，Local API 类型断言不得绕过。
7. 旧 recorder POST 只接受 v1；旧 rename/run 不能绕过 revision 或让 v2 进入 v1 Runtime；Studio 必须在分配 run directory 前拒绝 v2。

退出门禁：旧库/幂等 migration、并发、故障注入、restore、导入导出和 canary 全绿；v1 全回归；独立 Judge PASS。

### G1-I：集成与安全总审

1. Node 24 定向与完整 `pnpm smoke`、recorded replay、portability、安全审计。
2. Node 20 冻结依赖下 typecheck/test/build 与关键 E2E。
3. 扫描 SQLite、WAL、SHM、导出、execution API、日志和错误中的唯一 canary。
4. 独立 L3 Judge 检查合同一致性、回归、数据安全和范围，输出 scorecard/verdict。

退出门禁：Judge PASS，P0/P1 为零、required fixes 为空；验证证据落入 `.codex/verification-report.md`。

## 5. 红灯合同

- v1 默认 schema 变为 2，或老 Flow 被自动升级。
- v2 未知字段被 strip，重复 fieldId、未来引用、混合模板、非法槽位或敏感越界被接受。
- 同一 v1 输入两次预览得到不同 candidate/fingerprint，或改写 flow/project/browser-step 身份。
- v2 进入旧 Runtime 后才创建目录、启动浏览器或发出进度。
- 两个相同 expectedRevision 均成功，或 SQL 故障后 document/version/revision/清理状态不一致。
- sensitive/remember:never 值进入数据库文件、WAL/SHM、版本、最近值、execution、API、导出、日志或错误。
- 旧 POST/rename/run 绕过 v2/revision guard。

## 6. 明确非目标

- Runtime waitingForInput 会话、同页暂停/继续、Electron IPC/event registry。
- Studio 三栏模板编辑、运行态输入 dialog、最近值 UI。
- 条件、循环、子流程、批量、协作、任意表达式、AI 或 P3 深化。
- 以 feature flag 已存在为前提；当前没有生产 v2 flag，本阶段使用版本 guard 维持能力关闭。

## 7. 提交、评审与回收规则

- G0 路线/计划、G1A、G1A-C、G1B、G1-I 各自独立提交。
- 功能开发在独立 Git worktree 完成；Agent 只修改被分配文件，不回滚他人改动。
- Generator 不自审；Judge 只写 `.codex/reviews/vnext-1/**`，不得修改候选实现或代替主代理集成。
- 主代理核对提交祖先、patch 与测试后 cherry-pick；PASS 后回收对应 Agent、worktree 与临时分支。
- 用户 stash 始终保持不动；禁止 force push、reset --hard 或清理用户资产。

## 8. 阶段出口与后续

vNext-1 完成只证明数据基础可用，不代表 v2 可运行。归档本计划并更新路线锁后，才可创建 vNext-2A Runtime 输入会话计划；2A 与 2B 仍需独立实施和验收。
