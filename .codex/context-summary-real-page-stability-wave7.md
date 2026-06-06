## 项目上下文摘要（真实页面稳定性 Wave 7）

生成时间：2026-06-07 02:29:38 CST

### 1. 相似实现分析

- **实现 1**: `apps/extension/entrypoints/content.ts`
  - 模式：content script 监听 `click / input / change / blur / keydown / history`，把真实交互转成 `RecordedEvent`。
  - 可复用：`recordInteractionFromElement()`、`recordPress()`、`buildUploadReplayInputs()`、`flushPendingFill()`。
  - 需注意：当前已有 `keypress`、`upload` 占位符与路由记录能力，但缺少“录到的 session 经 background 导出后是否稳定”的整链证明。

- **实现 2**: `apps/extension/entrypoints/background.ts`
  - 模式：把 `MSG_RECORD_EVENT` 累积到 `browser.storage.session`，再在 `MSG_EXPORT_FLOW / MSG_SYNC_KNOWLEDGE` 时调用 `buildFlowFromEvents()` 导出 Flow。
  - 可复用：`loadSession()`、`saveSession()`、`toSessionState()`、现有消息协议。
  - 需注意：当前没有针对 background 消息处理链的自动化测试，导出闭环仍停留在“代码存在”而不是“行为已证实”。

- **实现 3**: `packages/recorder/src/normalize.ts`
  - 模式：`RecordedEvent[] -> NormalizedStep[] -> FlowDocument`，并在构建阶段做 leading navigate 修补、轻量去噪、最小 wait 推断、变量声明。
  - 可复用：`normalizeRecordedEvent()`、`buildFlowVariables()`、`insertInferredWaitSteps()`、`buildUrlIncludesFragment()`。
  - 需注意：当前 `normalize.test.ts` 已覆盖 keypress、upload、navigate 去重与部分 wait 推断，但没有把更多 `p7` 真实页面族群转成 recorded replay 级证明。

- **实现 4**: `packages/runtime/src/playwright-runner.test.ts`
  - 模式：直接用 `parseRecordedEvent() -> buildFlowFromEvents() -> executeFlow()` 做 recorded replay 整链回归。
  - 可复用：`buildRecordedFlowMeta()`、fixture 临时文件写法、storage state 写法、artifact 断言模式。
  - 已知事实：当前 recorded replay 只覆盖 `7` 条流程：
    - `upload`
    - `spa-route`
    - `filterable-list`
    - `contenteditable-editor`
    - `session-expired-retry`
    - `bulk-cross-page-selection`
    - `placeholder-disambiguation`
  - 需注意：真实页面 `p7` 手写矩阵已覆盖 `19` 个场景，二者之间仍有明显覆盖缺口。

- **实现 5**: `examples/real-page-smoke.ts`
  - 模式：通过手写 `FlowDocument` 跑 `baseline/p5/p6/p7` 真实页面矩阵，并输出失败类型、最慢场景与成功覆盖。
  - 可复用：本地静态服务器、storage state 资产生成、矩阵汇总结构。
  - 需注意：它证明的是 runtime 手写 Flow 稳定，不证明“录制得到的事件内容”也能稳定执行。

### 2. 项目约定

- **命名约定**：
  - 真实页面规划文档继续使用 `real-page-stability-waveX-*`。
  - 与 recorded replay 相关的新 runner、profile、测试命名应显式带 `recorded`。
  - 文档与注释简体中文，标识符英文。

- **文件组织**：
  - 扩展录制与导出链路在 `apps/extension/**`。
  - 录制归一化与去噪在 `packages/recorder/**`。
  - runtime recorded replay 整链回归在 `packages/runtime/src/playwright-runner.test.ts`。
  - 手工矩阵脚本在 `examples/**`。

- **导入与边界**：
  - `apps/* -> packages/*` 单向依赖不破坏。
  - 本轮优先复用现有 `buildFlowFromEvents()`、`executeFlow()` 与 fixture，不新建第二套录制协议。

### 3. 可复用组件清单

- `apps/extension/entrypoints/content.ts`
  - `buildUploadReplayInputs()`
  - `readFillValue()`
  - `isSubmitLikePressKey()`
- `apps/extension/entrypoints/background.ts`
  - `loadSession()`
  - `saveSession()`
  - `toSessionState()`
- `packages/recorder/src/normalize.ts`
  - `normalizeRecordedEvent()`
  - `buildFlowFromEvents()`
  - `insertInferredWaitSteps()`
- `packages/recorder/src/step-filter.ts`
  - `filterNoisyInteractionSteps()`
  - `mergeConsecutiveFillSteps()`
- `packages/runtime/src/playwright-runner.test.ts`
  - `buildRecordedFlowMeta()`
  - 已有 recorded replay fixture 写法
- `examples/real-page-smoke.ts`
  - 本地静态 server 与 storage state 资产模式

### 4. 测试策略

- **现有单元 / 整链覆盖**：
  - `packages/recorder/src/normalize.test.ts`
    - 已覆盖 `keypress`、`upload` 占位符、leading navigate、去噪与最小 wait 推断
  - `packages/recorder/src/step-filter.test.ts`
    - 已覆盖 `navigate / select / setChecked / upload` 去重与 fill 合并
  - `apps/extension/lib/content-contract.test.ts`
    - 已覆盖 upload 占位符、contenteditable、提交型 `keypress` flush
  - `packages/runtime/src/playwright-runner.test.ts`
    - 已覆盖 `7` 条 recorded replay 整链流程
  - `pnpm e2e:real-pages`
    - 已覆盖手写 `p7` 真实页面矩阵 `19/19`

- **当前验证缺口**：
  1. 缺少 background 消息处理链自动化测试。
  2. 缺少对 `repeated-row-actions / linked-filters / session-dashboard / drawer-double-save` 这类高价值 `p7` 场景的 recorded replay 证明。
  3. 缺少可单独执行的 recorded replay 烟测入口；目前 recorded replay 证据散落在单测中，不适合作为“录制链路是否还稳”的独立验收命令。

### 5. 依赖和集成点

- **录制链路**：
  - `content.ts` 产生 `RecordedEvent`
  - `background.ts` 累积 session 并调用 `buildFlowFromEvents()`
  - `saveFlowToKnowledge()` 同步到 knowledge

- **回放链路**：
  - `buildFlowFromEvents()` 产出 `FlowDocument`
  - `executeFlow()` 执行 recorded replay Flow
  - fixture / storage state / 变量输入决定是否能复现实战场景

- **验收链路**：
  - runtime recorded replay 单测
  - 新增 recorded replay smoke runner
  - 既有 `e2e:real-pages`

### 6. 技术选型理由

- **为什么下一轮要转向 recorded replay parity**：
  - 用户最初痛点是“记录的页面内容执行不好”，当前主线更多证明了“手写 Flow 能跑”，但 recorded replay 证据明显更薄。

- **为什么要把 background 导出也纳入范围**：
  - 真实用户不是手写 `RecordedEvent[]`，而是通过扩展 session -> background export/sync 走整链；这一跳没测试，真实使用风险仍然存在。

- **为什么要增加独立 recorded smoke 命令**：
  - 现在只有 scattered test cases，没有一个一眼就能回答“录制回放链路今天还稳不稳”的统一命令。

### 7. 关键风险点

- **覆盖错位风险**：
  - `p7` 矩阵全绿不代表 recorded replay 也全绿；手写 Flow 与录制归一化失败模式不同。

- **协议漂移风险**：
  - 如果 background / recorder / runtime 各自补一点 recorded 逻辑，但没有统一 smoke runner，未来容易再次出现“局部绿、整链不稳”。

- **异步推断风险**：
  - 新增 recorded replay 场景可能暴露 `insertInferredWaitSteps()` 还不够稳；需要用红绿回归把它锁定在高价值边界内，而不是无限放宽。

### 8. 推荐主题

- **Wave 7 主题**：`真实录制回放闭环 + recorded replay 矩阵`
- **推荐并行轨道**：
  1. `Extension Session Export Contract`
  2. `Recorded Replay Coverage Expansion`
  3. `Recorded Replay Smoke Runner`
- **主代理集成职责**：
  - 统一 Node 20 验收
  - 合并 3 条轨道
  - 维护 `.codex` 留痕与资源回收
