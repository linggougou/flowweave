## 项目上下文摘要（Studio DOM 结构脆弱性误报修复）

生成时间：2026-06-07 20:10:00 CST

### 1. 相似实现分析

- **实现 1**: `packages/page-intelligence/src/fragility.ts`
  - 模式：对 Flow 进行静态脆弱性体检，当前通过 `inspectStep()` 按步骤产出 `CSS_ONLY / CSS_NTH_OF_TYPE / TEXT_ONLY / WAIT_MAY_BE_UNSTABLE / MISSING_*`。
  - 可复用：`inspectStep()`、`inspectContextualStep()`、`analyzeFlowFragility()`。
  - 需注意：当前 `CSS_ONLY` 规则过宽，只要目标策略全是 CSS 就告警，没有区分 `#id` 这类稳定锚点与 `nth-of-type` 这类结构定位。
- **实现 2**: `packages/recorder/src/target-from-dom.ts`
  - 模式：录制时优先产出 `testId -> role/name -> css -> text` 多策略，并附带 `labelText / nameAttr / placeholder / scope*` hints。
  - 可复用：`buildStrategies()`、`readAccessibleName()`、`buildInteractionPayload()`。
  - 需注意：当前新录制逻辑理论上已尽量提供语义策略，但旧录制流可能只有 CSS。
- **实现 3**: `packages/recorder/src/step-filter.ts`
  - 模式：已存在“结构噪声识别”经验，比如 `isLayoutNoiseClick()` 会专门识别裸布局层级 CSS，而不是把所有 CSS 一刀切。
  - 可复用：CSS 结构性判断思路。
  - 需注意：这里已经体现出仓库内对“结构 CSS”和“有语义锚点的 CSS”应区别对待。
- **实现 4**: `apps/studio/src/FragilityNotice.tsx`
  - 模式：把 fragility issue 汇总后直接展示为“提示 / 需处理 / 建议动作”。
  - 可复用：无需改组件结构，只需收紧上游 issue 产出。
  - 需注意：上游一旦误报，UI 会被成倍放大，导致用户感知为“整个 Flow 都坏了”。
- **实现 5**: `apps/studio/src/shared/run-input-state.ts`
  - 模式：运行前检查只依赖 `analyzeFlowFragility()` 中的上下文错误（`MISSING_ENVIRONMENT / MISSING_VARIABLE`）。
  - 可复用：说明本轮若只调整 CSS 静态风险，不会影响运行前必填校验。

### 2. 项目约定

- **命名约定**：脆弱性代码使用固定枚举字符串，如 `CSS_ONLY`、`CSS_NTH_OF_TYPE`。
- **文件组织**：静态体检逻辑集中在 `packages/page-intelligence`，Studio 只负责消费结果。
- **代码风格**：小函数拆分、显式早返回，测试使用 Vitest。
- **验证基线**：继续统一使用 `Node v20.19.6`。

### 3. 可复用组件清单

- `packages/page-intelligence/src/fragility.ts`
- `packages/page-intelligence/src/fragility.test.ts`
- `packages/recorder/src/target-from-dom.ts`
- `packages/recorder/src/step-filter.ts`
- `apps/studio/src/FragilityNotice.tsx`
- `apps/studio/src/shared/run-input-state.ts`

### 4. 当前证据

- 截图对应真实项目：
  - `projectId`: `68fce3e8-c717-417f-b276-62177ef3ecc3`
  - `flowId`: `flow-080c5fba-fb3e-4557-bfdc-91413376adcc`
- 真实 Flow JSON 已核对，目标策略确实大量为纯 CSS。
- 同一条 Flow 里同时存在两类 CSS：
  - 稳定锚点型：如 `#email`、`#password`
  - 结构漂移型：如 `div:nth-of-type(2) > div > form > button`
- 当前 `analyzeFlowFragility()` 会把上述两类都判进 `CSS_ONLY`，导致 Studio 汇总面板被大量黄色告警刷屏。

### 5. 测试策略

- **优先失败测试**：在 `packages/page-intelligence/src/fragility.test.ts` 补“纯 CSS 但为稳定 id / 语义属性锚点时不应误报 `CSS_ONLY`”。
- **回归测试**：
  - 结构性 `nth-of-type` 仍应继续报 `CSS_NTH_OF_TYPE`
  - 纯文本策略、缺变量、缺环境等现有行为不能回归
  - Studio 的 `FragilityNotice` 不需要改结构，只验证 issue 数量变化即可

### 6. 技术选型理由

- **优先修静态分析，不先改 UI 文案**：因为根因在 issue 生成过宽，不在展示层。
- **优先兼容旧录制流**：当前用户数据库里已有旧 Flow，单靠“以后重新录制”不能解决现在截图中的问题。
- **不直接改 Recorder 主链路**：Recorder 当前新实现已经能产出更丰富的语义策略，本轮先修现有旧数据的诊断误判。

### 7. 关键风险点

- **风险 1**：如果把规则收得过松，可能漏报真实脆弱 CSS。
- **风险 2**：`run-input-state` 与历史执行 fragility 也复用同一分析器，不能误伤 `MISSING_*` 上下文检查。
- **风险 3**：旧 Flow 仍会保留真正结构性 `nth-of-type` 问题，本轮目标是“减少误报”，不是“把旧 Flow 自动修成高质量多策略”。
