# 结论

**REVISE（64/100）**。最终候选 `02e758876afdf2708b341a5dbbd3694375d6571c` 的 DSL、双 Node 回归、v1 正向闭环和 v2 副作用前拒绝均通过，但独立攻击发现 3 个 P1：历史已删除敏感字段未被升级清理、物理扫描失败发生在事务提交后、v2 URL portability 存在 canary 导入导出旁路。当前为 `P0=0 / P1=3 / P2=0`，不满足最终 PASS 条件。

# 为什么

- `upgradeFlowToV2` 只从当前文档的升级预览构造 `sensitiveNames`。当 `secret_password` 已在较早 revision 被删除、秘密只存在于旧 `flow_versions` 时，升级仍成功，但历史 API 和 SQLite 主文件继续含有秘密；该旧版本还可以被恢复为 current。
- `upgradeTransaction.exclusive()` 返回后才执行 `assertPhysicalSecretErasure`。独立探针让扫描失败时，调用抛出 `FLOW_PERSISTENCE_FAILED`，但重新读取已经是 schema v2/revision 2 且版本行已生成，违反“任一步失败整笔回滚”。
- v2 portability 只检查 `navigate.url` 的 authority 与普通 query；`wait.urlIncludes` 以及 URL hash 中的 `token/access_token` 未覆盖。两类 canary 文档都能被正式导入并原样导出。
- 这些失败不来自 Node 或安装环境：Node24 fresh typecheck/lint/test/build 为 52/52、0 cache；Node20 冻结重装后 Knowledge 106/106、Local API 14/14、Runtime guard 9/9、DSL 61/61、Studio 219/219、v1 登录 4/4 均通过。它们说明现有测试矩阵缺少攻击场景，而不是候选无法构建。

# 必须修改

1. 升级清理应从当前文档、全部历史 v1 版本和 execution snapshot 合并确定性的敏感字段身份与值，覆盖历史已删除/改名字段、密码字面量、上传与敏感 URL 来源；增加历史 API、execution API 与 SQLite/WAL/SHM raw/escaped canary 红灯测试。
2. 消除物理安全验证的 post-commit 失败窗口。任何 `upgradeFlowToV2` 对外失败都必须保持 document、版本、最近值和 revision 全部不变，并加入物理扫描失败故障注入。
3. 统一 v2 URL portability 检查，覆盖 `navigate.url` 与 `wait.urlIncludes` 的 query、fragment-query、userinfo、编码 key；import 与 export 两端都必须 fail closed，且 canary 不落盘、不出现在导出结果。

# 证据

- reviewed SHA：`02e758876afdf2708b341a5dbbd3694375d6571c`；实现 SHA：`cccd818aadee53f090caf7bf6c0f265d9e8beb8f`；计划基线：`8f83604`。
- 候选完整性：`cccd818..02e7588` 仅增加 Node20/Node24 四个证据文件；lockfile 与 HEAD 一致；评审前工作树 clean。
- Node24 fresh：`TURBO_FORCE=true pnpm turbo typecheck lint test build --force --output-logs=errors-only`，52/52 tasks、0 cached、1m27.027s。
- Node20 fresh/定向：Knowledge 106/106、Local API 14/14、Runtime guard 9/9、DSL 61/61、Studio 219/219；`pnpm e2e:login` 为 success、4/4 steps。
- 历史残留探针：升级 revision=3/schema2；`historyContainsSecret=true`；`store.sqlite contains raw canary=true`。
- post-commit 探针：抛 `FLOW_PERSISTENCE_FAILED` 后 current=`revision 2/schema 2`，versionCount=1。
- portability 探针：`wait.urlIncludes?...token=<canary>` 与 `navigate.url#?access_token=<canary>` 均 `accepted=true`、`exportContainsSecret=true`。
