# 结论

**REVISE（58/100）**。候选 `b60fb3a0ac1795ff7714f8f1b858e7720e9a5996` 的新 revision-aware 核心路径具备真实 `BEGIN IMMEDIATE`、事务内 fingerprint 重算和最终 CAS，双进程竞争也确实只有一个写者成功；但存在 2 个 P0、1 个 P1，尚不能通过 G1B 数据/安全门禁。

# 为什么

- P0：legacy 写入口仍绕过 caller CAS。先以 `saveFlowRevision(expectedRevision=1)` 写到 rev2 后，无 `expectedRevision` 的 `saveFlow` 接受陈旧 v1 快照并覆盖为 rev3；`renameFlow` 又在无 caller revision 情况下写到 rev4。旧 Local API recorder POST、rename 与 legacy restore 均沿这些方法执行，因此“兼容 v1”仍允许静默覆盖。
- P0：敏感清理不是结构化清理，且 SQLite canary 证据不成立。包含引号、反斜杠和换行的已识别 secret 会因为 JSON 转义而绕过 `JSON.stringify(candidate).includes(rawSecret)`，升级成功后直接存在于 v2 当前文档和 SQLite `document_json`。另一独立攻击证明，普通 ASCII canary 虽从 `variables_json` 移除，却继续存在于 `flow_snapshot_json.description`、SQLite 主文件及 `getExecution` 返回值。
- P0 的持久化残留还能由正常并发状态触发：保持一个 SQLite 只读事务后执行升级，候选仍返回成功并提交 rev2，但 `wal_checkpoint(TRUNCATE)` 的 busy 结果被忽略，主数据库文件继续命中简单 canary。现有测试关闭所有连接后才扫描，不能证明活跃 reader 下的零命中合同。
- P1：冻结设计要求 v1/v2 导入都创建独立副本，并支持 v2 同版本安全导出；当前 `importFlow` 仍只调用 v1 `createPortableFlowDocument`，测试还把合法 schemaVersion=2 归类为无效 schema，现有 Studio export 也只走 v1 入口。
- 已通过部分：旧库幂等 migration、revision/schema/source 元数据主路径、save/upgrade/restore 的同步 immediate transaction、新 API 的 no-op/版本号、upgrade 故障回滚、recent-values 策略收紧与恢复 v1 清理、v2 execution fail closed、错误消息表面、100 项 Knowledge 与 61 项 DSL 回归、无缓存全仓 39 项 typecheck/lint/build 门禁。

# 必须修改

1. 所有可能更新既有 v1 的 legacy save、rename、restore 都必须使用调用方提供的 `expectedRevision`；或把 recorder legacy save 收紧为 create-only。陈旧请求必须 `FLOW_REVISION_CONFLICT` 且零写入，并把字段贯通 Local API、Studio 本地/HTTP 客户端和测试。
2. 改为解析后按结构语义清理已识别秘密，覆盖 candidate、当前/历史 Flow、version、execution variables、flow snapshot、metadata 与 step detail，再序列化复验；不能在 JSON 文本上用未转义原值替换。必须处理 checkpoint busy/活跃 reader，不得在 SQLite/WAL/SHM 仍含 canary 时报告升级成功，并增加转义字符、flowSnapshot 与活跃 reader 攻击测试。
3. 补齐 strict v2 原子导入新副本与同版本安全导出/往返，确保 revision=1，且不复制版本、最近值、execution、本地路径或任何秘密。

# 证据

- 候选范围：`fff2c89..b60fb3a` 仅修改 `packages/project-knowledge` 的 7 个实现/测试文件，约 `1564 insertions / 129 deletions`。
- fresh 安装：`pnpm install --frozen-lockfile` 通过，lockfile 未变化。
- fresh 无缓存全仓门禁：`pnpm turbo typecheck lint build --force` → `39/39 successful`、`0 cached`。
- fresh 测试：project-knowledge `6 files / 100 tests`；flow-dsl `4 files / 61 tests`。
- 正向 CAS 攻击：两个真实 Node 进程同持 `expectedRevision=1` 同刻写入 → `1 success + 1 FLOW_REVISION_CONFLICT`，最终 rev2。
- legacy 覆盖攻击：revision-aware rev2 → legacy stale save rev3 → legacy rename rev4，均无 caller expectedRevision。
- 转义秘密攻击：candidate raw includes 为 false；upgrade 未拒绝；持久化 v2 description 与 SQLite 解码值均等于原 secret，主文件命中 JSON-escaped bytes。
- execution snapshot 攻击：`variables_json` 已清理，但 `flow_snapshot_json`、SQLite 主文件与 `getExecution` 均命中普通 canary。
- 活跃 reader 攻击：upgrade 返回成功、revision=2，但 SQLite main 仍命中 canary。
- `git diff --check` 对候选 diff 与工作区均通过；repository.ts 的 Prettier 文件级差异在 baseline 已存在，fresh lint 通过，未作为候选新增 finding。
