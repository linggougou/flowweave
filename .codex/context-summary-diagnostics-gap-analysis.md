## 项目上下文摘要（Diagnostics 轨道缺口只读探索）

生成时间：2026-06-06 16:36:00 CST

### 1. 相似实现分析

- **实现 1**: `packages/runtime/src/playwright-runner.ts`
  - 模式：运行时在失败分支统一补截图、页面摘要，并仅对可提取 `TargetDiagnosticContext` 的错误落盘 `step-<n>-diagnostic.json`。
  - 已完成：`strategyAttempts`、`url`、`title`、`targetHints` 已写入诊断 JSON；失败信息会带上“当前页面 + 匹配数量 + 可见数量 + 错误”。
  - 需注意：诊断 JSON 只覆盖定位/等待目标类失败；导航失败、变量问题、环境缺失、上传文件错误等仍不会生成诊断 JSON。

- **实现 2**: `packages/page-intelligence/src/fragility.ts`
  - 模式：对 `FlowDocument` 做静态扫描，返回 `FragilityIssue[]`。
  - 已完成：`CSS_ONLY`、`NO_STRATEGIES`、`CSS_NTH_OF_TYPE`、`TEXT_ONLY`、`WAIT_MAY_BE_UNSTABLE` 已实现，并带 `severity`。
  - 需注意：未实现设计文档要求的 `MISSING_ENVIRONMENT`、`MISSING_VARIABLE`；且目前只检查 `click` / `fill`，没有覆盖 `select` / `setChecked` / `upload` / `press(target)`。

- **实现 3**: `apps/studio/src/FragilityNotice.tsx`
  - 模式：把脆弱性消息按 `message` 合并展示，减少重复刷屏。
  - 已完成：Flow 页和执行页都能展示脆弱性提示概览。
  - 需注意：UI 只显示“提示”，没有按 `warning` / `error` 分组；修复建议只是消息文本的一部分，没有结构化动作。

- **实现 4**: `apps/studio/src/App.tsx` + `packages/ui/src/StepLogTable.tsx`
  - 模式：执行日志表仅展示 `message`、`screenshotPath`、`diagnosticPath`，并通过 `openPath` 打开本地文件。
  - 已完成：Studio 已有“打开截图 / 打开诊断文件路径”的入口。
  - 需注意：Studio 不会直接读取或渲染 diagnostic JSON 内容，也没有展示 `page-<n>.json` 内容或路径。

- **实现 5**: `apps/studio/electron/services.ts` + `apps/studio/src/shared/studio-api-types.ts`
  - 模式：服务层把 runtime 结果映射成 `StudioExecution`，并持久化执行记录。
  - 已完成：诊断路径会入库并回传到 Studio；运行后会把 `pageSnapshots` 存到 knowledge。
  - 需注意：`StudioExecution` 只保留 `fragilityWarnings` 的 `stepId + message`，丢失 `code / severity / stepIndex`；从知识库重载执行记录时，`fragilityWarnings` 也不会恢复。

### 2. 项目约定

- **命名约定**：诊断和 Studio DTO 统一使用英文标识符、中文说明文案。
- **文件组织**：
  - 诊断产物生成在 `packages/runtime`
  - 静态脆弱性分析在 `packages/page-intelligence`
  - 展示和打开入口在 `apps/studio`
- **导入与职责边界**：
  - `apps/studio` 只消费 `packages/*`，不自己实现浏览器执行逻辑。
  - runtime 只回传路径与基础结果；Studio 目前没有本地文件读取型 API。

### 3. 可复用组件清单

- `packages/runtime/src/playwright-runner.ts`: `buildTargetDiagnosticError()`、`writeStepDiagnostic()`、`capturePageSummary()`
- `packages/page-intelligence/src/fragility.ts`: `analyzeFlowFragility()`
- `apps/studio/src/FragilityNotice.tsx`: 现有脆弱性概览 UI 骨架
- `packages/ui/src/StepLogTable.tsx`: 执行日志表格与本地路径按钮
- `apps/studio/electron/services.ts`: 运行结果映射、执行记录持久化

### 4. 测试策略

- **测试框架**：Vitest。
- **已有覆盖**：
  - `packages/runtime/src/playwright-runner.test.ts` 已覆盖定位诊断 JSON 落盘和真实页面矩阵。
  - `packages/page-intelligence/src/fragility.test.ts` 已覆盖当前 5 类 fragility code。
- **缺口**：
  - `apps/studio` 当前没有诊断渲染或 fragility 展示的组件测试 / 交互测试。
  - 没有测试覆盖“从历史执行记录重载后仍能看到 fragility 信息”。
  - 没有测试覆盖“Studio 直接查看 diagnostic JSON 内容”的能力，因为该能力尚不存在。

### 5. 依赖和集成点

- **外部依赖**：
  - Playwright：生成截图、HAR、页面状态
  - Electron：通过 `openPath` 打开本地产物
- **内部依赖**：
  - `runtime -> page-intelligence`：页面摘要与脆弱性分析
  - `studio -> runtime + project-knowledge`：执行、存档与展示
- **关键集成点**：
  - `ExecutionResult.steps[].diagnosticPath`
  - `ExecutionResult.pageSnapshots`
  - `StudioExecution.fragilityWarnings`

### 6. 技术选型理由

- 当前实现已经把“失败后至少有路径可打开”的最小能力串起来，适合作为下一轮增强的基础。
- 最大缺口不在产物是否存在，而在：
  - 产物覆盖面不完整
  - DTO 语义在 Studio 层被压扁
  - Studio 只能打开文件，不能在界面内理解文件内容

### 7. 关键风险点

- **最直接影响排障**：
  - 非定位类失败没有 diagnostic JSON，真实页面失败时证据不足。
  - Studio 不直接渲染 diagnostic JSON，排障必须跳出 Studio。
  - fragility 丢失 `severity/code` 后，warning / error 分级失真。
- **误报风险**：
  - `WAIT_MAY_BE_UNSTABLE` 当前会对所有 `condition` 型 wait 报警，可能稀释真正高风险问题。
- **持久化断层**：
  - `pageSnapshots` 被保存但不回显，`fragilityWarnings` 运行后存在但历史重载会丢失。

### 8. 工具与替代流程

- 当前环境未提供 `sequential-thinking`，本次使用结构化审查、CodeGraph、全文搜索和现有测试替代。
- 当前环境未提供 `desktop-commander`，改用 `rg`、`sed`、`nl` 与 CodeGraph 做只读分析。
- 当前环境未提供 `context7` 与 `github.search_code`，本轮不依赖外部资料，完全以仓库 live 实现和设计文档对照。
