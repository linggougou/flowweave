## 结论

**REVISE（74/100）**。候选 `fc571530d6224af04c24874591bed62d04845a07` 对格式良好的 raw、一层和两层编码 userinfo 已正确硬化，但 R4 独立攻击发现 malformed percent 可关闭相邻编码模板变量的敏感识别。当前为 `P0=0 / P1=1 / P2=0`；Node20 按任务允许的新 P1 提前停止条件未启动。

## 为什么

- `decodePercentEncodingAtMostTwice` 对整个 userinfo 调用 `decodeURIComponent`。同片段只要存在一个 `%ZZ` 等非法转义，本轮解码就全部失败，合法 `%7B%7Bcredential%7D%7D` 或双层编码模板也保持编码态。
- `inspectUrlUserInfo` 随后仍返回 `removed:true` 与 `variableNames:[]`。portability 会删除 URL authority，却保留 `credential.defaultValue`；upgrade preview 将 mapping 标为 `sensitive:false`，返回 `blockingIssues=[]` 且 candidate/report 含 canary。
- 公开 `exportFlow` 与 `importFlow` 均返回含复杂 canary 的 v1 文档；导入目标 `store.sqlite` 命中 JSON-escaped canary。actual upgrade 被历史敏感材料扫描兜底为 `FLOW_UPGRADE_BLOCKED` 且 revision/schema 保持 `1/1`，但这不能补救 preview 与导入导出泄漏。
- Node24 修改包回归仍为 DSL `92/92`、Knowledge `151/151`、Local API `14/14`，三包 typecheck/lint/build 通过。这说明缺口是攻击矩阵遗漏，不是环境或普通回归失败。

## 必须修改

1. 统一 helper 不得把“userinfo 解码失败”静默等同于“没有敏感变量”。对 malformed percent 应进行不受无关坏转义连坐的有限识别，或返回显式 unsafe/ambiguous 并让 portability、preview、export/import fail closed。覆盖 navigate/wait、username/password 两侧、单/多变量、raw/一/两轮编码，以及非法转义位于变量前后或另一侧；所有 preview/candidate/report、warnings/errors、API、export/import 和 SQLite/WAL/SHM raw+escaped 必须零 canary，actual upgrade 失败必须零写。
2. 修复后在同一组合候选重放前三轮六类 P1 与 malformed 矩阵，并真实完成 Node20.19.6 的 PATH/execPath、frozen force install、39/39 0 cache、739 tests、DSL92、Knowledge151、Local14、Runtime52、Studio219 和 v1 login4/4。

## 证据

- R4 Node24：修改包与直接消费者 `257/257`；三包 typecheck、lint、build 全通过；frozen install 与 lockfile 哈希一致。
- DSL 攻击：navigate 单层编码 username + malformed password、wait 双层编码 password + malformed username 均得到 `variableNames=[]`、portable default 保留、mapping `sensitive:false`、`blockingIssues=[]`、candidate/report 含 canary。
- Knowledge 公开路径：`exportContainsCanary=true`、`importContainsCanary=true`、目标 `store.sqlite raw=false / escaped=true`；WAL/SHM 不存在。
- actual upgrade：`FLOW_UPGRADE_BLOCKED`，错误 message/details 零 canary，current 仍为 revision `1`、schema `1`。
- Node20：未执行。新 P1 确认时尚未进入 Node20 安装，本评审没有继承或虚报组合候选的 39/39、0 cache 或测试计数。
