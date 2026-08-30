## 结论

**REVISE（73/100）**。候选 `f59ccbcd5cacf03a82a5fef0c223a38acd0f0e57` 已关闭首审与 R2 的 5 个 P1，但 R3 独立攻击发现新的 v1 userinfo 变量泄漏，当前为 `P0=0 / P1=1 / P2=0`，且 Node20 组合门禁按协调指令在确定 P1 后未启动，因此不满足最终 PASS 条件。

## 为什么

- 历史删除/改名秘密、密码字面量、上传、敏感 URL、execution snapshot/variables 与旧版本恢复已在 API 和 SQLite/WAL/SHM raw/escaped 层零命中；物理扫描失败与最后事务故障也都完整回滚。
- 孤立四敏感名和普通未知名已按 fail-closed 策略删除，已定义非敏感变量保留；统一 key helper 确实冻结，raw key、大小写、`.`/`_`/`-`、query/hash/malformed/userinfo、单层/双层编码的 v2 import/export 20 组合全部通过。
- 但 Flow DSL 只从 query/hash 收集敏感变量引用，随后独立删除 authority userinfo。`navigate.url` 与 `wait.urlIncludes` 中的 username/password 变量没有进入敏感集合，因此 portability 保留它们的 `defaultValue`，upgrade mapping 也标为 `sensitive:false`。
- raw userinfo 会因混合模板阻塞升级，但 v1 `exportFlow` 与 `importFlow` 仍携带默认秘密，导入目标 SQLite 出现 escaped canary。percent-encoded userinfo 更会得到 `blockingIssues=[]` 的升级预览，并在 candidate/API 中包含默认秘密。

## 必须修改

1. 在删除 authority userinfo 前统一提取并标记其全部变量引用。必须同时覆盖 navigate 与 wait、username/password 两侧、单变量与多变量/混合 authority、raw 与最多两轮 percent decoding；portability 删除相关 default 并把变量设为必填，upgrade mapping 标为敏感且不得生成含值 candidate。补齐 v1 import/export、升级预览/提交、API 与 SQLite/WAL/SHM raw/escaped 零 canary，以及 warning/error 零回显测试。
2. 产品修复完成后，在同一组合候选上完成真实 Node20.19.6 frozen force install、execPath 核对、39/39 uncached typecheck/test/build，并记录总测试数、Knowledge150、DSL77、Local14、Runtime guard、Studio 与 v1 login；不得继承或外推旧候选计数。

## 证据

- R3 Node24：DSL `77/77`、Knowledge `150/150`、Local API `14/14`、Runtime guard `9/9`、Studio `219/219`，共 `469/469`；v1 login `4/4`；修改包 typecheck/lint/build 全通过。
- 既有 P1 重放：历史/恢复与孤立变量 API、SQLite/WAL/SHM 零命中；两个事务故障状态全等；v2 URL 20 组合的 import 拒绝/零写/物理零命中/export 拒绝/错误零 canary 均 `20/20`。
- userinfo DSL 矩阵：navigate/wait × raw/encoded × 单/多变量共 `8/8` portable 文档保留 default，mapping 均 `sensitive:false`；encoded `4/4` candidate 含两个 canary。
- repository 探针：`exportContainsCanary=true`、`importContainsCanary=true`、目标 `store.sqlite escaped=true`，尽管两个 URL authority 已被删除。
- Node20：未执行。确定 P1 时尚未开始重装，按协调指令停止长矩阵；本评审没有虚报任何 f59ccbc 的 Node20 结果。
