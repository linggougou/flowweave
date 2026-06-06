## 项目上下文摘要（真实页面稳定性增强 Wave 4）

生成时间：2026-06-06 22:06:36 CST

### 1. 相似实现分析

- **实现 1**: [apps/extension/entrypoints/content.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/extension/entrypoints/content.ts:27)
  - 模式：content script 通过 `change` / `blur` / `input` / `keydown` 事件采集用户交互，再交给 recorder 归一化。
  - 可复用：`recordInteractionFromElement`、`buildUploadReplayInputs`、`recordPress`。
  - 需注意：当前 `readFillValue()` 只读取 `input/textarea`，`shouldRecordFill()` 也只认传统表单控件，`contenteditable` 无法进入录制闭环。
- **实现 2**: [packages/recorder/src/target-from-dom.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/recorder/src/target-from-dom.ts:124)
  - 模式：录制端通过 `buildStrategies()`、`buildInteractionPayload()` 统一生成多策略定位 payload。
  - 可复用：`readAccessibleName()`、`readLabelText()`、`readTextSample()`、`buildInteractionPayload()`。
  - 需注意：`isTextLikeInput()` 只把 `textarea/select/input` 视为 fill 目标，没有覆盖 `HTMLElement.isContentEditable`。
- **实现 3**: [examples/real-page-smoke.ts](/Users/ling/codeHome/A_Mine/flowweave/examples/real-page-smoke.ts:764)
  - 模式：通过 `runRealPageFixtureMatrix()` 把 fixture Flow、变量、storageState 和汇总统计统一组织成稳定回归入口。
  - 可复用：`buildBaselineMatrixCases()`、`buildP5MatrixCases()`、统一汇总输出结构。
  - 需注意：当前已有 `p5` 15 个场景，但矩阵文档仍保留“跨页批量选择、双态会话恢复、抽屉二次保存校验、失败类型长期基线”等后续建议，尚未落地。
- **实现 4**: [apps/studio/src/DiagnosticInspector.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/DiagnosticInspector.tsx:42)
  - 模式：Studio 在应用内读取 diagnostic / page snapshot，并展示策略命中、目标提示与可打开产物。
  - 可复用：`countStrategyAttempts()`、`resolvePrimaryDiagnosticHint()`、诊断步骤切换 UI。
  - 需注意：当前仍以“优先排查”单条提示为主，没有结构化“修复建议”列表，难以把诊断信息转成明确动作。

### 2. 项目约定

- **命名约定**：
  - 协调分支继续使用 `codex/real-page-stability-program`。
  - 并行功能分支沿用 `codex/real-page-*` 命名。
- **文件组织**：
  - 录制能力继续集中在 `apps/extension/**` 与 `packages/recorder/**`。
  - 真实页面基准集中在 `examples/**` 与 `docs/guides/fixture-matrix.md`。
  - Studio 排障体验集中在 `apps/studio/src/**` 与必要的共享类型文件。
- **导入顺序**：标准库 -> workspace 包 -> 本地模块；类型优先 `import type`。
- **代码风格**：TypeScript strict、ESM、中文注释、纯函数优先、React 侧尽量只做编排。

### 3. 可复用组件清单

- [apps/extension/entrypoints/content.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/extension/entrypoints/content.ts:27)：录制事件采集入口。
- [packages/recorder/src/target-from-dom.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/recorder/src/target-from-dom.ts:364)：定位策略与 payload 生成。
- [packages/recorder/src/normalize.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/recorder/src/normalize.ts:368)：录制事件到 `NormalizedStep` 的归一化。
- [examples/real-page-smoke.ts](/Users/ling/codeHome/A_Mine/flowweave/examples/real-page-smoke.ts:764)：真实页面矩阵主入口。
- [apps/studio/src/DiagnosticInspector.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/DiagnosticInspector.tsx:57)：Studio 内诊断展示入口。

### 4. 测试策略

- **测试框架**：Vitest。
- **录制侧**：
  - `packages/recorder/src/target-from-dom.test.ts`
  - `packages/recorder/src/normalize.test.ts`
  - 必要时 `apps/extension/lib/*.test.ts`
- **Studio 侧**：
  - `apps/studio/src/DiagnosticInspector.test.tsx`
  - 必要时新增 `shared` 纯函数测试
- **基准矩阵侧**：
  - `packages/runtime/src/real-page-matrix.test.ts`
  - `pnpm e2e:real-pages`
- **统一验收**：继续以 Node 20 为稳定基线，执行 `pnpm lint`、`pnpm smoke`，若矩阵入口扩展则加跑 `pnpm smoke:full`。

### 5. 依赖和集成点

- **录制链路**：`content.ts` -> `@flowweave/recorder` payload -> `normalize.ts` -> `FlowDocument`
- **基准链路**：`examples/real-page-smoke.ts` -> `executeFlow()` -> `packages/runtime`
- **排障链路**：`services.ts` 产出 step diagnostic -> `DiagnosticInspector.tsx` 展示
- **文档链路**：`docs/guides/fixture-matrix.md` 是真实页面基准范围和价值说明的人工事实来源

### 6. 技术选型理由

- **为什么优先做 contenteditable 录制闭环**：
  - 当前矩阵已经证明 runtime 能回放手写的 `contenteditable` 场景，但真实录制端录不出来，这是“能跑但录不到”的真实断口。
- **为什么继续扩展本地 fixture，而不是直接切外部站点**：
  - 当前问题主要是复杂 DOM 结构、局部 loading、会话恢复和交互时序，本地 fixture 更稳定、更可精确回归。
- **为什么再补 Studio 修复建议层**：
  - 用户已经能看到 diagnostic JSON 摘要，但还需要更短路径地知道“下一步该改什么”，否则排障成本仍高。

### 7. 关键风险点

- **接口漂移**：contenteditable 录制若只改 content script、不改 recorder payload 测试，容易出现“事件发出但 normalize 不认”的回归。
- **共享文件冲突**：`examples/real-page-smoke.ts` 与 `docs/guides/fixture-matrix.md` 是基准扩展高冲突点，不适合多轨同时修改。
- **验证时长**：新增 P6 场景后，`pnpm e2e:real-pages` 和 `pnpm smoke:full` 耗时会增加，需要控制单场景复杂度。
- **用户体验风险**：Studio 修复建议若直接重复原错误文案，价值不大；需要真正给出动作导向建议。
