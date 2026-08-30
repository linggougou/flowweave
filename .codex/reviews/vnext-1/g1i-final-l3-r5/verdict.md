## 结论

**PASS（100/100）**。候选 `e25ce4093456907715aae098973af6110729b135` 已关闭 R4 暴露的 malformed-percent userinfo 失敏旁路；本轮为 `P0=0 / P1=0 / P2=0`，`required_fixes=[]`，vNext-1 G1-I 可以退出 review。

## 为什么

- `inspectUrlUserInfo` 现在对合法 `%HH` run 做有限两轮解码，对 malformed percent、invalid UTF-8 邻接模板和第三层编码都给出可预期的 fail-closed 行为，不再出现 `removed:true + variableNames:[]` 的公开泄漏窗口。
- 当前候选的 clean Node24 复验通过了 flow-dsl `74/74`、runtime guard `47/47`、studio guard `14/14`，主工作树同一候选还通过了 project-knowledge `50/50` 与 local-api `14/14`。
- Node20.19.6 硬门全部通过：`pnpm install --frozen-lockfile --force` 成功，`pnpm turbo typecheck test build --force` 为 `39/39`、`0 cached`，`pnpm turbo test --force` 为 `21/21`、`759/759`，`pnpm e2e:login` 为 `4/4 success`。
- 既有独立 Node24 安全证据继续成立：smoke、recorded replay `25/25`、portability、login、prod audit 与 canary 零命中均已闭环，且本轮未发现新的公开路径回归。

## 必须修改

无。

## 证据

- 修复范围：`cccd818..e25ce40` 的产品实现只改 `packages/flow-dsl/src/sensitivity.ts`，其余为攻击回归与修复报告。
- Node20 独立复验：`node -v=v20.19.6`、`process.execPath=/Users/ling/.nvm/versions/node/v20.19.6/bin/node`、`39/39` 全仓门禁、`759/759` 测试和 `flow_e2e_login` 四步成功。
- Node24 clean 复验：flow-dsl `74/74`、project-knowledge `50/50`、local-api `14/14`、runtime `47/47`、studio `14/14`；重点覆盖 malformed percent、invalid UTF-8、第三层编码、公开 export/import 与副作用前拒绝。
- 环境注记：同一 review worktree 在 Node20 force install 后直接切回 Node24 跑 SQLite 原生测试会命中 `better-sqlite3` ABI mismatch（115→137）；这已被界定为双 Node 共用原生依赖的环境现象，不构成当前候选的产品缺陷。
