# 结论

**REVISE（88/100）**。候选 `e2d1848a6975fd242e77df13b8fde97e60514db2` 已闭合首审的 CAS、敏感物理清理和导入导出三类核心缺口；fresh 全仓 build/typecheck/lint/test 全绿，未发现 P0。仍有 **1 个 P1**：v2 历史版本不能通过冻结的 Local API / Studio / Web 读取与恢复链路使用，因此尚不满足“v1/v2 版本均可读取、恢复”的退出合同。

# 为什么

- stale revision 防线已闭合。`saveFlow` 对既有 Flow 变为 create-only；`saveFlowRevision`、`renameFlow`、`restoreFlowVersion` 都要求 caller revision。独立攻击中四条 stale 写路径均返回 `FLOW_REVISION_CONFLICT`，current/version 完全不变，新 recorder Flow 仍能以 revision 1 创建。
- 敏感清理已闭合。复杂 canary `双引号 + 反斜杠 + 换行` 同时进入 sensitive default、execution snapshot/variables/environment/baseUrl/path 和 step details；成功升级后 candidate、current/export/execution/version API JSON 与 SQLite raw/JSON-escaped 均零命中，WAL/SHM 已移除。当前 Flow description 若复制秘密会安全阻断，且不生成 v2 或版本。
- 维护锁语义正确。活跃 SQLite reader 下升级在业务写入前返回 `FLOW_PERSISTENCE_FAILED`；独立探针确认 document、revision、schema、version、recent、execution 六项前后完全一致。成功路径则有 checkpoint、DELETE journal、`secure_delete=ON` 与物理扫描证据。
- v1/v2 import/export roundtrip 正确：新 flowId、目标 projectId、revision 1；不复制 version/recent/execution、本机路径或 secret；未知版本与不安全 upload 路径失败零写。
- Studio run guard 未被 31 文件修订破坏：schema 检查仍位于 executionId、run directory、环境检查、browser/runtime 之前。Studio 成功重命名/恢复后更新或重取 Flow 列表，第二次操作使用新 revision。
- 但历史版本跨层分派未闭合。`ProjectKnowledgeRepository.restoreFlowRevision()` 能恢复 v1/v2，正式客户端却仍先走 v1-only `getFlowVersion()`，并调用 v1-only `restoreFlowVersion()`。实际构造 v2 version 后，通过 `POST /api/projects/:projectId/flow-versions/:versionId/restore` 携带正确 expectedRevision，得到 HTTP 500：`legacy getFlowVersion 只允许读取 v1 Flow`；当前状态虽零写，但合法 v2 恢复不可用。Studio 本地 repository 模式、HTTP fallback 和 Web 复用同一链路，也同样受阻。

# 必须修改

1. 修复 **P1-01**：增加按 `projectId + versionId` 严格归属校验并返回 `AnyFlowDocument` 的版本读取入口；Local API、Studio 本地/HTTP fallback、Web 的版本读取/恢复必须按 schema 分派并调用通用 `restoreFlowRevision`。保持 `expectedRevision` CAS、错项目/错 version/stale revision 零写、400/409 稳定错误映射、成功后 revision 刷新和 v1 默认行为。补真实 v2 version 的 API/client 恢复回归，不能只测 repository 内部方法。

# 证据

- reviewed SHA：`e2d1848a6975fd242e77df13b8fde97e60514db2`
- remediation baseline：`b60fb3a0ac1795ff7714f8f1b858e7720e9a5996`
- `pnpm install --frozen-lockfile`：fresh 安装成功，lockfile 未变化
- `pnpm turbo build --force`：13/13 successful，0 cached
- `pnpm turbo typecheck --force`：21/21 successful，0 cached
- `pnpm turbo lint --force`：13/13 successful，0 cached
- `pnpm turbo test --force`：21/21 successful，0 cached；全仓 658 tests 通过
- 定向测试：Knowledge 105/105、Local API 13/13、Extension 79/79、Studio 218/218、Web 31/31、DSL 61/61
- 独立攻击：stale legacy 四路径零写；复杂 canary API/SQLite/WAL/SHM 零命中；active reader 六类状态不变；v2 version Local API restore 稳定复现 HTTP 500
- diff hygiene：`git diff --check` 与 `git diff --check b60fb3a..e2d1848` 均无输出；修订范围为 31 文件
