# 结论

**PASS（100/100）**。候选 `2dd86fe1ab71d73509917ed6391d0b6d68cb4124` 已闭合 R2 唯一 P1：合法 v2 历史版本现在能经 repository、Local API、Studio 本地/HTTP 与 Web 正式链读取和恢复，成功响应携带新 revision/schema，连续第二次恢复使用第一次返回的新 revision。fresh 全仓 test/typecheck/lint/build 与独立对抗探针全部通过；未发现 P0/P1/P2，`required_fixes` 为空。

# 为什么

- repository 新增的正式历史读取按 `projectId + flowId + versionId` 三重归属查询，返回严格解析的 v1/v2 文档；legacy `getFlowVersion` 仍只允许 v1。通用 `restoreFlowRevision` 保持 immediate transaction、最终 CAS、版本快照与 schema metadata 校验。
- Local API 的 history GET 明确要求 `flowId`，restore 明确要求 `flowId` 与正整数 `expectedRevision`。独立真实 HTTP 探针确认合法 v2 GET 为 200/schema 2；两次恢复以 revision 3、随后以响应 revision 4 继续，得到 revision 4、5 且均为 schema 2。
- 同一探针确认缺 `flowId` 或 `expectedRevision` 均为 400；跨 flow、跨 project、未知 version 均为 404；stale revision 为 409。失败前后 current revision、version 数和其他 Flow revision 完全一致。
- Studio 本地模式直接调用 `getFlowVersionInFlow`/`restoreFlowRevision`，HTTP fallback、IPC/preload 和 renderer 均携带 flowId 与 caller revision；Web 同样携带 flowId，并把 restore 响应的新 revision/schema 写回列表。Studio 与 Web 的连续操作回归证明第二次操作使用新 revision。
- v2 current 仍 fail closed：独立探针对 legacy current getter、legacy version getter 与 rename/edit 均得到 `FLOW_SCHEMA_VERSION_UNSUPPORTED`；Studio run guard 仍位于 executionId、运行目录、browser/runtime 之前，本轮未把 v2 引入运行链。v1 legacy restore 回归得到 schema 1、revision 3。
- 首审安全门禁未回归：相同 expectedRevision 仅首个写者成功；含双引号、反斜杠、换行的 secret 在升级后 candidate/execution 与 SQLite raw/JSON-escaped 均零命中，WAL/SHM 不存在；活跃 SQLite reader 下升级以 `FLOW_PERSISTENCE_FAILED` 在业务写前失败，revision/schema/version 均不变。

# 必须修改

无。

# 证据

- reviewed SHA：`2dd86fe1ab71d73509917ed6391d0b6d68cb4124`
- R2 baseline：`e2d1848a6975fd242e77df13b8fde97e60514db2`
- implementation baseline：`fff2c895521d38bff98aeecd607a0baaafa4271a`
- `pnpm install --frozen-lockfile`：fresh 安装 801 个 workspace 依赖，lockfile 未变化
- 定向测试：Knowledge 106/106、Local API 14/14、Studio 219/219、Web 33/33、DSL 61/61、Extension 79/79
- `pnpm turbo test --force`：21/21 successful，0 cached；全仓 663 tests 通过，包含 runtime real-page/recorded-replay
- `pnpm turbo typecheck --force`：21/21 successful，0 cached
- `pnpm turbo lint --force`：13/13 successful，0 cached
- `pnpm turbo build --force`：13/13 successful，0 cached
- 独立 v2 HTTP 探针：GET 200/schema 2；失败矩阵 400/404/409 且零写；restore 依次返回 revision 4、5/schema 2；v1 legacy restore schema 1/revision 3
- 独立安全 smoke：CAS loser=`FLOW_REVISION_CONFLICT`；复杂 secret 主库 raw/escaped=false、WAL/SHM absent；active reader=`FLOW_PERSISTENCE_FAILED` 且状态不变
- diff hygiene：`git diff --check` 与 `git diff --check e2d1848..2dd86fe` 均无输出；R3 修订为 19 文件、584 insertions、82 deletions，均服务历史读取/恢复与跨层 revision 状态
