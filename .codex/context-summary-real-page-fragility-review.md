## 项目上下文摘要（real-page-fragility-review）

生成时间：2026-06-06 16:55:31 CST

### 1. 相似实现分析

- 实现1：`/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-fragility-context/packages/page-intelligence/src/fragility.ts:96`
  - 模式：`inspectStep()` 逐步扫描静态脆弱性规则。
  - 可复用：`analyzeFlowFragility()` 返回 `FragilityIssue[]`，供 Studio 直接展示。
  - 需注意：原实现默认无上下文，之前只覆盖纯静态规则。
- 实现2：`/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-fragility-context/packages/runtime/src/playwright-runner.ts:48`
  - 模式：runtime 递归插值 `NormalizedStep` 的所有字符串字段，再对 `navigate.url` 做 `baseUrl` 解析。
  - 可复用：`interpolateString()`、`resolveNavigationUrl()` 代表真实执行语义。
  - 需注意：这里的变量正则与 page-intelligence 同构，说明预检应与运行时严格对齐。
- 实现3：`/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-fragility-context/apps/studio/src/App.tsx:435`
  - 模式：Flow 预览页直接调用 `analyzeFlowFragility(currentFlow)`，没有传环境或变量上下文。
  - 可复用：当前页面已有 `baseUrlDraft`、`variableInputs`、选中环境状态。
  - 需注意：任何“默认启用的上下文规则”都会立即影响现有相对路径 Flow 的 UI 结论。
- 实现4：`/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-fragility-context/apps/studio/electron/services.ts:306`
  - 模式：执行记录只保存 `severity === "warning"` 的 fragility 消息。
  - 可复用：运行前后都依赖同一套 `analyzeFlowFragility()`。
  - 需注意：新增 `error` 级规则若没有同步消费层，会出现“逻辑有结果、UI 无出口”的落差。

### 2. 项目约定

- 命名约定：类型、函数使用英文；注释与文案使用简体中文。
- 文件组织：`packages/*` 提供库逻辑，`apps/studio` 为消费端。
- 代码风格：TypeScript strict，函数式小工具 + 纯数组处理为主。

### 3. 可复用组件清单

- `packages/runtime/src/playwright-runner.ts`：真实变量插值与 `baseUrl` 解析语义。
- `apps/studio/src/App.tsx`：当前 Flow 页面与执行页的 fragility 消费点。
- `apps/studio/src/FragilityNotice.tsx`：统一 fragility UI 组件。

### 4. 测试策略

- 测试框架：Vitest。
- 参考文件：`packages/page-intelligence/src/fragility.test.ts`、`packages/runtime/src/playwright-runner.test.ts`。
- 当前覆盖特点：本次提交只补了 page-intelligence 单元测试，没有覆盖 Studio 调用链或运行时语义一致性。

### 5. 依赖和集成点

- 外部依赖：无新增第三方依赖。
- 内部依赖：`@flowweave/page-intelligence` 被 Studio 页面和 Electron service 共同消费。
- 集成方式：预览页同步展示，执行结果落盘后再展示摘要。

### 6. 关键风险点

- `MISSING_ENVIRONMENT` 默认启用后，可能在无上下文调用点产生假阳性。
- 变量扫描递归整个 step，可能把仅用于展示/诊断的字段也算成阻塞变量。
- 变量名正则比 DSL 约束更窄，存在漏报与运行时契约不一致风险。

