## 项目上下文摘要（真实页面稳定性 Wave 5）

生成时间：2026-06-06 23:05:00 CST

### 1. 相似实现分析

- **实现 1**: `packages/runtime/src/playwright-runner.test.ts`
  - 模式：通过 `parseRecordedEvent()` + `buildFlowFromEvents()` + `executeFlow()` 建立“录制事件 -> Flow -> runtime 回放”的整链回归。
  - 可复用：`buildRecordedFlowMeta()`、`fixturesBaseUrl`、现有 `upload` / `spa-route` / `filterable-list` 三类 recorded replay 测试写法。
  - 需注意：当前 recorded replay 仍只覆盖 3 条链路，`contenteditable`、空结果重试、联动筛选强化场景仍未进入整链证明。
- **实现 2**: `apps/extension/entrypoints/content.ts` + `packages/recorder/src/normalize.ts` + `packages/recorder/src/step-filter.ts`
  - 模式：扩展侧先按 `click / input / keydown / history` 采集录制事件，再由 `normalizeRecordedEvent()` 转步骤，最后经 `ensureLeadingNavigate()`、`filterNoisyInteractionSteps()`、`mergeConsecutiveFillSteps()` 做录制稳定化。
  - 可复用：`input` 的 debounce 收口、`RecordedEvent.timestamp`、现有重复 `navigate / select / setChecked / upload` 去重、`keypress -> press` 归一化。
  - 需注意：事件时间戳已经存在，但当前没有用于推断异步等待；`keydown` 也不会先 flush 待提交 fill，真实页面异步稳定仍主要依赖 runtime 通用 settle。
- **实现 3**: `examples/real-page-smoke.ts` + `packages/runtime/src/real-page-matrix.test.ts`
  - 模式：按 `baseline / p5 / p6` 递进构建矩阵，统一回收 `results / failed / failureTypeCounts`，由 CLI 打印汇总。
  - 可复用：`RealPageFixtureCaseResult`、`runRealPageFixtureMatrix()`、`summarizeRealPageFailureTypes()`、矩阵测试的断言方式。
  - 需注意：当前矩阵只汇总场景族失败类型，没有最慢场景排行，也没有更细粒度的成功态摘要。
- **实现 4**: `apps/studio/src/App.tsx` + `apps/studio/src/DiagnosticInspector.tsx` + `packages/ui/src/StepLogTable.tsx`
  - 模式：Electron 服务层通过 `readStepArtifacts()` 把 `diagnostic` 与 `pageSnapshot` 读回，Studio 在执行历史与诊断工作台两层消费这些证据。
  - 可复用：`ExecutionStepLog.pageSnapshot`、`buildDiagnosticRepairSuggestions()`、诊断工作台 tab 切换与 artifact 打开入口。
  - 需注意：当前 UI 仍偏“状态表格 + 单个查看诊断按钮”，失败类别、页面快照摘要和证据优先级还没有前移到第一屏。

### 2. 项目约定

- **命名约定**：
  - 真实页面增强文档统一使用 `real-page-stability-waveX-*` 命名。
  - worktree / 分支继续使用 `codex/real-page-*` 前缀。
  - 统计类型继续采用 `RealPage*` 前缀，Studio 纯函数继续采用 `build*` 命名。
- **文件组织**：
  - 录制稳定化逻辑跨 `apps/extension/**` 与 `packages/recorder/src/**`。
  - recorded replay 与 runtime 整链回归在 `packages/runtime/src/playwright-runner.test.ts`。
  - 基准矩阵与 CLI 汇总在 `examples/**` 与 `docs/guides/fixture-matrix.md`。
  - Studio 诊断体验收敛到 `apps/studio/src/**`、`apps/studio/src/shared/**` 与 `packages/ui/src/**`。
- **导入顺序**：Node 内置 -> workspace 包 -> 本地模块；类型使用 `import type`。
- **代码风格**：TypeScript strict、中文注释与文档、纯函数优先、最小改动补齐现有链路，不新建平行执行框架。

### 3. 可复用组件清单

- `apps/extension/entrypoints/content.ts`
  - `recordInteractionFromElement()`
  - `recordPress()`
- `packages/recorder/src/normalize.ts`
  - `buildFlowFromEvents()`
  - `normalizeRecordedEvent()`
  - `ensureLeadingNavigate()`
- `packages/recorder/src/step-filter.ts`
  - `filterNoisyInteractionSteps()`
  - `mergeConsecutiveFillSteps()`
- `packages/runtime/src/playwright-runner.test.ts`
  - `buildRecordedFlowMeta()`
  - 现有 recorded replay 测试模板
- `examples/real-page-smoke.ts`
  - `runRealPageFixtureMatrix()`
  - `summarizeRealPageFailureTypes()`
- `apps/studio/electron/services.ts`
  - `readStepArtifacts()`
- `apps/studio/src/shared/repair-suggestions.ts`
  - `buildDiagnosticRepairSuggestions()`

### 4. 测试策略

- **测试框架**：Vitest + 本地 Playwright。
- **定向入口**：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`
- **统一验收**：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`
- **覆盖重点**：
  - 真实录制事件导出的复杂 Flow 是否能稳定回放
  - Recorder 是否会为异步页面生成更稳的最小等待链，并在 `keypress` 前先落最终 fill
  - 矩阵汇总是否能暴露慢场景与失败族
  - Studio 是否在应用内直接呈现更高价值的失败原因与排障证据

### 5. 依赖和集成点

- **录制链路**：`apps/extension/entrypoints/content.ts` -> `packages/shared` 协议 -> `packages/recorder/src/normalize.ts` -> `packages/recorder/src/step-filter.ts`
- **回放链路**：`buildFlowFromEvents()` -> `executeFlow()` -> `apps/studio/electron/services.ts`
- **矩阵链路**：`examples/real-page-smoke.ts` -> `packages/runtime/src/index.ts`
- **诊断链路**：runtime `diagnosticPath / pageSnapshot` -> `readStepArtifacts()` -> `DiagnosticInspector`

### 6. 技术选型理由

- **为什么下一轮不继续盲目加 fixture**：
  - `p6` 已经把默认真实页面矩阵拉到 18 个场景，继续扩场景不一定直接解决“录出来的 Flow 为什么跑不稳”。
- **为什么优先做 recorded replay 扩展**：
  - 这是最接近用户真实使用路径的证据链，比手写 Flow 或单纯矩阵更能证明“录到的内容可执行”。
- **为什么 Recorder 轨要同时补 wait 推断与 keypress flush**：
  - 前者解决点击后异步切视图、刷新局部内容的稳定性；后者解决输入后立刻 `Enter / Tab` 时最终值晚于 `press` 的顺序风险，两者组合才覆盖当前最常见的真实录制失败根因。
- **为什么 Studio 轨只做证据工作台，不加新后端 API**：
  - 现有 `pageSnapshot`、`diagnostic`、`repairSuggestions` 已足够支撑一轮体验增强；优先榨干现有证据，降低耦合和风险。
- **为什么矩阵轨优先做观测性**：
  - 当前已具备失败族统计，继续补最慢场景排行和更强汇总能更快发现漂移，而不必立刻再把默认档位扩成更重的 `p7`。

### 7. 关键风险点

- **wait 推断误伤风险**：Recorder 若无边界地自动插入 `wait`，可能把用户本来的多步交互错误地改写为被动等待。
- **录制顺序误判风险**：若 `keypress` 前 flush 规则过宽，可能把非提交型输入也强行收口，导致多余 `fill` 落盘。
- **整链回归耗时风险**：`playwright-runner.test.ts` 再加复杂 recorded replay 场景后，定向测试耗时会明显上涨。
- **Studio 体验与逻辑混写风险**：若不抽纯函数，诊断工作台很容易继续膨胀成大组件。
- **终态等待缺口风险**：如果用户在“最后一次提交后立刻停止录制”，当前基于事件序列的 wait 推断仍可能无法补出结尾等待，需要 runtime recorded replay 继续校验边界。
- **矩阵默认时长风险**：`p6` 已约 26 秒，观测性增强要避免顺手把默认档位做得更慢。
