## 项目上下文摘要（Wave 11 真实页面执行韧性扩展）

生成时间：2026-06-07 07:45:00 CST

### 1. 相似实现分析

- **实现 1**: `packages/runtime/src/playwright-runner.ts:1438-1522`
  - 模式：`fill / select / setChecked` 已统一走 `performRecoveredLocatorAction()`，支持一次重新定位后的补做。
  - 可复用：`performRecoveredLocatorAction()`、`resolveTarget()`、`waitForPageSettled()`。
  - 需注意：`click / press / upload` 仍是一发式执行，尚未共享这层恢复逻辑。
- **实现 2**: `packages/runtime/src/types.ts:31-56`
  - 模式：当前 `RuntimeErrorDiagnostic` 仍只有 `message / errorCode / cause / url / title`。
  - 可复用：现有 `cause` 字段已经为更细分类留下入口。
  - 需注意：尚无 `runtimeCauseCategory`、`recoveryTried`、`recoveredAttemptCount` 这类结构化观测字段。
- **实现 3**: `packages/runtime/src/playwright-runner.test.ts:1793-1884`
  - 模式：当前已经有受控输入补写、受控勾选补设两条 deterministic 回归。
  - 可复用：临时 fixture HTML 直接写入 `tmpdir()` 的测试写法、`executeFlow()` 闭环断言模式。
  - 需注意：还缺少 detached / 遮挡 / 短暂不可操作等动作瞬态红灯测试。
- **实现 4**: `examples/real-page-smoke.ts:1263-1355` 与 `examples/recorded-replay-smoke.ts`
  - 模式：`baseline / p5 / p6 / p7` 与 fixture catalog 已完成单一真相收口，recorded replay baseline 已覆盖 `21` 个真实 fixture + `1` 个运行期临时页。
  - 可复用：catalog、case set 构造、CLI 汇总与矩阵测试都已统一。
  - 需注意：`p8` 尚未建立，动作韧性场景继续塞进 `p7` 会放大默认矩阵维护成本。
- **实现 5**: `apps/studio/src/shared/studio-api-types.ts`、`failure-insights.ts`
  - 模式：Studio 目前已经能识别 `action-state-reset`，并对三类动作回弹 cause 输出中文说明与修复建议。
  - 可复用：descriptor map、`formatStudioDiagnosticCause()`、`buildDiagnosticRepairSuggestions()` 的文案风格。
  - 需注意：还不会解释 detached / intercepted / not-ready / not-editable 一类更广的 runtime 执行根因。
- **实现 6**: `docs/superpowers/specs/2026-06-07-real-page-stability-wave10-action-resilience-design.md`
  - 模式：仓库里已有更大范围动作韧性的设计草案。
  - 可复用：目标分类、P8 profile、三轨并行思路。
  - 需注意：该设计写作时主线仍未完成 `action-state-reset` 与 Benchmarks 文档收口，现状态已部分超前，需要按当前代码基线重写下一阶段计划。

### 2. 项目约定

- **命名约定**：
  - 下一阶段建议显式进入 `Wave 11`，避免继续复用已部分完成的 `Wave 10` 轨道名。
  - 轨道分支继续使用 `codex/real-page-wave11-*`。
- **文件组织**：
  - runtime 主链路集中在 `packages/runtime/src/playwright-runner.ts`
  - 真实页面 smoke 与录制回放 baseline 在 `examples/*`
  - Studio 失败洞察在 `apps/studio/src/shared/*` 与 `DiagnosticInspector.tsx`
- **代码风格**：
  - 注释和文档中文
  - 结构化错误分类优先放共享类型，再由 UI 消费

### 3. 可复用组件清单

- `packages/runtime/src/playwright-runner.ts`
  - `performRecoveredLocatorAction()`
  - `resolveTarget()`
  - `waitForPageSettled()`
  - `waitForNavigationPressSettled()`
- `examples/real-page-smoke.ts`
  - `buildRealPageCaseSets()`
  - `getRealPageFixtureCatalog()`
- `examples/recorded-replay-smoke.ts`
  - `RECORDED_REPLAY_CASE_ORDER`
  - `getRecordedReplayCaseCatalog()`
- `apps/studio/src/shared/studio-api-types.ts`
  - `getStudioActionStateResetDescriptor()`
  - `formatStudioDiagnosticCause()`

### 4. 测试策略

- **runtime 层**：
  - `packages/runtime/src/playwright-runner.test.ts`
  - 重点补 detached / 遮挡 / 暂不可操作的红绿灯
- **矩阵层**：
  - `packages/runtime/src/real-page-matrix.test.ts`
  - `packages/runtime/src/recorded-replay-matrix.test.ts`
  - `pnpm e2e:real-pages`
  - `pnpm e2e:recorded-pages`
- **Studio 层**：
  - `apps/studio/src/shared/failure-insights.test.ts`
  - `apps/studio/src/shared/repair-suggestions.test.ts`
  - `apps/studio/src/DiagnosticInspector.test.tsx`

### 5. 依赖和集成点

- **runtime -> Studio**
  - 通过 diagnostic JSON 与 `ExecutionStepLog.diagnostic` 贯通
- **runtime -> benchmarks**
  - 通过 smoke 与 matrix 证明恢复逻辑在真实 fixture 上稳定
- **benchmarks -> Studio**
  - 新的技术根因场景会为 Studio 提供更真实的 diagnostic 样本

### 6. 技术选型理由

- **为什么下一阶段优先做更广动作恢复**
  - 当前用户能直接受益的剩余大头在 `click / press / upload` 的一发式失败，而不是录制协议。
- **为什么先建 `p8` 而不是继续扩 `p7`**
  - `p7` 已承担默认兼容矩阵；把更重的动作韧性样本单独分层，回归成本更可控。
- **为什么 Studio 要等 runtime 结构化字段**
  - 仅靠字符串猜测可以先做一层，但想让 Studio 稳定解释更广失败根因，最好由 runtime 明确给出分类与恢复尝试信息。

### 7. 关键风险点

- **风险 1：动作恢复范围过宽会掩盖真实错误**
  - 需要坚持“白名单错误 + 最多一次恢复”的边界。
- **风险 2：P8 场景与 recorded replay 扩容可能影响默认回归时长**
  - 需要保留 `p7` 默认口径，把 `p8` 作为显式扩展档位。
- **风险 3：Studio 若先于 runtime 扩分类，容易与真实产物脱节**
  - 应优先以 runtime 新字段为单一事实来源，再做 Studio 洞察消费。
