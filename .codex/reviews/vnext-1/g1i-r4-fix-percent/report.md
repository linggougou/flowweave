# vNext-1 G1-I R4 malformed-percent userinfo 修复报告

## 结论

- Verdict：**PASS**
- 基线：`7e72538010b1aaf1a7214e5d492be76a939bd3f9`
- 验证环境：Node `v24.14.0`、pnpm `9.15.4`
- 依赖安装：`CI=1 pnpm install --frozen-lockfile` 成功，lockfile 未修改
- 生产实现仅修改 `packages/flow-dsl/src/sensitivity.ts`；其余修改均为约定范围内测试与本报告。

## RED 证据

在修改实现前先加入攻击回归并运行：

```text
pnpm --filter @flowweave/flow-dsl exec vitest run \
  src/sensitivity.test.ts src/portability.test.ts src/upgrade.test.ts --reporter=verbose

Test Files 3 failed (3)
Tests 11 failed | 58 passed (69)
```

失败覆盖：

- `navigate.url` 与 `wait.urlIncludes`；
- username、password、单变量与多变量；
- 一层、两层 percent 编码；
- 非法 `%` 位于变量前、变量后、同侧变量中间及 userinfo 另一侧；
- portability 默认值未硬化、upgrade mapping 未标敏感、helper 未提取变量。

Knowledge 公共边界的基线 RED：

```text
pnpm --filter @flowweave/project-knowledge exec vitest run \
  src/import-flow.test.ts --reporter=verbose

Test Files 1 failed (1)
Tests 1 failed | 48 passed (49)
```

失败表现为 export/import 结果仍包含 raw/JSON-escaped canary。另一个 raw-mixed 实际升级阻塞测试在 RED 阶段已通过，证明既有 blocking 行为未被测试误写。

## 最小修复

统一有限解码器改为：

1. 每轮只匹配连续合法 `%HH` run，非法 percent 片段原样保留；
2. 合法 run 优先整体 `decodeURIComponent`，确保 UTF-8 多字节字符正确解码；
3. run 自身含无效 UTF-8 时逐 token 回退：无效 token 原样保留，邻接合法 ASCII 编码仍可解码；
4. 总计最多两轮，不进行第三次 decode；
5. 两轮后 userinfo 仍含 percent-encoded brace 时以固定、无输入值的 `VALIDATION_FAILED` fail closed，禁止形成 `removed:true + []` 后继续携带变量 default；
6. `inspectUrlUserInfo` 成功返回仍仅包含安全 URL、`removed` 与变量名，不返回 userinfo 字面值。

第三层编码的公共行为：Flow DSL preview/export 固定报错 `URL userinfo percent 编码层级超出安全上限`；Knowledge import 的既有解析边界包装为固定报错 `Flow 文档格式无效`。两者都不包含 URL、变量名或 canary。

## GREEN 与安全断言

专项全量：

```text
@flowweave/flow-dsl          5 files / 109 tests passed
@flowweave/project-knowledge 6 files / 154 tests passed
@flowweave/local-api         1 file  / 14 tests passed
```

新增断言证明：

- malformed-percent 一/两层 userinfo 在 navigate/wait 均移除凭据并硬化所有引用变量；
- preview/candidate/export/import/warning/error 均不含 raw 或 JSON-escaped canary；
- 目标 SQLite、WAL、SHM 均无 raw 或 escaped canary；
- raw mixed 仍 blocking，实际 `upgradeFlowToV2` 失败后 revision、versions、recent values 均未变化；
- 合法 Unicode 与模板位于同一连续 run 时正确识别；
- invalid UTF-8 token 保持原样，不会被错误解释为模板，邻接合法模板编码仍独立识别；
- 第三层编码不越过两轮上限，export/import/preview 固定 fail closed，目标项目保持零 Flow 且存储零 canary；
- 格式良好的一/两层编码、raw mixed、普通 URL、普通 query 的既有回归全部通过。

## 全仓门禁

```text
pnpm typecheck  21/21 tasks passed
pnpm lint       13/13 tasks passed
pnpm build      13/13 tasks passed
pnpm test       21/21 tasks passed, 759 tests passed
git diff --check passed
```

首次单独执行 Local API 测试时，干净 worktree 尚未生成 `@flowweave/project-knowledge` dist，出现 package entry 无法解析；按依赖拓扑执行全仓 build 后同一命令通过 14/14。该项属于构建顺序，不是产品失败。

## 范围与残余风险

- 未修改 Knowledge repository/事务实现、Runtime、Studio/UI 或 lockfile。
- 未修改 `portability.ts`、`upgrade.ts` 或 `index.ts`：两者已复用统一 helper，修复 helper 即覆盖调用边界。
- 为防止隐蔽三层模板泄漏，残留 percent-encoded brace 采用可用性优先级较低的 fail-closed；极少数把三层编码 brace 当作 userinfo 普通文本的输入也会被拒绝，这是明确的安全取舍。
- 解码仍有严格两轮上限；更深层编码不会被解释或自动修正。
- Node 20 复审未执行，按任务约定留给最终 Judge。
