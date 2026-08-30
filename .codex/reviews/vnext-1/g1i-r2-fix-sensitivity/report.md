# vNext-1 G1-I R2 统一敏感 URL 策略修复报告

日期：2026-08-30
基线：`eb74ca52c580a6f403548e54b11c362e07a660f4`
分支：`codex/vnext-1-g1i-r2-sensitivity`
结论：**PASS**

## 修复范围

- 在 `@flowweave/flow-dsl` 新增纯函数合同：
  - `normalizeSensitiveParameterKey`
  - `isSensitiveParameterKey`
  - 冻结审计词表 `SENSITIVE_PARAMETER_KEYS`
- 规范化仅执行至多两轮 percent decode，再折叠大小写及 `.`、`_`、`-` 分隔符。
- 词表通过 `Object.freeze([... ] as const)` 导出，实际判定 `Set` 为模块私有，调用者不能在运行时修改安全策略。
- Flow DSL portability、v1→v2 upgrade、Project Knowledge 历史敏感材料扫描以及 v2 import/export URL 门禁全部调用同一键判定函数。
- URL 的 query/hash/malformed/userinfo 结构遍历仍留在各自领域；userinfo 无条件视为凭据。
- 删除 Knowledge 本地敏感键正则、键集合及本地键规范化逻辑。
- 未修改 lockfile、依赖、`sanitizeUpgradeHistory` 后部逻辑、物理擦除逻辑或 `vnext-persistence.test.ts`。

## TDD RED 证据

依赖首次缺失的 `vitest not found` 只作为环境准备，不计业务 RED；执行 `CI=1 pnpm install --frozen-lockfile` 后获取正式红灯。

1. Project Knowledge Judge：`src/import-flow.test.ts`
   - 结果：46 项中 **4 failed / 42 passed**。
   - 四个正式红灯均为 raw `key` 被放行：navigate/wait × import/export。
   - 证明旧 Knowledge 子串正则与 DSL 精确词表存在平行且不一致的策略。
2. Flow DSL 统一合同与消费者 Judge：
   - 结果：**14 failed / 28 passed**。
   - 12 项因统一 helper/冻结词表尚未实现而失败。
   - portability 对双层 percent 编码键未变量化。
   - upgrade 未将 wait 双层编码键对应变量标记为敏感。

RED 矩阵覆盖：raw `key`、混合大小写、`.`/`_`/`-`、query、fragment-query、malformed URL、userinfo、单层与双层 percent 编码；每类均覆盖 navigate 与 wait，并在 Knowledge 中覆盖 import 与 export 双端。

## GREEN 与安全断言

- 统一 helper + portability + upgrade：**42/42**。
- v2 import/export 攻击矩阵：**46/46**。
- import 失败前后 Flow 列表相同；SQLite、WAL、SHM 均无 canary 字节命中。
- import/export 错误序列化内容均不含 canary；export 无返回文档。
- 第三层 percent 编码不越过明确的两轮解码上限，避免调用点各自追加不一致解码。
- `monkey`、`password_policy`、`authentication` 等近似业务键不误判。

## 完整验证

运行时：Node `v24.14.0`、pnpm `9.15.4`，frozen install 成功，lockfile 未变化。

| 命令 | 结果 |
|---|---:|
| `pnpm --filter @flowweave/flow-dsl --filter @flowweave/project-knowledge --filter @flowweave/local-api test` | PASS：77 + 149 + 14 = **240** |
| `pnpm typecheck` | PASS：**21/21 tasks** |
| `pnpm lint` | PASS：**13/13 tasks** |
| `pnpm build` | PASS：**13/13 tasks** |
| `git diff --check` | PASS |

## 范围审计

- `repository.ts` diff 仅位于导入区、历史 URL 敏感值前部及 v2 URL portability helper/调用点；没有后部 execution 清理 diff。
- 没有 `pnpm-lock.yaml`、依赖配置或生成产物差异。
- 没有修改 `vnext-persistence.test.ts`。

## 残余风险

- 判定合同刻意采用冻结的明确词表，不对任意包含敏感子串的业务键做启发式拦截；新增正式凭据别名时必须扩展该唯一词表及合同测试。
- 两轮 percent decode 是明确安全边界；更深层编码不会被本合同继续解码，避免跨调用点出现无限或不一致解码，但若产品未来要求拦截更深编码，需要通过合同变更而非在消费者中私加策略。
