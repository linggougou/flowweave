## 项目上下文摘要（Recorder 稳定性缺口审查）

生成时间：2026-06-06 16:32:38 CST

### 1. 相似实现分析

- **实现 1**: `apps/extension/entrypoints/content.ts`
  - 模式：content script 直接监听 `click / change / blur / input / popstate / pushState / replaceState`，将原始交互转成 `RecordedEvent`。
  - 可复用：`recordNavigate()`、`recordInteractionFromElement()`、`lastFillSignature` 去重。
  - 需注意：当前没有键盘事件监听；`select / setChecked / upload` 只在 `change / blur` 分支处理。

- **实现 2**: `packages/recorder/src/target-from-dom.ts`
  - 模式：从 DOM 节点提取多策略 `Target`，同时附带 `tagName / inputType / nameAttr / placeholder / labelText / textSample`。
  - 可复用：`resolveClickTarget()`、`buildInteractionPayload()`、`buildStrategies()`。
  - 需注意：语义策略主要是 `testId + role + css + text`；CSS fallback 在缺少稳定属性时仍会退化到 `nth-of-type`。

- **实现 3**: `packages/recorder/src/normalize.ts`
  - 模式：录制事件统一归一化为 `NormalizedStep`，再经 `buildFlowFromEvents()` 聚合成 `FlowDocument`。
  - 可复用：`buildTargetFromPayload()`、`normalizeClick()`、`normalizeFill()`、`normalizeSelect()`、`ensureLeadingNavigate()`。
  - 需注意：`select / setChecked / upload` 已支持，但 `keypress` 仍未归一化，`buildFlowFromEvents()` 也只做基础去噪。

- **实现 4**: `packages/recorder/src/step-filter.ts`
  - 模式：在归一化之后对步骤序列做轻量去噪与 fill 合并。
  - 可复用：`filterNoisyInteractionSteps()`、`mergeConsecutiveFillSteps()`。
  - 需注意：只覆盖 `click -> fill/select/setChecked` 合并、布局噪声 click 过滤、连续 fill 合并；没有导航去重、重复 select/setChecked/upload 去重。

- **实现 5**: `packages/runtime/src/playwright-runner.ts`
  - 模式：runtime 已能执行 `select / setChecked / press / upload / wait`，并消费 `target.hints` 输出诊断。
  - 可复用：`resolveTarget()`、`waitForTargetState()`、`writeStepDiagnostic()`。
  - 需注意：这证明“执行端支持”，不等于“扩展录制端已真正产出可回放步骤”。

- **实现 6**: `examples/real-page-smoke.ts`
  - 模式：手写 `FlowDocument` 驱动真实页面 fixture 回归。
  - 可复用：`buildMatrixCases()` 中的 `select / setChecked / upload` fixture。
  - 需注意：这里验证的是 runtime，而不是 `content.ts -> recorder -> runtime` 的录制回放整链。

### 2. 项目约定

- **命名约定**：
  - 标识符英文，注释与文档简体中文。
  - Flow 步骤以 `NormalizedStep["type"]` 为单一语义入口。
- **文件组织**：
  - 扩展录制逻辑集中在 `apps/extension/entrypoints/content.ts`。
  - 录制协议在 `packages/shared/src/recording-protocol.ts`。
  - payload 提取、归一化、去噪分别在 `packages/recorder/src/target-from-dom.ts`、`normalize.ts`、`step-filter.ts`。
- **导入顺序**：
  - 先 workspace 包，再本地相对路径；类型导入优先 `import type`。
- **代码风格**：
  - TypeScript strict，小函数拆分，测试贴源码。

### 3. 可复用组件清单

- `apps/extension/entrypoints/content.ts`
  - 录制入口与事件采集主链。
- `packages/recorder/src/target-from-dom.ts`
  - DOM -> `InteractionRecordingPayload` 提取。
- `packages/recorder/src/normalize.ts`
  - `RecordedEvent` -> `NormalizedStep` / `FlowDocument`。
- `packages/recorder/src/step-filter.ts`
  - 归一化后步骤去噪。
- `packages/runtime/src/playwright-runner.ts`
  - 回放执行与 target hints 诊断消费。
- `packages/page-intelligence/src/fragility.ts`
  - 流程脆弱性体检入口。

### 4. 测试策略

- **测试框架**：Vitest。
- **当前已有证据**：
  - `packages/flow-dsl/src/schema.test.ts`：DSL 已接受 `select / setChecked / press / upload / hints`。
  - `packages/recorder/src/target-from-dom.test.ts`：payload 提取覆盖按钮、输入框、checkbox、select、file input。
  - `packages/recorder/src/normalize.test.ts`：归一化覆盖 `select / setChecked / upload`。
  - `packages/recorder/src/step-filter.test.ts`：覆盖 click 前置噪声与连续 fill 合并。
  - `packages/runtime/src/playwright-runner.test.ts`：runtime 手写 Flow 回放覆盖 `select / setChecked / press / upload`。
- **当前缺口**：
  - 没有 `apps/extension/entrypoints/content.ts` 级别测试。
  - 没有“扩展真实录制 -> buildFlowFromEvents -> runtime 回放”的整链回归。
  - 现有真实页面矩阵是手写 Flow，不验证 Recorder 轨道。

### 5. 依赖和集成点

- **外部依赖**：
  - WXT / Browser APIs：扩展录制。
  - Zod：录制协议与 DSL 类型安全。
  - Playwright：runtime 回放。
- **内部依赖链**：
  - `content.ts` -> `RecordedEvent`
  - `RecordedEvent` -> `buildFlowFromEvents()`
  - `FlowDocument.steps` -> `executeFlow()`
- **关键协议**：
  - `packages/shared/src/recording-protocol.ts`
  - `packages/flow-dsl/src/schema.ts`

### 6. 技术选型理由

- **为什么按当前边界审查**：
  - 用户问题聚焦 Recorder 轨道，不需要改代码，但必须区分“录制能力”与“回放能力”。
- **优势**：
  - `select / setChecked / upload / hints` 已进入 DSL 与 runtime，可复用底座已具备。
  - `target-from-dom.ts` 已提供比早期更强的 role/testId/hints 信息。
- **劣势和风险**：
  - `press` 缺少录制入口，导致 DSL/runtime 支持无法从扩展端触发。
  - `upload` 目前记录的是文件名，不是回放可用路径。
  - 去噪规则仍偏窄，真实页面容易出现重复 select/setChecked/upload 与重复 navigate。

### 7. 关键风险点

- **录制缺失**：`press` 完全未从 content script 发出，整链不成立。
- **回放失真**：`upload` 记录文件名会导致 runtime `setInputFiles()` 缺少真实来源。
- **重复噪声**：`change + blur` 会重复打点，但 `step-filter.ts` 没有覆盖 `select / setChecked / upload` 的重复去重。
- **路由噪声**：`pushState / replaceState / popstate` 直接记 `navigate`，缺少同 URL 去重。
- **稳定性盲区**：真实页面矩阵与 runtime 测试均为手写 Flow，不能证明 Recorder 轨道在真实页面上稳定。

### 8. 上下文充分性检查

- **我能说出至少 3 个相似实现吗？**
  - 是：`content.ts`、`target-from-dom.ts`、`normalize.ts`、`step-filter.ts`、`playwright-runner.ts`。
- **我理解当前实现模式吗？**
  - 是：录制事件采集 -> payload 提取 -> 归一化 -> 轻量去噪 -> Flow 聚合 -> runtime 回放。
- **我知道有哪些可复用组件吗？**
  - 是：`buildInteractionPayload()`、`normalizeRecordedEvent()`、`filterNoisyInteractionSteps()`、`mergeConsecutiveFillSteps()`。
- **我理解测试策略吗？**
  - 是：当前只有单元测试和 runtime 手写 Flow 回归，没有扩展录制整链回归。
- **我确认没有重复造轮子吗？**
  - 是：Recorder 轨道的关键逻辑已集中在现有四个文件中，本轮只需基于它们评估缺口。
