# vNext-1 G1-I R2 孤立 execution variables P1 修复证据

- 基线：`eb74ca52c580a6f403548e54b11c362e07a660f4`
- 分支：`codex/vnext-1-g1i-r2-orphan`
- 范围：`sanitizeUpgradeHistory` 的 execution-variable 分类/清理、对应持久化回归
- 结论：**PASS（待独立 Judge 复审）**

## RED：正式攻击探针

独立 worktree 首次运行定向测试时尚未安装依赖，仅得到 `vitest: command not found`；该环境前置失败不计为产品 RED。执行 `pnpm install --frozen-lockfile` 后，先只增加测试，再运行：

```bash
pnpm --filter @flowweave/project-knowledge test -- vnext-persistence.test.ts
```

得到预期产品红灯：`1 failed / 21 passed`。当前 v1 只定义 `account` 与 `secret_password`，旧 execution 不带 snapshot，但 `variables_json` 包含：

- `secret_orphan`
- `Secret_API_Key`
- `secret-password`
- `SECRET.PASSWORD`
- 名字看似普通的孤立变量 `telemetryNote`

五个值都包含双引号、反斜杠和换行。升级成功到 revision 2 后，五个变量仍由 execution API 原样返回，API JSON 命中 escaped canary；旧实现因此也无法把这些值纳入物理擦除扫描。

## 最小修复

`sanitizeUpgradeHistory` 现在先从以下全部 v1 文档建立“已定义变量名”并集：

- 当前 v1 Flow；
- 该 Flow 的全部 v1 历史版本；
- 全部 v1 execution snapshot。

对每条历史 execution 的变量采用冻结的 fail-closed 策略：

1. 变量名命中合并后的敏感集合时，收集其所有字符串值并删除该 key；
2. 变量名不在历史定义并集时，无法安全分类，同样收集其所有字符串值并删除该 key；
3. 已有历史定义且明确非敏感的变量保留。

被收集的 orphan 值继续走既有全历史结构化 scrub 与事务内物理扫描，因此不会只删除 execution key 而在 version、context、step metadata 或 SQLite 页中留下同值。

新增测试明确证明：

- 四个 Judge 名称与普通 `telemetryNote` 均被删除；
- 已定义非敏感 `account: "alice"` 保持不变；
- current、version API 与 execution API 对五个 canary 的 raw/JSON-escaped 表示均零命中；
- `store.sqlite`、`store.sqlite-wal`、`store.sqlite-shm`（存在时）对五个 canary 的 raw/JSON-escaped bytes 均零命中。

## 事务、serialize 与 checkpoint 语义复核

本修复没有改变升级事务边界。现有路径仍是：

```text
wal_checkpoint(TRUNCATE) 且 busy=0
  → journal_mode=DELETE
  → BEGIN EXCLUSIVE
  → 历史/执行清理、safe version、recent 清理、CAS
  → sqlite.serialize() 扫描事务内待提交镜像
  → WAL/SHM 扫描
  → upgrade:after-physical-erasure-check 故障点
  → COMMIT
```

故障矩阵覆盖五个事务内故障点，并在升级前 execution 中加入普通 orphan canary。每个故障后 current document/schema/revision、version 与 execution variables 都逐字段保持原值，证明新增 orphan 删除会随事务回滚。提交后唯一动作仍是 best-effort `closeProjectDatabase`；关闭异常被隔离，不会让调用方收到“失败但写入已提交”。扫描或事务内异常仍保留为失败，不吞掉扫描错误。

## GREEN：验证结果

| 命令                                                                           | 结果                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| `pnpm --filter @flowweave/project-knowledge test -- vnext-persistence.test.ts` | PASS，22/22                                         |
| `pnpm --filter @flowweave/project-knowledge test`                              | PASS，6 files，132/132                              |
| `pnpm --filter @flowweave/local-api test`                                      | PASS，1 file，14/14                                 |
| `pnpm --filter @flowweave/project-knowledge typecheck`                         | PASS                                                |
| `pnpm --filter @flowweave/project-knowledge lint`                              | PASS                                                |
| `pnpm --filter @flowweave/project-knowledge build`                             | PASS                                                |
| `pnpm typecheck`                                                               | PASS，21/21 Turbo tasks，0 cache                    |
| `pnpm lint`                                                                    | PASS，13/13 Turbo tasks，0 cache                    |
| `pnpm build`                                                                   | PASS，13/13 Turbo tasks                             |
| `pnpm test`                                                                    | PASS，21/21 Turbo tasks，13 packages，689/689 tests |
| `git diff --check`                                                             | PASS                                                |

Local API 在依赖闭包尚未生成 `project-knowledge/dist` 时首次收集失败（`0 tests`，无法解析包入口）；执行 `pnpm --filter @flowweave/project-knowledge... build` 后，正式重跑为 `14/14`。这次 fresh worktree 构建顺序失败未包装为通过。

## 安全与范围复核

- 未引入依赖、日志、API、错误 details 或新持久化格式。
- 新逻辑仅删除无法证明安全的孤立 execution key；没有以名称启发式放行未知变量。
- 物理扫描未弱化，orphan 字符串值进入既有 raw/JSON-escaped 扫描集合。
- 没有修改 Flow DSL、URL helper、`import-flow.test.ts`、配置或 lockfile。

## 残余风险

- 一个变量名只要在任一保留的 v1 current/version/snapshot 中有正式定义，就属于“可分类”集合；它是否敏感继续由既有跨历史敏感识别决定。这是为保留已定义非敏感历史输入而冻结的边界，不是对孤立变量的默认放行。
- orphan 的数值与布尔值会随 key 删除，但只把字符串值加入物理字节扫描；这与当前 `ExecutionVariableValue` 的标量合同及秘密物理扫描目标一致。
