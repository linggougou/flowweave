# vNext-1A/1B 数据基础上下文摘要

## 授权与路线

- 用户于 2026-08-30 明确把项目后续落地交由当前 Agent 自主负责。
- 沿用此前“先 plan、独立 worktree、Sub-Agent 分轨、验收后回收”的执行方式。
- 当前只开放 vNext-1A/1B 和旧入口最小兼容护栏；vNext-2/3、P3、P4 仍冻结。

## 稳定基线

- vNext-0 R3：独立 L3 Judge `PASS 100/100`，设计归档提交 `8f83604`。
- `main` 与 `origin/main` 已 fast-forward 到 `8f83604`，未 force push。
- 当前集成分支：`codex/vnext-1a-1b-integration`。
- Node `24.14.0`、pnpm `9.15.4`；开发前 flow-dsl `18/18`、project-knowledge `85/85`。
- 两条用户 stash 保持不动，不得 apply/drop/clear。

## 只读源码审计结论

1. `FLOW_SCHEMA_VERSION` 当前固定为 1；必须保留兼容含义，不能直接改成 2。
2. flow-dsl 是单一 v1 schema；旧递归插值允许混合模板，v2 不能复用。
3. Runtime 与 Studio 当前都会在版本拒绝前产生目录/进度等副作用，必须前移 guard。
4. Knowledge 使用每项目 SQLite 和手写 INIT_SQL；现有 save/restore/version 不具备完整原子性或 revision/CAS。
5. execution `variables_json` 和 Local API 类型断言可绕过敏感策略；vNext-2 前必须在 repository 层拒绝 v2 execution。
6. legacy rename、recorder POST 与 Studio run 都可能绕过 v2/revision 边界，需要最小护栏。
7. 敏感数据物理 canary 不能只查逻辑表，还要覆盖 SQLite/WAL/SHM、导出、API、日志和错误。

## 冻结合同

- v2 `schemaVersion: 2`；无顶层 variables。
- `input.fields[]` 唯一真源；fieldId 为 Flow 内全局唯一。
- 引用只允许白名单槽位中的完整 `{{fieldId}}`。
- v1 默认不变，升级必须 preview/confirm，使用 expectedRevision + deterministic fingerprint。
- 最近值默认关闭；仅非敏感字段显式 `remember:lastValue` 可保存。
- v2 在 vNext-2 前不可执行，必须在所有副作用之前拒绝。

## 分轨

- G1A：DSL v2 与确定性升级预览。
- G1A-C：Runtime 无副作用版本护栏。
- G1B：幂等 migration、revision/CAS、原子升级、最近值与旧入口护栏。
- G1-I：双 Node、E2E、安全 canary 与独立 L3 总审。

## 工具与替代

- 三路只读 Sub-Agent 已分别审计 DSL、knowledge 和跨包调用影响面；它们没有修改工作区。
- CodeGraph 当前无直接调用入口；以 `rg`、源码和现有测试交叉映射替代，并将结论纳入计划。
- 使用 TDD、security-review、verification-loop 与 judge-harness；Judge 不得修改候选实现。
