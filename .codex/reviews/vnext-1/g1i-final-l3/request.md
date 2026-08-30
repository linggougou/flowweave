# vNext-1 G1-I 最终独立 L3 评审请求

- 评审对象：vNext-1A/1B 数据基础最终集成候选
- 候选提交：`02e758876afdf2708b341a5dbbd3694375d6571c`
- 实现候选提交：`cccd818aadee53f090caf7bf6c0f265d9e8beb8f`
- 计划基线：`8f83604`
- 评审分支：`codex/vnext-1-g1i-final-judge`
- 评审级别：L3
- 评审日期：2026-08-30

## 评审范围

1. schema v1/v2、升级预览、确定性身份、引用白名单与错误合同。
2. revision/CAS、升级/保存/恢复原子性、历史清理、最近值和导入导出。
3. 敏感值在 Flow、版本、execution、API、导出、SQLite/WAL/SHM、日志与错误中的零泄漏。
4. Runtime、Studio、Knowledge、Local API 与既有消费者对 v2 的副作用前拒绝。
5. v1 正向回放、Node 20/24 兼容、全仓回归与候选范围。

## 独立性与边界

- Judge 未参与候选实现，只在独立 worktree 中审查。
- 评审前工作树为 clean，HEAD 与指定候选一致。
- 不修改产品代码、配置、lockfile、路线锁、operations-log 或 verification-report。
- 既有 G1A/G1B/G1-I 评审与双 Node 报告仅作为待核证证据；最终结论以代码追踪、fresh 验证和独立攻击探针为准。

## 裁决规则

PASS 必须同时满足 `P0=0`、`P1=0`、`required_fixes=[]`。任一安全、原子性、旧消费者隔离或 v1 回归硬门失败均返回 REVISE。
