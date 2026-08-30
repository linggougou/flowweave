# vNext-1 G1-I v2 URL portability P1 修复报告

- 时间：2026-08-30 16:42:30 +0800
- 分支：`codex/vnext-1-g1i-fix-portability`
- 基线：`00d5f9f2e81cb4b0845ff0b9e23e16950834b2f6`
- 结论：**GREEN，P1 URL portability 旁路已修复**

## 范围

本轨只修改：

- `packages/project-knowledge/src/repository.ts` 前部 `assertPortableV2Document` 与其专用 URL security helper；导入、导出继续复用同一断言。
- `packages/project-knowledge/src/import-flow.test.ts` 的 URL portability 攻击矩阵。
- 本报告。

未修改 `upgradeFlowToV2`、`sanitizeUpgradeHistory`、`assertPhysicalSecretErasure`、`vnext-persistence.test.ts`、依赖、配置或 lockfile。

## TDD RED

依赖安装后，先只提交测试变更运行：

```text
pnpm --filter @flowweave/project-knowledge exec vitest run src/import-flow.test.ts --reporter=verbose
```

结果为 **12 failed / 14 passed / 26 total**，稳定复现正式 Judge：

- navigate fragment-query：raw key、百分号编码/大写 hex key，import/export 双端共 4 个红灯。
- wait.urlIncludes：query、fragment-query、userinfo、百分号编码/大小写 key，import/export 双端共 8 个红灯。
- 既有 navigate 普通 query、大小写 key、userinfo、query 编码 key 仍通过，证明红灯集中在真实覆盖缺口。

实现第一轮结构化解析后，又新增不可规范化 absolute URL 的攻击：

```text
https://[invalid-host]?token=<synthetic-canary>
```

定向结果为 **2 failed / 26 skipped**，证明仅依赖 `new URL()` 且解析失败后放行仍有旁路。随后补充只用于解析失败路径的 query/fragment/authority 结构 fallback。

新 worktree 初次运行 Vitest 曾因尚未 frozen install 返回 `vitest not found`；安装后才取得以上功能 RED。另一次先单跑 DSL 时因 shared dist 尚未构建导致 4 suites 收集失败、0 tests；按包依赖 build 后同一回归恢复 61/61。这两项均为环境/验证顺序证据，不冒充功能红灯。

## 最小修复

统一 URL 凭据检测覆盖 `navigate.url` 与 `wait(condition=urlIncludes).urlIncludes`：

1. 使用固定无外部请求的 base 解析绝对/相对 URL。
2. authority 中存在 username/password 即拒绝。
3. 检查普通 query key，按既有 `token|secret|password|passwd|api[-_]?key|auth` 策略匹配。
4. 检查 fragment-query，同时覆盖 `#?key=value`、带路径的 hash query 和 OAuth 风格直接 fragment 参数。
5. key 在 `URLSearchParams` 解码后再做有限二次 percent decode，覆盖大小写 percent hex 与编码 key，且避免无限解码。
6. `new URL()` 无法规范化时，只对原字符串的 query、fragment 与 authority 做结构 fallback；命中凭据仍 fail closed，未命中则保留既有同版本语义。
7. 错误消息恒定，不包含 URL 或 canary。import 继续收敛为 `Flow 文档格式无效`；export 返回固定 URL 凭据错误。

## GREEN 证据

| 门禁 | 结果 |
|---|---|
| URL import/export 攻击矩阵 | 28/28 PASS（11 种 URL 攻击 × 双端 + 6 个既有用例） |
| 全 `@flowweave/project-knowledge` | 128/128 PASS，6/6 files |
| `@flowweave/flow-dsl` | 61/61 PASS |
| `@flowweave/local-api` | 14/14 PASS |
| Knowledge typecheck / lint / build | PASS |
| 全仓 `pnpm typecheck` | 21/21 tasks，0 cached，PASS |
| 全仓 `pnpm lint` | 13/13 tasks，0 cached，PASS |
| 全仓 `pnpm build` | 13/13 tasks，PASS |
| `git diff --check` | PASS |
| `pnpm-lock.yaml` | 零改动 |

攻击矩阵为每次导入使用独立临时项目和唯一合成 canary。失败导入断言 Flow 列表不变，并扫描项目 SQLite、WAL、SHM 均无 canary；导入/导出错误序列化均无 canary，导出无返回文档。v1 与安全 v2 的既有同版本导入导出回归保持通过。

## 残余风险与边界

- 当前 v2 schema 的 URL-bearing portability 槽位是 `navigate.url` 与 `wait.urlIncludes`，均已覆盖；未来新增 URL-bearing step 时必须显式接入同一 helper 或把遍历提升到 schema 级策略。
- 敏感 key 词表沿用既有策略，本轨没有扩大为任意业务参数值扫描，以免把普通 URL 全部判为秘密；词表扩展应走独立安全需求与测试。
- 当前项目未配置本轮可直接使用的 coverage provider；未新增依赖，改以 22 个 import/export 安全分支断言、全包 128 项回归及全仓门禁作为覆盖证据。
- 本轨只关闭正式 Judge 的 URL portability P1，不裁决另外两项升级历史/物理原子性 P1，也不替代合并后独立复审。
