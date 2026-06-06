## 项目上下文摘要（旧历史执行兼容提示）

生成时间：2026-06-06 19:32:00 CST

### 1. 相似实现分析

- **实现 1**: [apps/studio/src/App.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/App.tsx:983)
  - 模式：执行页先展示 `FragilityNotice`，再展示 `StepLogTable` 和 `DiagnosticInspector`。
  - 可复用：执行详情页已经有稳定的信息层级，不需要新开页面或新开 tab。
  - 需注意：当前执行页只展示已有诊断结果，没有解释“为什么某些旧记录的诊断可能不完整”。
- **实现 2**: [apps/studio/src/FragilityNotice.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/FragilityNotice.tsx:48)
  - 模式：把多条诊断聚合成可扫描的 notice，适合承载“需处理 / 提示”类信息。
  - 可复用：现有 notice 样式和文案节奏适合新增兼容提示组件。
  - 需注意：`FragilityNotice` 输入是 `FragilityIssue[]`，不适合硬塞“旧记录兼容边界”这类非步骤级问题。
- **实现 3**: [apps/studio/src/DiagnosticInspector.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/DiagnosticInspector.tsx:37)
  - 模式：当诊断内容缺失时，会明确提示“已检测到路径但无法解析内容”。
  - 可复用：这种“说明当前能力边界 + 给出继续排查路径”的文案模式，适合复用到旧记录提示。
  - 需注意：该组件聚焦单步骤诊断，不负责执行级兼容状态。
- **实现 4**: [apps/studio/src/FlowEmptyGuide.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/FlowEmptyGuide.tsx:8)
  - 模式：通过单独引导卡片解释当前为什么没有数据，以及用户下一步该做什么。
  - 可复用：旧记录兼容提示也需要清楚说明“哪些信息缺失、当前退化行为是什么、对诊断意味着什么”。
  - 需注意：旧记录兼容问题不是空态，而是“有记录但信息不完整”，文案需更克制。

### 2. 项目约定

- **命名约定**：Studio 渲染侧共享逻辑放在 `apps/studio/src/shared/`，UI 组件放在 `apps/studio/src/`，类型使用 `Studio*` 前缀。
- **文件组织**：执行页总装配在 `App.tsx`，提示类组件采用单文件函数组件，不在 Electron 侧夹带展示逻辑。
- **导入顺序**：workspace 包与第三方包在前，本地组件与共享 helper 在后；类型优先 `import type`。
- **代码风格**：TypeScript strict，文案使用简体中文，组件尽量纯函数、易测。

### 3. 可复用组件清单

- [apps/studio/src/FragilityNotice.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/FragilityNotice.tsx): 现有提示 UI 风格与信息密度参考。
- [apps/studio/src/DiagnosticInspector.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/DiagnosticInspector.tsx): 缺失诊断内容时的解释文案模式。
- [apps/studio/src/shared/execution-fragility.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/shared/execution-fragility.ts): 已承载历史执行共享判断逻辑，兼容提示判断也适合落在 shared 层。
- [apps/studio/src/styles.css](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/styles.css:550): `fragility-notice` 与 `flow-empty-guide` 的现有样式可复用。

### 4. 测试策略

- **测试框架**：Vitest。
- **测试模式**：优先给共享判断函数写单元测试，不在这一轮新增重型 UI 渲染测试。
- **参考文件**：`apps/studio/src/shared/execution-fragility.test.ts`。
- **覆盖要求**：
  - 缺少 `flowSnapshot` 时应产出“当前 Flow 回退”提示。
  - 缺少 `runContext` 时应产出“环境/变量上下文缺失”提示。
  - 上下文完整时不应产生兼容提示。

### 5. 依赖和集成点

- **外部依赖**：React、Vitest。
- **内部依赖**：
  - `StudioExecution` 是执行页唯一数据源。
  - `studio-client.ts` 与 `electron/services.ts` 已把 `flowSnapshot` / `runContext` 带到渲染层。
- **集成方式**：共享 helper 只基于 `StudioExecution` 判断兼容状态；`App.tsx` 决定何时渲染提示组件。
- **配置来源**：无新增运行配置；完全依赖执行记录已有字段。

### 6. 技术选型理由

- **为什么做执行级兼容提示**：当前新记录已经完整，但旧记录仍可能回退到当前 Flow 或无上下文诊断；如果 UI 不解释，用户会误把退化结果当成真实历史复原。
- **优势**：改动局部、风险低、直接提高历史记录的可解释性。
- **风险**：如果把提示逻辑分散写在 `App.tsx` 和多个组件里，后续维护会变乱，因此需要集中到 shared helper。

### 7. 关键风险点

- **兼容边界**：旧记录缺 `flowSnapshot` 时，仍只能回退当前 Flow，这一行为需要明确提示而不是隐藏。
- **误报风险**：如果提示条件过宽，会让完整新记录也被错误标红。
- **体验风险**：提示文案必须解释边界，但不能淹没真正的 fragility 和步骤日志。
