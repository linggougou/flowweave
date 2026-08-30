# vNext-1 数据基础实施解冻变更单

## 1. 变更请求

- 日期：2026-08-30
- 请求：在已冻结的 vNext-0 设计合同上继续开发并负责项目落地。
- 用户原文：`我要去休息了,你全权负责项目的落地`
- 授权解释：允许按既定实施 DAG 自主推进，但每次只开放一个可回滚阶段。本变更单仅开放 vNext-1A/1B 数据基础及阻止旧入口误执行 v2 的最小兼容护栏，不开放 vNext-2 运行时输入会话、vNext-3 Studio 编辑/运行 UI、P3 或 P4。

## 2. 现路线问题

vNext-0 已将 schema v2、显式升级、revision/CAS、最近值和敏感数据边界冻结为设计真源，但路线锁仍禁止任何实现。若不先解冻数据基础，Runtime、Electron 和 Studio 无法在稳定合同上开发；若一次开放整条 vNext，则会失去阶段回滚点和独立验收门。

## 3. 影响范围

本阶段允许修改：

- `packages/shared`：兼容的 schema 版本常量与错误码；v1 默认保持不变。
- `packages/flow-dsl`：v1/v2 分派、strict v2 schema、跨步骤校验、受控 binding compiler、确定性升级预览。
- `packages/runtime`：仅增加旧执行入口对 v2 的副作用前拒绝，不实现等待输入。
- `packages/project-knowledge`：幂等 SQLite migration、revision/CAS、原子保存/恢复/升级和安全最近值。
- `packages/local-api`、`apps/studio`：仅增加 v1 旧写入/运行入口的版本护栏，不提供 v2 编辑、执行或最近值查询面。
- 对应测试、fixture、文档、`.codex/` 留痕与独立审查包。

本阶段不得修改：

- vNext Runtime 暂停/继续会话、Electron 会话桥、Studio 模板编辑器或运行态输入 UI。
- 条件、循环、子流程、批量、云协作、任意表达式或通用画布。
- P3 page/network intelligence 深化、P4 AI orchestrator 或 AI 产品入口。
- 现有 v1 录制、可移植性和执行语义；不得自动升级用户 Flow。

## 4. 生命周期与里程碑变化

- 原状态：vNext-0 S7 设计会签完成，实施未开启。
- 新状态：vNext-1 S4 计划冻结 → S5 实施 → S6 验证 → S7 会签。
- 新里程碑：vNext-1 数据基础。
- 最小闭环：同一 v1 Flow 可重复生成完全一致的 v2 升级预览；经 fingerprint 与 expectedRevision 明确确认后在单事务中保存 v1 快照和 v2 当前版本；冲突或故障不产生部分状态；v1 继续原样执行，v2 在 vNext-2 前由所有旧执行/写入入口明确且无副作用地拒绝。

## 5. 迁移、风险与回滚

- 数据库 migration 仅增列/增表，必须幂等，已有 v1 记录默认不改写。
- `FLOW_SCHEMA_VERSION` 继续指向 v1；新增 v1/v2 显式常量，避免旧消费者静默切换。
- 1A 与 1B 各自使用独立 worktree、测试先行、独立 Judge；只有 PASS 后才进入集成分支。
- 1B 失败时保留已通过的纯 DSL 能力，但 v2 持久化与运行能力保持关闭。
- 任一 canary 在 SQLite、WAL、SHM、导出、日志或 API 命中即判失败，不进入下一阶段。
- 回滚不删除 v1 数据、不改写用户 stash、不弱化现有门禁。

## 6. 批准记录

用户已在 2026-08-30 明确把后续项目落地交由当前 Agent 自主推进。结合此前“先 plan、各功能依托 worktree 分派 Sub-Agent 并行开发、验收合格后回收”的指令，本变更单视为 vNext-1 的实施授权；授权不会自动越过本阶段门禁。
