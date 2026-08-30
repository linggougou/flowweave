# vNext-1 G1-I 最终独立 R4 L3 复审请求

- 评审级别：L3
- 评审轮次：R4
- 候选：`fc571530d6224af04c24874591bed62d04845a07`
- 分支：`codex/vnext-1-g1i-final-r4`
- 工作树：`/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext1-g1i-final-r4`
- 前序裁决：`.codex/reviews/vnext-1/g1i-final-l3/`、`g1i-final-l3-r2/`、`g1i-final-l3-r3/`
- 本轮修复报告：`.codex/reviews/vnext-1/g1i-r3-fix-userinfo/report.md`

## 复审范围

1. 复核前三轮六类 P1：历史删改秘密、物理原子性、v2 URL key 覆盖、孤立 execution variables、统一敏感策略，以及 v1 userinfo 变量。
2. 检查统一 helper 不返回凭据字面量、不可由调用者篡改且不误判普通参数；覆盖 navigate/wait、username/password、单/多变量、raw 与一/两轮编码。
3. 独立攻击 portability、upgrade preview/commit、Knowledge export/import 与 SQLite/WAL/SHM raw/escaped canary。
4. 核对组合 repository helper 无冲突、v1 正向路径、v2 副作用前拒绝和候选范围。
5. 先执行 Node24 修改包与攻击全量；仅在没有新 P0/P1 时进入真实 Node20.19.6 冻结安装及 39/39、0 cache 全门禁。

## 判定标准

`PASS` 仅允许 `P0=0`、`P1=0` 且 `required_fixes=[]`。本轮独立攻击发现新的 P1，依任务明示例外停止 Node20 长门禁并形成 `REVISE` 裁决。
