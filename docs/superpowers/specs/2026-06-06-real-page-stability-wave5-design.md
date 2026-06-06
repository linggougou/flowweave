# 真实页面稳定性 Wave 5 设计

生成时间：2026-06-06

## 1. 背景

Wave 4 已经完成三件关键事情：

1. 录制端补齐了 `contenteditable` 基础闭环。
2. Studio 拿到了结构化修复建议。
3. 真实页面矩阵扩到 `p6`，并加入失败类型统计。

这让 FlowWeave 从“只能跑理想页面”更进一步，但离“真实录制出来的复杂页面流程也能稳定执行，并且失败时能快速知道为什么”还有一段距离。

当前最明显的剩余缺口，不再是“某个步骤类型不存在”，而是以下 4 类稳定性问题：

1. **整链证明仍偏窄**
   - `packages/runtime/src/playwright-runner.test.ts` 当前只有 `upload`、`spa-route`、`filterable-list` 三条 recorded replay 整链回归。
   - `contenteditable-editor`、`session-expired-retry`、`bulk-cross-page-selection` 等更复杂页面虽然已有 fixture，但还没有“真实录制事件 -> Flow -> runtime 回放”的直接证明。
2. **Recorder 对异步页面仍偏被动**
   - `RecordedEvent.timestamp` 已存在，但 `buildFlowFromEvents()` 目前只做去噪和 leading navigate 修补，没有基于事件间隔推断更稳的最小等待。
   - 扩展侧 `input` 仍使用 400ms debounce，`keydown` 会立刻发出 `keypress`；当用户输入后马上 `Enter / Tab` 时，最终 `fill` 可能晚于 `press` 甚至直接丢失。
   - 这意味着真实页面异步稳定主要依赖 runtime 的通用 `waitForPageSettled()`，而不是录制层主动补出更贴近用户行为的等待意图。
3. **矩阵有统计，但观测性不够**
   - 当前 CLI 只能输出成功数、失败数、总耗时、平均耗时和场景族失败类型。
   - 对长期维护更关键的“最慢场景排行”和“`p6` 成功态是否足够强”仍然没有沉淀。
4. **Studio 已拿到证据，但没有把证据价值吃满**
   - `DiagnosticInspector` 已能读 `pageSnapshot`、`diagnostic` 和修复建议。
   - `ExecutionStepLog` 也已把 `diagnosticPath / pageSnapshotPath / pageSnapshot` 带回前端。
   - 但 `App.tsx` 与 `StepLogTable` 仍主要展示状态、耗时和一个“查看诊断”入口，不是“失败时第一眼就能定位”的工作台。

## 2. 方案对比

### 方案 A：继续扩更多 fixture 和更多手写 Flow

- 优点：实现路径最熟，能继续扩大矩阵覆盖面。
- 缺点：更像“继续堆基准”，不直接回答“真实录制出来的复杂 Flow 是否稳定”。

### 方案 B：围绕“录制整链 + 证据工作台 + 观测性”做一轮收敛增强

- 优点：
  - 直接贴近用户真实使用路径。
  - 低耦合，适合继续用 worktree 并行推进。
  - 能复用现有 fixture、diagnostic 和 page snapshot，不需要新后端系统。
- 缺点：
  - wait 推断属于启发式逻辑，需要控制边界，避免误伤。

### 方案 C：直接进入更重的 `p7` 与 richer selector / rich text 协议扩展

- 优点：看起来“功能更多”。
- 缺点：
  - 范围会同时打到 recorder、runtime、Studio、fixture，冲突面太大。
  - 还没把当前 `p6` 和 recorded replay 证据链榨干，就继续扩协议，收益不稳。

## 3. 推荐方案

采用 **方案 B**。

下一轮不把重点放在“再加多少新能力”，而是优先把现有能力从“局部可用”提升到“整链可证、失败可判、回归可观测”。

## 4. 本轮目标

1. 让 Recorder 在复杂异步页面上导出的 Flow 更稳，至少补出一类可控的隐式等待能力，并修正 `fill -> press` 的收口顺序。
2. 把 recorded replay 整链回归从 3 条扩到覆盖 `contenteditable` 与至少 1 条更强异步页面链路。
3. 提升真实页面矩阵的观测性，输出最慢场景排行，并为后续是否进入 `p7` 提供更可靠依据。
4. 把 Studio 诊断面板从“原始表格”升级到“失败根因优先”的工作台，直接在应用内消化 page snapshot、diagnostic 与现有修复建议。

## 5. 成功标准

1. `buildFlowFromEvents()` 能在明确边界内插入最小 `wait` 步骤，扩展侧也能在提交型 `keypress` 前先 flush 待提交 `fill`，并分别有单测固定行为。
2. `packages/runtime/src/playwright-runner.test.ts` 新增至少 2 条 recorded replay 整链回归：
   - `contenteditable-editor`
   - `session-expired-retry`
   - 若节奏允许，再补 `bulk-cross-page-selection`
3. `examples/run-real-page-smoke.ts` 能输出最慢场景排行。
4. `packages/runtime/src/real-page-matrix.test.ts` 对新增观测字段给出断言。
5. Studio 失败根因工作台能在应用内直接展示：
   - 失败类别或优先排查结论
   - 页面快照摘要
   - artifact 分拆入口
   - 复用现有 `repair-suggestions` 的下一步动作
6. Node 20 下局部验证与统一验收通过。

## 6. 轨道拆分

### 6.1 Recorder Async Stabilization

- 范围：
  - `apps/extension/entrypoints/content.ts`
  - `apps/extension/lib/content-contract.test.ts`
  - `packages/recorder/src/normalize.ts`
  - `packages/recorder/src/normalize.test.ts`
  - 必要时 `packages/recorder/src/step-filter.ts`
  - 必要时 `packages/recorder/src/step-filter.test.ts`
- 目标：
  - 基于 `RecordedEvent.timestamp` 和相邻事件关系，推断最小 `wait` 插入点
  - 在 `Enter / Tab / Escape` 等提交型 `keypress` 前先落最终 `fill`
  - 保持去噪逻辑与既有 `navigate / select / upload` 稳定化规则不回退

### 6.2 Runtime Recorded Replay Expansion

- 范围：
  - `packages/runtime/src/playwright-runner.test.ts`
  - 必要时现有 fixture 文件
- 目标：
  - 扩大真实 recorded replay 整链覆盖
  - 用复杂页面链路验证 Recorder 导出的新等待能力是否真的帮助回放

### 6.3 Benchmarks Observability

- 范围：
  - `examples/real-page-smoke.ts`
  - `examples/run-real-page-smoke.ts`
  - `packages/runtime/src/real-page-matrix.test.ts`
  - `docs/guides/fixture-matrix.md`
- 目标：
  - 增加最慢场景排行
  - 为 `p6` 当前观测性补齐长期追踪入口

### 6.4 Studio Failure Insight Workbench

- 范围：
  - `apps/studio/src/App.tsx`
  - `apps/studio/src/DiagnosticInspector.tsx`
  - `apps/studio/src/DiagnosticInspector.test.tsx`
  - `apps/studio/src/shared/failure-insights.ts`
  - `apps/studio/src/shared/failure-insights.test.ts`
  - `packages/ui/src/StepLogTable.tsx`
- 目标：
  - 在执行历史列表和诊断工作台前移失败根因、page snapshot 摘要与 artifact 入口
  - 继续复用现有 `diagnostic`、`pageSnapshot`、`repair-suggestions.ts`，不新增新的后端读取 API

## 7. 非目标

本轮不做：

1. 远端真实站点录制与 smoke。
2. 富文本格式级回放（仅继续保障文本内容）。
3. 新增 `p7` 默认档位。
4. 新建诊断后端或第二套 artifact 存储系统。

## 8. 风险与缓解

### 风险 1：隐式 wait 规则过宽

- 缓解：
  - 只在明确的相邻事件模式下推断。
  - 先由 recorder 单测 + runtime recorded replay 双重证明。

### 风险 2：整链测试耗时上涨

- 缓解：
  - 新增 recorded replay 继续复用现有 fixture，不额外引入重型页面。
  - 统一只跑 `playwright-runner.test.ts` 定向回归，不扩大到无关包。

### 风险 3：Studio 组件继续膨胀

- 缓解：
  - 先抽纯函数 `failure-insights` summarizer，再接组件渲染。
  - 不在 `App.tsx` 扩大状态复杂度；`StepLogTable` 只接收已整理好的摘要字段。

### 风险 4：矩阵观测性和真实稳定性脱节

- 缓解：
  - Benchmarks 轨只做与当前 `p6` 直接相关的观测字段，不创造和真实执行脱节的新指标。

## 9. 结论

Wave 5 的重点不是继续“横向加功能”，而是把现有真实页面能力向纵深做实：录制导出的 Flow 更稳、复杂页面回放更可证、矩阵结果更可观测、Studio 失败根因更聚焦。这样下一轮如果再决定进入 `p7` 或 richer selector / richer text 扩展，基础会更扎实。
