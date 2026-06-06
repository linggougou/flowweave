## 项目上下文摘要（真实页面稳定性 Wave 10：动作级韧性与 P8 观测）

生成时间：2026-06-07 05:59:00 CST

### 1. 相似实现分析

- **实现 1**: `packages/runtime/src/playwright-runner.ts:580-709`
  - 模式：先做 `resolveCandidateLocator()` 候选消歧，再由 `buildTargetDiagnosticError()` 统一拼装定位诊断。
  - 可复用：现有 `CandidateSummary`、`StrategyAttempt`、`TargetResolutionDiagnostic` 已能承载候选信息与歧义原因。
  - 需注意：这层解决的是“找到哪一个候选”的问题，不是“动作执行时页面瞬态变化”的问题。
- **实现 2**: `packages/runtime/src/playwright-runner.ts:1368-1445`
  - 模式：`runStep()` 内按步骤类型串行执行，`click / fill / select / setChecked / press / upload` 直接调用 Playwright locator 动作，然后接 `waitForPageSettled()` 或 suggest 窄等待。
  - 可复用：已有 `waitForPageSettled()`、`waitForSuggestTargetReady()`、`waitForNavigationPressSettled()` 可以作为动作后稳定等待基础。
  - 需注意：当前动作调用仍是一发式，未看到统一的动作级 retry / re-resolve / scroll-into-view 包装。
- **实现 3**: `examples/real-page-smoke.ts:28-120` 与 `1252-1339`
  - 模式：真实页面矩阵按 `baseline / p5 / p6 / p7` 梯度构建；汇总只按业务场景族输出 `failureTypeCounts / slowestCases / successCoverage`。
  - 可复用：现有 profile ladder、失败类型汇总、最慢场景排行和成功覆盖率统计都可继续扩展。
  - 需注意：`normalizeRealPageMatrixProfile()` 目前把 `p6` 兼容映射到 `p7`，说明默认矩阵已经承担了历史兼容职责；若继续扩容，更适合新开 `p8` 而不是再挤进 `p7`。
- **实现 4**: `examples/recorded-replay-smoke.ts:19-54` 与 `packages/runtime/src/recorded-replay-matrix.test.ts`
  - 模式：recorded replay baseline 直接从 `packages/*/src/index.ts` 导 live implementation，并用显式 case 列表与步数列表锁定回归。
  - 可复用：Recorded event -> Flow -> executeFlow 的整条闭环已经稳定，适合继续补真实页面动作韧性回归。
  - 需注意：baseline 仍偏人工枚举，新增场景时要同步文档、矩阵和断言，不然容易出现计数漂移。
- **实现 5**: `packages/recorder/src/target-from-dom.ts:485-607`
  - 模式：Recorder 已能从语义容器提取 `scopeText / scopeKind`，并把这些线索保真写入 payload。
  - 可复用：下一阶段若要增加“弹层内保存”“重渲染后同文案按钮”等场景，不需要再扩录制协议。
  - 需注意：Recorder 这轮不一定是主战场，更多收益可能在 runtime 动作执行与 benchmarks 扩容。
- **实现 6**: `apps/studio/src/shared/failure-insights.ts:123-207`
  - 模式：Studio 失败洞察优先识别 `ambiguous-target / hidden-target / missing-target / execution-error / page-snapshot / fallback-success`。
  - 可复用：目标不唯一、不可见、缺失目标三类文案和 `repair-suggestions.ts` 已经成型。
  - 需注意：当前 `runtime-error` 仍被统称为“执行报错”，未细分 detached、遮挡、不可编辑、元素失效等技术根因。

### 2. 项目约定

- **命名约定**:
  - 真实页面阶段文档统一使用 `docs/superpowers/specs/2026-06-07-real-page-stability-waveX-*.md` 与 `docs/superpowers/plans/2026-06-07-real-page-stability-waveX-*.md`。
  - 协调分支保持 `codex/real-page-stability-program`，子轨道使用 `codex/real-page-waveX-*`。
- **文件组织**:
  - runtime 主链路集中在 `packages/runtime/src/playwright-runner.ts`
  - recorded replay 与 real-page smoke 脚本在 `examples/*.ts`
  - Studio 失败洞察与修复建议在 `apps/studio/src/shared/*`
  - 本地留痕在 `.codex/`
- **导入顺序**:
  - Node 内建模块在前，workspace 包次之，本地相对路径最后。
- **代码风格**:
  - TypeScript strict，简体中文注释与文档，标识符英文。
  - 现有测试广泛使用内联 fixture HTML 构造或 `examples/fixtures/*.html`。

### 3. 可复用组件清单

- `packages/runtime/src/playwright-runner.ts`
  - `resolveTarget()`：统一定位与候选消歧入口
  - `waitForPageSettled()`：动作后通用稳定等待
  - `waitForSuggestTargetReady()` / `waitForNavigationPressSettled()`：suggest/combobox 窄等待
  - `buildRuntimeErrorDiagnostic()` / `buildTargetResolutionDiagnostic()`：失败诊断落盘
- `examples/real-page-smoke.ts`
  - `summarizeRealPageFailureTypes()`、`summarizeRealPageSlowestCases()`、`summarizeRealPageSuccessCoverage()`
- `examples/recorded-replay-smoke.ts`
  - `buildFlowFromEvents()` baseline 闭环
- `packages/recorder/src/target-from-dom.ts`
  - `readScopeHint()`、`buildInteractionPayload()`
- `apps/studio/src/shared/failure-insights.ts`
  - `buildFailureInsight()`、`resolveInsightCategory()`
- `apps/studio/src/shared/repair-suggestions.ts`
  - 目标歧义、作用域不足、fragility 的修复建议生成

### 4. 测试策略

- **测试框架**:
  - `Vitest` 用于 packages 层单测
  - `tsx examples/*.ts` 用于 smoke / matrix
- **测试模式**:
  - runtime 层：`playwright-runner.test.ts` 内联 fixture + HTTP fixture 回归
  - recorded replay：`packages/runtime/src/recorded-replay-matrix.test.ts` + `pnpm e2e:recorded-pages`
  - real pages：`packages/runtime/src/real-page-matrix.test.ts` + `pnpm e2e:real-pages`
  - Studio：共享逻辑测试优先，不依赖整套 Electron UI 启动
- **参考文件**:
  - `packages/runtime/src/playwright-runner.test.ts`
  - `packages/runtime/src/recorded-replay-matrix.test.ts`
  - `packages/runtime/src/real-page-matrix.test.ts`
  - `apps/studio/src/shared/failure-insights.test.ts`
  - `apps/studio/src/shared/repair-suggestions.test.ts`
- **覆盖要求**:
  - 正常路径：新场景在 recorded replay / real-pages 至少覆盖一条
  - 边界条件：失败时要能区分定位问题和执行问题
  - 错误恢复：若引入动作重试，需要验证首次失败后二次成功和最终仍失败两条路径

### 5. 依赖和集成点

- **外部依赖**:
  - `playwright`：实际浏览器动作执行
  - `@flowweave/page-intelligence`：页面快照与摘要
- **内部依赖**:
  - Recorder 通过 `buildFlowFromEvents()` 为 recorded replay baseline 提供输入
  - Runtime 通过 `executeFlow()` 被 smoke 脚本与 Studio 调用
  - Studio 通过 `ExecutionStepLog.diagnostic / pageSnapshot` 呈现失败洞察
- **集成方式**:
  - `examples/*` 直接导入 `packages/*/src/index.ts` 运行 live implementation
  - 真实页面矩阵通过本地 HTTP server 暴露 `examples/fixtures/*.html`
- **配置来源**:
  - Node 基线：`.nvmrc` / 既有验证记录均指向 `v20.19.6`
  - 命令入口：根 `package.json` 的 `e2e:real-pages`、`e2e:recorded-pages`、`smoke:full`

### 6. 技术选型理由

- **为什么下一阶段优先考虑动作级韧性**:
  - 当前定位与候选消歧已经较完整，但 `runStep()` 中实际动作仍是一发式调用。
  - 真实页面里更常见的后续故障通常来自 rerender、detached、遮挡或可操作状态切换，而不是“完全找不到元素”。
- **为什么同时考虑 P8 矩阵与技术根因观测**:
  - `p7` 已承担 21 个场景和历史兼容映射，继续堆场景会拉高默认回归时长与维护成本。
  - 现在的汇总更偏业务场景族，无法快速看出失败是“定位歧义”还是“动作执行瞬态问题”。
- **为什么 Recorder 不是首选主轨**:
  - 现有 `scopeText / scopeKind`、`labelText / placeholder / nameAttr / textSample` 已能满足目前大部分上下文传递需求。
  - 下一阶段收益更可能来自 runtime 行为补强和 benchmark/diagnostic 补建模，而不是继续扩协议。

### 7. 关键风险点

- **动作瞬态问题尚未建模**
  - 证据：`packages/runtime/src/playwright-runner.ts:1382-1442` 对核心动作直接调用 Playwright API，没有统一动作级 retry 包装。
  - 风险：元素在定位成功后发生 rerender、短暂 detached、被局部层遮挡时，容易出现真实页面偶发红灯。
- **矩阵持续扩容但默认 profile 已较拥挤**
  - 证据：`examples/real-page-smoke.ts:1252-1281` 仍以 `baseline/p5/p6/p7` 兼容分发，且 `p6` 已被映射到 `p7`。
  - 风险：继续把新场景塞进 `p7` 会增加默认回归时长，并放大 case 计数和文档同步成本。
- **技术根因观测仍不够细**
  - 证据：`apps/studio/src/shared/failure-insights.ts:177-207` 中 runtime 非定位问题统一落到 `execution-error`。
  - 风险：即使 runtime 真正补了动作级韧性，若没有新的根因分类，排障收益会被折损。
- **recorded replay baseline 仍依赖显式名单和步数**
  - 证据：`packages/runtime/src/recorded-replay-matrix.test.ts` 对 case 顺序与 stepCount 做硬断言。
  - 风险：新增场景时若计划、脚本、测试不同步，容易产生“能力已接入但基线未更新”的假红。

### 8. 下一阶段候选结论

- **候选方向 A（推荐）**: `Wave 10 动作级韧性 + P8 技术根因观测`
  - runtime：为 `click / fill / select / setChecked / press / upload` 增加窄范围动作重试、必要时 re-resolve/scroll/重新等待
  - benchmarks：新增至少 2 个专门暴露动作瞬态问题的 fixture，并把默认矩阵与 `p8` 分层
  - diagnostics/studio：新增 detached/overlay-intercept 等技术根因分类与修复建议
- **候选方向 B**: 继续深挖键盘系统（多次 `ArrowDown/ArrowUp`、回环、无 aria 信号 command palette）
  - 价值存在，但相较动作级瞬态问题，覆盖面更窄
- **候选方向 C**: 优先重构矩阵计数与自动发现
  - 维护收益高，但对“用户实际执行更稳定”的直接提升较弱

- **当前推荐顺序**:
  1. 先做候选方向 A
  2. 若本轮节奏允许，再把 recorded replay / real-page baseline 的计数维护成本一起收敛
