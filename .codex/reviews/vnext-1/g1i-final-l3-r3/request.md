# vNext-1 G1-I 最终独立 R3 L3 复审请求

- 评审级别：L3
- 评审轮次：R3
- 候选：`f59ccbcd5cacf03a82a5fef0c223a38acd0f0e57`
- 分支：`codex/vnext-1-g1i-final-r3`
- 工作树：`/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext1-g1i-final-r3`
- 前序裁决：`.codex/reviews/vnext-1/g1i-final-l3/`、`.codex/reviews/vnext-1/g1i-final-l3-r2/`
- 修复报告：`g1i-fix-knowledge`、`g1i-fix-portability`、`g1i-r2-fix-orphan`、`g1i-r2-fix-sensitivity`

## 复审范围

1. 逐项复核前两轮 5 个 P1：历史删除/改名秘密、物理扫描 post-commit 原子性、v2 URL portability 覆盖、孤立 execution variables、Knowledge 与 DSL 敏感 key 策略漂移。
2. 独立攻击历史密码/上传/URL、execution snapshot/variables、旧版本恢复和 SQLite/WAL/SHM raw/escaped bytes。
3. 独立攻击物理扫描失败和最后事务故障点，逐字段核对 current、schema、revision、versions、recent 与 execution 全回滚。
4. 验证孤立四敏感名与普通未知名保守清除，已定义非敏感变量保持不变。
5. 验证统一敏感 helper 不可变，并检查 Flow DSL portability/upgrade 与 Knowledge 对 raw key、大小写、`.`/`_`/`-`、query/hash/malformed/userinfo、单层/双层 percent encoding 的一致性。
6. v2 import 必须零写且物理零 canary，export 必须 fail closed，所有错误不得包含 canary；v1 正向运行与 v2 副作用前拒绝保持不变。
7. 执行 Node24 等价定向门禁；若独立攻击已确定 P1，则按协调指令停止尚未开始的 Node20 长矩阵并准确记录，不得虚报。

## 判定标准

`PASS` 仅允许 `P0=0`、`P1=0` 且 `required_fixes=[]`；否则为 `REVISE`。
