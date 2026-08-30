# vNext-1 G1-I 最终独立 R2 L3 复审请求

- 评审级别：L3
- 评审轮次：R2
- 候选：`27cbf0a0efdd075c9cd455a705cd860630c8e15f`
- 分支：`codex/vnext-1-g1i-final-r2`
- 工作树：`/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext1-g1i-final-r2`
- 首审包：`.codex/reviews/vnext-1/g1i-final-l3/`
- 修复说明：`.codex/reviews/vnext-1/g1i-fix-knowledge/report.md`、`.codex/reviews/vnext-1/g1i-fix-portability/report.md`

## 复审范围

1. 独立重放当前已删除/改名秘密、历史密码/上传/URL、execution snapshot/variables 的升级清理，核对历史 API、execution API、SQLite/WAL/SHM raw 与 JSON-escaped bytes，并验证旧版本恢复不可重新获得秘密。
2. 独立重放物理扫描失败与扫描后事务故障，逐字段核对 current document、schema、revision、version、recent 与 execution 均不变；审查提交后是否仍有可对外报错的业务步骤。
3. 独立攻击 v2 `navigate.url` / `wait.urlIncludes` 的 query、hash、userinfo、percent-encoded 与 malformed URL；导入必须零写，导出必须 fail closed，错误不得包含 canary。
4. 审查 `repository.ts` 历史清理与 portability 两套 helper 的策略一致性，以及 v1 正向闭环、v2 仍不可执行和修复范围。
5. 核对既有 Node 20 / Node 24 证据与候选差异；一旦出现确定 P1，停止无助于改变裁决的长耗时矩阵，但如实记录本轮已执行与继承边界。

## 判定标准

`PASS` 仅允许 `P0=0`、`P1=0` 且 `required_fixes=[]`；否则必须为 `REVISE`。
