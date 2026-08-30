# vNext-1 G1-I Knowledge P1 修复证据

- 基线：`00d5f9f2e81cb4b0845ff0b9e23e16950834b2f6`
- 分支：`codex/vnext-1-g1i-fix-knowledge`
- 范围：历史敏感集合/清理、物理扫描失败原子性及对应 Knowledge 回归
- 结论：**PASS（待独立 Judge 复审）**

## RED：正式攻击探针复现

先只增加测试，再执行：

```bash
pnpm --filter @flowweave/project-knowledge test -- vnext-persistence.test.ts
```

结果为预期红灯：`1` 个测试文件失败，`2 failed / 18 passed`。

1. 历史敏感集合不完整：先保存含 `legacy_password`、密码字面量、上传路径和敏感 URL 的 v1，再把字段改名，随后从 current 删除并升级；旧版本与 execution API 仍返回改名前后的 canary。
2. 物理扫描在提交后失败：把同一 canary 放入项目元数据，强制升级后的物理扫描失败；调用方收到 `FLOW_PERSISTENCE_FAILED`，但 current 已成为 schema v2 / revision 2，版本已新增，预置 recent value 已删除。

红灯错误对象的断言同时要求不回显 canary。

## 修复

### 1. 合并全部 v1 历史敏感身份与值

- 先解析 current、该 Flow 的全部历史版本及全部 execution snapshot。
- 第一遍复用 `previewFlowV1Upgrade` 与 portability 密码判定结果，合并 current、历史版本和 execution snapshot 的敏感变量名。
- 同时收集历史密码字面量、上传字面量、敏感 URL query/hash/userinfo 的 raw 与 decoded 值；模板引用不会被误当成秘密字面量，混合模板中的变量身份仍会纳入敏感集合。
- 第二遍按合并后的变量名收集所有 v1 default 与 execution variables，覆盖历史已删除和改名字段。
- 统一清理 current 安全快照、全部版本文档/说明、execution variables/snapshot/context/step metadata，再经 schema parser 和内存 canary 断言复核。

新增回归覆盖：

- 已删除 `legacy_password` 与改名后的 `renamed_password`。
- 带 JSON 转义字符的 default。
- 历史密码字面量。
- 历史上传路径。
- percent-encoded 敏感 URL 值。
- 正式历史读取 API、execution API、SQLite 主文件、WAL、SHM 的 raw/JSON-escaped 零命中。

### 2. 消除 post-commit scan failure

升级顺序现在为：

```text
wal_checkpoint(TRUNCATE) 且 busy=0
  → journal_mode=DELETE
  → BEGIN EXCLUSIVE
  → 历史清理 / 安全版本 / recent 清理 / CAS
  → sqlite.serialize() 生成含未提交修改的完整待提交 SQLite 镜像
  → 镜像 raw/escaped 扫描 + checkpoint 后 WAL/SHM 扫描
  → 故障注入点
  → COMMIT
```

`better-sqlite3` 的同步 `serialize()` 在事务内反映未提交页，因此物理镜像或 sidecar 扫描异常仍位于真实 SQLite 可回滚边界内。项目元数据保留同一 canary 的探针现在会在事务内失败；current document、revision、version 与 recent rows 均保持逐字段不变。

提交后不再运行安全扫描或其他可能形成业务失败的步骤；唯一剩余动作是 best-effort 关闭连接，关闭异常不会把已提交成功改写成失败响应。扫描/事务失败分支仍保留并抛出原始安全错误，不吞掉扫描失败，也不泄漏 canary。

故障矩阵新增 `upgrade:after-physical-erasure-check`，证明扫描完成后的最后一个事务内故障点仍会回滚 document、history、execution cleanup 与 revision。

## GREEN：验证结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @flowweave/project-knowledge test -- vnext-persistence.test.ts` | PASS，21/21 |
| `pnpm --filter @flowweave/project-knowledge test` | PASS，6 files，109/109 |
| `pnpm --filter @flowweave/project-knowledge typecheck` | PASS |
| `pnpm --filter @flowweave/project-knowledge lint` | PASS |
| `pnpm --filter @flowweave/project-knowledge build` | PASS |
| `pnpm --filter @flowweave/local-api test` | PASS，1 file，14/14 |
| `git diff --check` | PASS |

首次直接运行 Knowledge typecheck 时，独立 worktree 尚未构建 workspace 依赖声明，出现 `@flowweave/shared` 等模块声明缺失；执行 `pnpm --filter @flowweave/project-knowledge... build` 后，正式 typecheck/lint/build 与测试命令全部通过。这是 fresh worktree 的依赖构建顺序，不是产品失败。

## 安全复核

- 未增加依赖、API、日志或错误 details。
- 新增 SQL 仅存在于测试故障构造，使用参数绑定；生产查询继续使用 Drizzle/参数化路径。
- 错误消息固定且不包含字段名、值、SQL、路径或 canary。
- 没有修改 `assertPortableV2Document` 或 `import-flow.test.ts`；v2 URL portability 由并行轨负责。
- lockfile 未修改。

## 残余风险

- 历史敏感字面量会被不可逆替换为 `[已清理]`；这是阶段零秘密合同要求的有意行为，旧版本结构和身份保留，但秘密值不可恢复。
- 本轨已在当前 Node 24 / better-sqlite3 绑定完成真实 SQLite 验证；Node 20 仍应由最终双 Node 集成门禁重复执行同一攻击矩阵。
- 物理验证依赖 `better-sqlite3` 的同步 `serialize()` 合同；后续升级该原生依赖时应保留“事务内未提交页可见”的故障探针。
