# vNext-1 G1-I 最终独立 R5 L3 复审请求

- 评审级别：L3
- 评审轮次：R5
- 候选：`e25ce4093456907715aae098973af6110729b135`
- 分支：`codex/vnext-1-g1i-final-r5`
- 工作树：`/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext1-g1i-final-r5`
- 前序裁决：`.codex/reviews/vnext-1/g1i-final-l3/`、`g1i-final-l3-r2/`、`g1i-final-l3-r3/`、`g1i-final-l3-r4/`
- 本轮修复报告：`.codex/reviews/vnext-1/g1i-r4-fix-percent/report.md`

## 复审范围

1. 复核前四轮全部七类 P1：历史删改秘密、事务后扫描假失败、v2 URL key/query/hash/userinfo 单双编码、孤立 execution 变量、统一敏感策略、v1 userinfo 模板变量，以及 malformed-percent 连坐/invalid UTF-8/第三层 fail-closed。
2. 独立检查 `packages/flow-dsl/src/sensitivity.ts` 的 helper 是否只输出安全 URL 与变量名，不回传凭据字面量，且对 malformed percent 明确 fail closed。
3. 核对 portability、upgrade preview、Knowledge export/import、Local API、Runtime guard、Studio guard 与 SQLite/WAL/SHM canary 边界。
4. 在 Node 20.19.6 下真实完成 `pnpm install --frozen-lockfile --force`、`pnpm turbo typecheck test build --force`、`pnpm turbo test --force` 与 `pnpm e2e:login`。
5. 结合独立 Node 24 安全证据与当前候选复验，确认无新的 P0/P1，且 v2 仍在副作用前拒绝、v1 默认路径保持正向闭环。

## 判定标准

`PASS` 仅允许 `P0=0`、`P1=0` 且 `required_fixes=[]`。环境层原生 ABI 切换现象只有在同一 worktree 先做 Node 20 force install、再直接切回 Node 24 跑 SQLite 原生测试时出现，若 clean Node 24 证据与当前候选复验均证明产品行为正常，则作为非阻塞环境注记记录，不得误判为产品缺陷。
