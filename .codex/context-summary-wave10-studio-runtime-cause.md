## 项目上下文摘要（Wave 10 Studio runtime cause 消费）

生成时间：2026-06-07 07:00:00 CST

### 1. 相似实现分析

- **实现 1**: `apps/studio/src/shared/failure-insights.ts`
  - 模式：先按 target-resolution / runtime-error / page-snapshot 做失败分类，再输出 `categoryLabel`、`summary` 与 `recommendedAction`。
  - 可复用：`resolveRuntimeErrorSummary()`、`resolveInsightCategory()`、`resolveInsightTitle()` 已经承接了 runtime-error 的基础展示。
  - 需注意：当前 runtime-error 统一落到 `execution-error`，没有继续消费 `diagnostic.cause`。
- **实现 2**: `apps/studio/src/shared/repair-suggestions.ts`
  - 模式：只对 target-resolution 生成结构化修复建议，最后用 fallback 建议兜底。
  - 可复用：`dedupeSuggestions()`、优先级排序、已有中文 action/reason 文案风格。
  - 需注意：runtime-error 完全没有专门的 suggestion builder。
- **实现 3**: `apps/studio/src/DiagnosticInspector.tsx`
  - 模式：顶部 insight 卡片负责“先看什么”，下方诊断表负责展示 `errorCode / cause / url / title` 细节。
  - 可复用：详情表已经能展示 `cause`，因此本轮更适合补“分类与建议”，不必新增数据通路。
  - 需注意：顶部“失败类别 / 优先排查 / 下一步”仍看不到 runtime cause 语义。
- **实现 4**: `apps/studio/src/shared/execution-history.ts` 与 `apps/studio/src/studio-client.ts`
  - 模式：执行历史会把知识库中的 `diagnostic / pageSnapshot / pageSnapshotPath` 原样映射到 Studio。
  - 可复用：diagnostic 字段已经能从存储层流到前端，不需要改 API 或数据库。
  - 需注意：如果只做 Studio 共享层修改，就能覆盖历史执行与新执行两条链路。
- **实现 5**: `packages/runtime/src/playwright-runner.ts`
  - 模式：target-resolution 与 runtime-error 都会写 `StepDiagnostic`，其中 runtime-error 带 `errorCode` 与 `cause`。
  - 可复用：`buildRuntimeErrorDiagnostic()` 和 `performRecoveredLocatorAction()` 已经产出可稳定匹配的 cause，例如 `fill-value-reset`、`select-value-reset`、`checked-state-reset`。
  - 需注意：除这三类显式 cause 外，其余 cause 多来自 Playwright / Error 原文，适合做关键词归类而不是硬编码全量枚举。

### 2. 项目约定

- **命名约定**：
  - Studio 共享逻辑文件集中在 `apps/studio/src/shared/`
  - 测试文件与实现文件同目录，命名为 `*.test.ts` / `*.test.tsx`
- **文件组织**：
  - `failure-insights.ts` 负责高层摘要
  - `repair-suggestions.ts` 负责结构化行动建议
  - `DiagnosticInspector.tsx` 负责渲染工作台
- **代码风格**：
  - 中文文案简洁直接，优先“先做什么”的祈使句标题
  - 诊断规则倾向关键词归类 + 结构化推荐动作

### 3. 可复用组件清单

- `apps/studio/src/shared/failure-insights.ts`
  - `buildFailureInsight()`
  - `resolveRuntimeErrorSummary()`
- `apps/studio/src/shared/repair-suggestions.ts`
  - `dedupeSuggestions()`
  - `includesKeyword()`
- `apps/studio/src/shared/studio-api-types.ts`
  - `isRuntimeErrorDiagnostic()`
  - `isTargetResolutionDiagnostic()`
- `apps/studio/src/DiagnosticInspector.tsx`
  - 顶部 insight 卡片与下方 diagnostic 表格

### 4. 测试策略

- **测试框架**：Vitest
- **参考文件**：
  - `apps/studio/src/shared/failure-insights.test.ts`
  - `apps/studio/src/shared/repair-suggestions.test.ts`
  - `apps/studio/src/DiagnosticInspector.test.tsx`
- **覆盖要求**：
  - 至少覆盖一个 runtime-error 分类与 summary
  - 至少覆盖一个 runtime-error repair suggestion
  - 至少覆盖 DiagnosticInspector 顶部工作台对新分类/建议的渲染

### 5. 依赖和集成点

- **内部依赖**：
  - runtime 写入 diagnostic JSON 与知识库执行详情
  - studio-client / execution-history 把 diagnostic 映射到 `ExecutionStepLog`
  - failure-insights / repair-suggestions / DiagnosticInspector 消费 `ExecutionStepLog`
- **集成方式**：
  - 仅需修改 Studio 共享层与组件，不需要变更 runtime 协议和知识库存储

### 6. 技术选型理由

- **为什么优先做 Studio cause 消费**：
  - runtime 已经开始产出更明确的 cause，但当前工作台没有把这些信息转成用户能直接操作的建议。
- **为什么用“显式 cause + 关键词 fallback”混合策略**：
  - `fill-value-reset` 等 cause 稳定且可直连修复建议；
  - Playwright 原生报错文案变化更大，适合用关键词做窄分类，避免引入脆弱的全量枚举。

### 7. 关键风险点

- **runtime-error 文案来源不完全稳定**
  - 不同 Playwright 版本的英文报错可能变化，需要让规则优先匹配稳定 cause，其次才匹配关键词。
- **failure-insights 与 repair-suggestions 可能出现重复表达**
  - 需要控制 insight summary 讲“是什么问题”，recommendedAction 讲“下一步做什么”。
- **DiagnosticInspector 已有 target-resolution 专属区块**
  - 本轮如果只做 runtime 摘要与建议，不应误把 runtime-error 塞进“定位策略尝试”区域。
