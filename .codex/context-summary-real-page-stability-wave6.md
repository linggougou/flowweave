## 项目上下文摘要（真实页面稳定性 Wave 6）

生成时间：2026-06-07 01:52:00 CST

### 1. 相似实现分析

- **实现 1**: `packages/page-intelligence/src/fragility.ts`
  - 模式：对 `FlowDocument` 做静态脆弱性体检，输出 `FragilityIssue[]`。
  - 可复用：`analyzeFlowFragility()`、`inspectStep()`、`inspectContextualStep()`、`extractTargetVariableNames()`。
  - 需注意：当前结构已经支持 `MISSING_ENVIRONMENT`、`MISSING_VARIABLE`，但交互类脆弱性仍只覆盖 `click / fill`，没有覆盖 `select / setChecked / upload / press(target)`。

- **实现 2**: `packages/runtime/src/playwright-runner.ts`
  - 模式：运行时在失败分支统一补截图、页面快照，并且只对可提取 `TargetDiagnosticContext` 的错误写 `step-<n>-diagnostic.json`。
  - 可复用：`buildTargetDiagnosticError()`、`capturePageSummary()`、`writeStepDiagnostic()`、`runStep()` 的统一失败收口。
  - 需注意：当前诊断 JSON 结构是“定位失败专用”，导航失败、`wait` 缺少 `target`、上传文件错误等非定位类失败仍没有结构化诊断上下文。

- **实现 3**: `apps/studio/src/shared/studio-api-types.ts` + `apps/studio/electron/services.ts`
  - 模式：Studio 通过 `readStepArtifacts()` 直接读取 runtime 落盘的 JSON，并映射成渲染层 DTO。
  - 可复用：`ExecutionStepLog.diagnostic`、`readJsonArtifact()`、`mapRuntimeSteps()`、`mapStoredExecutionToStudioExecution()`。
  - 需注意：当前 `StudioStepDiagnostic` 只认 `url/title/strategyAttempts/targetHints`，天然假设诊断一定来自 Target 定位失败。

- **实现 4**: `apps/studio/src/DiagnosticInspector.tsx` + `apps/studio/src/shared/failure-insights.ts`
  - 模式：先把失败归类成 `ambiguous-target / hidden-target / missing-target / execution-error`，再渲染诊断工作台与修复建议。
  - 可复用：`buildFailureInsight()`、`buildAmbiguityClues()`、`buildDiagnosticRepairSuggestions()`。
  - 需注意：现有 UI 已经能很好消费目标歧义诊断，但没有“通用步骤失败诊断”的首屏语义。

- **实现 5**: `packages/runtime/src/playwright-runner.test.ts`
  - 模式：既覆盖手写 Flow，也覆盖 `parseRecordedEvent() -> buildFlowFromEvents() -> executeFlow()` 的 recorded replay。
  - 可复用：`buildRecordedFlowMeta()`、本地临时 fixture 写法、artifact 断言方式。
  - 需注意：当前已经覆盖目标歧义诊断 JSON，但还没有证明非定位类失败也会写统一诊断 JSON。

### 2. 项目约定

- **命名约定**：
  - 真实页面增强文档继续使用 `real-page-stability-waveX-*`。
  - 运行时诊断 JSON 文件名继续沿用 `step-<n>-diagnostic.json`。
  - 新增诊断类型与字段优先走 `kind / message / errorCode / stepType` 这类平直字段，避免深层嵌套。

- **文件组织**：
  - 静态体检在 `packages/page-intelligence/src/**`。
  - runtime 诊断落盘与失败收口在 `packages/runtime/src/**`。
  - Studio DTO、artifact 读取和 UI 消费在 `apps/studio/**`。
  - 本轮不新增新的 Electron IPC 通道，继续复用 `diagnosticPath / pageSnapshotPath`。

- **导入顺序**：
  - Node 内置 -> workspace 包 -> 本地模块。
  - 类型导入优先 `import type`。

- **代码风格**：
  - TypeScript strict。
  - 文档与注释简体中文，标识符英文。
  - 优先扩展现有错误模型与 UI 渲染，不新建平行诊断体系。

### 3. 可复用组件清单

- `packages/page-intelligence/src/fragility.ts`
  - `analyzeFlowFragility()`
  - `extractTargetVariableNames()`
- `packages/runtime/src/playwright-runner.ts`
  - `buildTargetDiagnosticError()`
  - `capturePageSummary()`
  - `writeStepDiagnostic()`
- `apps/studio/electron/services.ts`
  - `readStepArtifacts()`
  - `mapRuntimeSteps()`
- `apps/studio/src/shared/failure-insights.ts`
  - `buildFailureInsight()`
  - `formatPageSnapshotSummary()`
- `apps/studio/src/shared/repair-suggestions.ts`
  - `buildDiagnosticRepairSuggestions()`
- `packages/runtime/src/playwright-runner.test.ts`
  - 现有 artifact / diagnostic JSON 断言模板

### 4. 测试策略

- **基线验证（已执行，Node 20.19.6）**：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test -- fragility.test.ts`
    - 结果：通过，`12/12`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- src/shared/failure-insights.test.ts DiagnosticInspector.test.tsx`
    - 结果：通过，`6/6`

- **本轮新增覆盖重点**：
  - `fragility.ts` 是否把 `CSS_ONLY / CSS_NTH_OF_TYPE / TEXT_ONLY / NO_STRATEGIES` 扩展到 `select / setChecked / upload / press(target)`。
  - runtime 是否会为非定位类失败写统一的 `step-<n>-diagnostic.json`。
  - Studio 是否能把通用失败诊断展示成可读摘要，而不是只会渲染策略尝试表格。

- **预计验收命令**：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test -- fragility.test.ts`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- src/shared/failure-insights.test.ts DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`

### 5. 依赖和集成点

- **静态分析链路**：
  - `FlowDocument` -> `analyzeFlowFragility()` -> `FragilityNotice` / `Execution fragility`
- **运行时诊断链路**：
  - `runStep()` 失败 -> `diagnosticPath` / `pageSnapshotPath` -> `readStepArtifacts()` -> `DiagnosticInspector`
- **历史执行链路**：
  - `project-knowledge` 只持久化 `diagnosticPath`，Studio 在读取执行时再反解 JSON。

### 6. 技术选型理由

- **为什么本轮优先做通用失败诊断**：
  - 目标歧义已经显著改善，但真实页面仍会在环境、步骤约束、上传文件、页面状态等阶段失败；没有统一结构化诊断时，Studio 只能退回原始 message。

- **为什么本轮优先扩展 fragility 覆盖范围，而不是继续扩 fixture**：
  - `p7` 已有 `19` 个 fixture，继续横向加矩阵不一定能暴露“录出来为什么不稳”；把静态体检覆盖到更多步骤类型，能更早在执行前暴露风险。

- **为什么继续复用 `diagnosticPath` 落盘，而不是新建数据库字段**：
  - 现有 `readStepArtifacts()` 已经能把 JSON 拉回 Studio，本轮只需扩充 JSON 协议和 UI 消费即可。

### 7. 关键风险点

- **协议漂移风险**：
  - runtime 与 Studio 当前各自维护诊断结构，若本轮不先定统一 envelope，容易一边扩字段、一边读不到。

- **误报风险**：
  - fragility 若直接把所有 target-bearing step 一股脑套用 `CSS_ONLY`，需要确认 `upload`、`press(target)` 的提示文案仍然成立。

- **UI 回退风险**：
  - Studio 现有诊断面板大量假设 `strategyAttempts` 存在；若不做 discriminated union，通用诊断很容易把现有歧义诊断渲染打坏。

- **回归盲区**：
  - runtime 当前只对 Target 失败写 diagnostic JSON 的测试是绿的，但不能证明通用失败 JSON 不会遗漏 `url / title / errorCode`。

### 8. 推荐主题

- **Wave 6 主题**：`通用失败诊断 + 多步骤脆弱性预警`
- **推荐并行轨道**：
  1. `Fragility Multi-Step Coverage`
  2. `Runtime Generic Diagnostic Envelope`
  3. `Studio Unified Failure Insight`
- **主代理集成职责**：
  - 维护统一诊断 envelope 契约
  - 跑 Node 20 分层验收
  - 合并后补仓库级留痕与工作区回收
