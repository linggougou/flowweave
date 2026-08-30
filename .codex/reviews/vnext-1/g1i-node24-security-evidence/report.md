# vNext-1 G1-I Node 24 / 安全独立验证报告

- 验证时间：2026-08-30 16:20:07 +0800
- 候选分支：`codex/vnext-1-g1i-node24-security`
- 候选 SHA：`cccd818aadee53f090caf7bf6c0f265d9e8beb8f`
- 运行时：Node.js `v24.14.0`，pnpm `9.15.4`
- 裁决：**PASS**

## 结论

G1-I 的 Node 24、生产依赖审计、录制回放、可移植往返、登录流程和 vNext 定向安全攻击门禁均通过。v2 在 vNext-2 前仍不能进入 Runtime、Studio run 或 Knowledge execution；v1 默认登录流程可正常运行。候选仓库在写入本证据包之前保持 tracked/untracked 零改动，lockfile 与候选代码未被修改。

## 可复现门禁

| 门禁 | 结果 | 计数 / 关键证据 |
|---|---|---|
| `CI=1 pnpm install --frozen-lockfile` | PASS | 801 个包全部本地复用；lockfile up to date |
| `CI=1 pnpm smoke` | PASS | 首轮退出 0，但 Turbo 命中跨 worktree 共享缓存；不单独作为 Node 24 充分证据 |
| `CI=1 TURBO_FORCE=true pnpm smoke` | PASS | doctor 通过；typecheck 21/21、test task 21/21（663 tests）、build 13/13，均 0 cached；登录 4/4 |
| `TURBO_FORCE=true pnpm lint` | PASS | 13/13，0 cached |
| `pnpm e2e:recorded-pages` | PASS | 25/25；真实 fixture 23、运行期临时页 2 |
| `pnpm e2e:portability` | PASS | warnings=4、steps=10，往返成功 |
| `pnpm e2e:login` | PASS | v1 `flow_e2e_login`，4/4 steps，status=success |
| `pnpm audit --prod --audit-level high --registry=https://registry.npmjs.org` | PASS | `No known vulnerabilities found` |
| Knowledge `vnext-persistence.test.ts` | PASS | 18/18 |
| Local API `index.test.ts` | PASS | 14/14 |
| Runtime `playwright-launch-options.test.ts` | PASS | 9/9 |
| Studio run guard 定向测试 | PASS | 5/5；另 15 skipped（由 `-t` 定向筛选） |
| Studio 导入导出 `flow-portability-files.test.ts` | PASS | 16/16 |
| Flow DSL 回归 | PASS | 61/61 |

全仓无缓存测试计数为 663：shared 7、ui 14、network-intelligence 1、flow-dsl 61、recorder 54、page-intelligence 22、ai-orchestrator 1、project-knowledge 106、runtime 52、extension 79、local-api 14、web 33、studio 219。

## vNext 安全攻击与 canary 证据

本轮只使用测试内合成 canary，不使用任何真实口令、Cookie、Token 或 API Key。

1. **持久化清理与唯一 canary**：Knowledge 的 `SECRET_CANARY` 是带引号、反斜杠和换行的唯一合成标记。升级后同时扫描 SQLite 主文件、`-wal` 与 `-shm` 的 raw/JSON-escaped bytes，均为零命中；`getExecution` 结果也为零命中。
2. **版本与 revision**：旧库 migration 幂等；新 v1 revision=1；同一 `expectedRevision` 只有首个写者成功；stale revision/fingerprint、legacy 静默覆盖、跨 schema 通用保存均 fail closed 且零写入；升级/恢复原子递增 revision，并保留受约束的 schema/source revision 元数据。
3. **最近值**：只接受当前 v2 的非敏感、`remember:lastValue` 标量；敏感 field 写入被拒绝，错误与读取结果均不含合成 canary；跨版本恢复清空最近值。
4. **active reader**：保持 SQLite 只读事务时，升级在任何写入前以 `FLOW_PERSISTENCE_FAILED` 失败；revision 保持 1、无历史版本，证明 fail closed。
5. **execution / Runtime / Studio**：Knowledge 在 execution 写入前拒绝 v2，注入的 v2 snapshot 在读取时也被拒绝；Runtime 对 v2、对象、数组、字符串、缺失 schema 均在 artifact、进度、Chromium 启动前拒绝；Studio 在 run directory、Chromium 检查、执行、进度、execution/snapshot 保存、环境保存前拒绝。错误只暴露安全归一化的 `2`、`invalid` 或 `missing`，不回显嵌套 canary。
6. **Local API**：revision restore 缺失/stale/跨归属请求均零写入；正式 v2 历史读取与正确 revision restore 成功；legacy recorder POST 明确拒绝 v2；畸形 JSON、无效 schema、ghost project 与 1 MiB+1 请求准确失败且无副作用。
7. **导入导出**：Local API v2 经专用 endpoint 同版本导入为 revision=1 的新身份，导出不携带来源身份；Studio strict v2 裸文档交给原子导入服务，导出不追加 revision、executions、recentValues，v1 的合成敏感默认值不进入导出文件。
8. **v1 正向闭环**：`examples/run-login-flow.ts` 显式使用 `FLOW_SCHEMA_VERSION`（当前 v1）；smoke 与单独登录均完成 4 步，证明 fail-closed 守卫未误伤 v1 默认流程。

## 代码与依赖边界

- 在证据包落盘前：`git status --short`、`git diff --name-only`、`git diff --check`、`git diff -- pnpm-lock.yaml` 均无输出。
- 对 `3f058e7..cccd818` 的 vNext 候选差异执行常见真实凭证模式扫描（OpenAI、GitHub、AWS、私钥头），零命中。
- frozen install 的 Electron postinstall 只修复/重签名 worktree 内忽略的 `node_modules` bundle；无 tracked 文件变化。
- E2E 按既有脚本在 `~/.flowweave/projects/` 创建了本地测试项目/运行目录；这些是测试运行产物，不属于 Git 候选。

## 非阻塞风险

1. pnpm 安装、官方 registry audit 和 Studio native binding 构建均出现 Node `DEP0169`：依赖内部仍调用旧 `url.parse()`。官方 audit 同时确认无已知生产依赖漏洞，因此本轮判为非阻塞兼容性/维护风险，但应在后续依赖升级轨跟踪。
2. Studio native binding 构建提示 `prebuild-install@7.1.3` 为 deprecated subdependency，且 `better-sqlite3 12.1.1` 有更新版本。当前原生模块、完整测试与构建均通过，不建议在本门禁中改 lockfile。
3. 首轮 smoke 使用了共享 Turbo 缓存；本报告已用 `TURBO_FORCE=true`、0 cached 的完整第二轮消除此证据缺口。

## 裁决边界

本报告只裁决 Node 24 与安全验证轨。它不替代 Node 20 独立验证、最终集成 Judge、用户验收、发布或 vNext-2 路线解冻。
