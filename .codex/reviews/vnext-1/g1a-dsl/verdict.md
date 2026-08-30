# 结论

**REVISE（75/100）**。基于基线 `37cf7179ce156309c2c57063662b20d53a4fbc1f` 对候选 `a739ef8af517c67cfc258b35c52373cf0804865e` 的独立 L3 审查结果为：`P0=1 / P1=2 / P2=0`。v2 strict schema、七类 binding allowlist、跨步骤校验、错误脱敏、常规迁移确定性和目标包门禁整体扎实，但当前候选不能独立通过 vNext-1A 出口。

# 为什么

- **P0：公共 parser 类型回归让全仓硬门禁失败。** `parseFlowDocument` 在 `packages/flow-dsl/src/parsers.ts:51` 返回 `AnyFlowDocument` 后，现有 v1-only 调用方没有收口。fresh `pnpm typecheck` 首先在 `packages/ai-orchestrator/src/generate.ts:37` 报 `TS2322`；定向检查还确认 `packages/project-knowledge/src/repository.ts:401,837,880,1470,1518` 和 `apps/extension/lib/export-download.ts:85` 存在同类回归。默认常量仍为 v1 不足以证明 v1 兼容，当前分支无法独立集成。
- **P1：迁移的密码目标启发式偏离既有 portability 规则。** `packages/flow-dsl/src/upgrade.ts:84-104` 在 `inputType` 明确为 `text` 时仍继续按 selector/name 中的 `password` 字样判敏；既有 `packages/flow-dsl/src/portability.ts:82-105` 则把显式非 password 类型作为优先事实。攻击样例 `inputType=text + #password-policy-note` 中，portability 保留普通 `PUBLIC_NOTE` default，upgrade 却误标 `sensitive=true` 并移除 default。后续接入原子升级会把误判传播到历史清理和 remember 策略。
- **P1：fieldId seed 存在可构造的边界歧义。** `packages/flow-dsl/src/upgrade.ts:311` 使用 `${flow.id}${index}${variable.name}`；同一 Flow 中 `variables[1].name="23"` 与 `variables[12].name="3"` 得到完全相同的 hash 输入与 fieldId。实现会 fail closed 为 `CANDIDATE_INVALID`，不会产出错误候选，但会让本可迁移的合法 v1 Flow 无法升级，不满足“每变量唯一的确定性映射”。
- 生成的 `input_<hash>` 与既有 browser stepId 冲突时阻塞迁移，符合冻结设计“生成后仍重复 ID 必须 blocking”的合同，因此不列为 finding。

# 必须修改

1. 在保持 `parseFlowDocument` 为 v1/v2 版本分派器的前提下，显式收口全部旧 v1-only 调用方或提供兼容类型边界；`pnpm typecheck` 必须全仓通过，并证明 v2 不会进入旧 repository、extension、AI 或 Runtime v1 路径。
2. 让 upgrade 与既有 portability 共用同一 password target 判定；至少恢复“显式 `inputType` 非 password 时不再使用名称/selector 启发式”，并增加 `password-policy` 普通文本输入回归。
3. 把 fieldId seed 改为无歧义边界编码（例如长度前缀或 canonical tuple），保持跨环境确定性，并为 `index/name` 拼接歧义增加回归测试。

# 证据

- 候选与范围：HEAD 精确为 `a739ef8af517c67cfc258b35c52373cf0804865e`；差异仅涉及 `packages/shared` 与 `packages/flow-dsl` 的 12 个文件；写审查包前 worktree clean。
- 目标包 fresh 门禁：shared `7` tests、flow-dsl `59` tests、recorder `54` tests 全绿；三个包各自 typecheck/lint/build 均通过。fresh worktree 首次并行运行因上游 `dist` 尚未生成失败，按 `shared -> flow-dsl -> recorder` 顺序重跑后通过。
- 静态门禁：候选文件 Prettier 通过；`git diff --check 37cf7179..a739ef8` 通过。
- 全仓门禁：`pnpm typecheck` 失败，首个确定性候选回归为 `packages/ai-orchestrator/src/generate.ts:37 TS2322`。
- 对抗验证：显式非 password 输入被误判 sensitive；`index=1/name=23` 与 `index=12/name=3` 生成相同 fieldId；两项均可稳定复现。
- 稳定性验证：自实现 SHA-256 对 507 个 ASCII、Unicode、孤立 surrogate 与随机样本和 `node:crypto` 零差异；不同对象键插入顺序 canonical JSON 相同；敏感 default canary 未进入公开 parser error。
