## 结论

**REVISE（75/100）**。候选 `27cbf0a0efdd075c9cd455a705cd860630c8e15f` 已修复首审的历史已删除/改名秘密主路径和物理扫描 post-commit 原子性问题，但 R2 独立攻击仍发现 `P0=0 / P1=2 / P2=0`，`required_fixes` 非空，不满足最终 PASS 条件。

## 为什么

- 历史 current/version/execution snapshot 能识别到的已删除/改名秘密、password-hinted literal、upload 与 encoded URL 已在升级后从历史 API、execution API、SQLite raw/escaped bytes 清除，旧版本恢复也不能取回 canary；这部分首审 P1 已真实修复。
- 物理扫描和最后故障点现已位于 `BEGIN EXCLUSIVE` 的可回滚边界内。独立触发扫描失败及 `upgrade:after-physical-erasure-check` 后，document/schema/revision/version/recent/execution 均保持原值；提交后仅做 best-effort close，不再出现“失败但已写入”。
- 但 `sanitizeUpgradeHistory` 只从 current、versions 和 execution snapshot 合并敏感变量名，再按该集合清理 `variables_json`。当旧 execution 没有 snapshot，且敏感变量只存在于 `variables_json` 时，`secret_orphan`、`Secret_API_Key`、`secret-password`、`SECRET.PASSWORD` 四种名称的复杂值都会在升级成功后继续由 API 返回并留在 SQLite escaped bytes 中。
- `repository.ts` 新增的 v2 URL regex 不含通用 `key`，而 Flow DSL 的 portability 与 upgrade 敏感键集合都明确包含 `key`。因此 `navigate ?key=...`、`wait #?key=...` 和双重编码 `%256b%2565%2579=...` 都能导入落盘并原样导出；两套 helper 已发生可证实的策略冲突。

## 必须修改

1. 对无 Flow/version/snapshot 定义的历史 execution variables 做确定性敏感名称识别，并与 DSL/升级策略统一大小写和分隔符规则；命中的变量和值必须参与结构化删除、全历史 scrub 与物理扫描。对缺少可验证来源、无法安全分类的孤立变量必须冻结明确边界：保守清除其值或拒绝升级，禁止默认保留。补齐缺 snapshot、孤立变量、复杂 JSON 转义的历史 API、execution API、SQLite/WAL/SHM raw/escaped 零命中测试。
2. 删除 Knowledge 的平行 URL 敏感 regex，复用 Flow DSL 导出的统一判定/规范化函数或同一冻结集合。补齐通用 `key` 在 navigate/wait 的 query/hash/malformed/userinfo、大小写、分隔符、单次及双次 percent encoding 攻击；import 必须零写，export 必须 fail closed，错误不得含 canary。

## 证据

- 本轮 Node24：Knowledge `131/131`、DSL `61/61`、Local API `14/14`、Runtime guard `9/9`、Studio `219/219`、v1 login `4/4`。
- 原子性独立探针：物理扫描失败返回 `FLOW_PERSISTENCE_FAILED`，current/schema/revision/version/SQL recent rows 全相等；扫描后的最终事务故障同样完整回滚。
- 历史主路径独立探针：升级到 revision 4 后，3 个旧版本、execution API 与 SQLite 对 deleted/renamed/password/upload/URL raw/escaped canary 均零命中；恢复旧 v1 后仍零命中。
- P1 探针一：四种孤立 execution variable 名全部 `apiPreserved=true`，SQLite 全部 `escaped=true`。
- P1 探针二：三种通用 `key` URL 均 `accepted=true`、Flow 数量 `0→1`、`exportContainsCanary=true`。
- 既有 Node20/Node24 fresh 证据只继承未变的 DSL/Runtime/Studio/Local API；组合候选 Knowledge 的 Node20 131 与 Node24 fresh forced 全仓矩阵未虚报为已完成。两个确定 P1 已锁定 REVISE，未继续运行不改变裁决的长耗时矩阵。
