## 项目上下文摘要（录制事件到回放整链回归）

生成时间：2026-06-06 23:10:00 CST

### 1. 相似实现分析

- **实现 1**: `apps/extension/entrypoints/content.ts`
  - 模式：页面交互被采集成 `RecordedEvent`，其中 file input 会生成 `{{upload_xxx_n}}` 形式的回放占位符。
  - 可复用：`recordInteractionFromElement()`、`buildUploadReplayInputs()`、`recordPress()`。
  - 需注意：录制端已经生成可回放占位符，但不会直接声明 Flow 变量。

- **实现 2**: `packages/recorder/src/normalize.ts`
  - 模式：`RecordedEvent` 先归一化为 `NormalizedStep`，再由 `buildFlowFromEvents()` 拼装成 `FlowDocument`。
  - 可复用：`normalizeFill()`、`normalizeKeypress()`、`ensureLeadingNavigate()`。
  - 需注意：当前 `buildFlowFromEvents()` 固定返回 `variables: []`，这会让 upload 占位符缺少声明。

- **实现 3**: `packages/runtime/src/playwright-runner.test.ts`
  - 模式：runtime 已能执行 `upload` 并对数组字符串变量做插值。
  - 可复用：`mkdtempSync()` + 临时文件构造、`executeFlow()`、`buildFlow()` 测试夹具模式。
  - 需注意：现有测试大多是“手写 Flow”，不是“录制事件导出的 Flow”。

- **实现 4**: `apps/studio/src/App.tsx`
  - 模式：运行表单根据 `flow.variables` 渲染变量输入。
  - 可复用：已有变量输入与默认值回填逻辑，无需新建第二套 UI 契约。
  - 需注意：如果录制导出的 Flow 没有变量声明，Studio 无法提示用户补 upload 文件路径。

### 2. 项目约定

- **命名约定**：标识符英文，日志与注释简体中文。
- **文件组织**：
  - 录制入口：`apps/extension/entrypoints/content.ts`
  - 录制归一化：`packages/recorder/src/normalize.ts`
  - 执行回归：`packages/runtime/src/playwright-runner.test.ts`
- **代码风格**：TypeScript strict，优先在既有测试文件就地补回归，不新增多余脚本。

### 3. 可复用组件清单

- `buildFlowFromEvents()`：录制事件聚合入口。
- `parseRecordedEvent()`：与扩展真实消息协议保持一致的测试入口。
- `executeFlow()`：runtime 执行唯一入口。
- `apps/studio/src/App.tsx` 的变量表单：消费 `flow.variables`，不需要新 UI 协议。

### 4. 测试策略

- **测试框架**：Vitest。
- **红灯目标**：
  - 录制得到的 upload 占位符应该自动转成 `flow.variables`。
  - 用 `RecordedEvent[]` 构建出的真实 upload Flow 应该能在 runtime 中成功回放。
- **验证命令**：
  - `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
  - `pnpm --filter @flowweave/recorder test -- normalize.test.ts`
  - 最终 Node 20：`pnpm lint`、`pnpm smoke`

### 5. 依赖和集成点

- **内部链路**：
  - `content.ts` -> `RecordedEvent`
  - `RecordedEvent` -> `buildFlowFromEvents()`
  - `FlowDocument.variables + steps` -> Studio / runtime
- **关键约束**：
  - runtime 变量插值已经支持字符串数组；
  - Studio 变量输入完全依赖 `flow.variables`；
  - upload 占位符当前主要由录制端生成。

### 6. 技术选型理由

- **为什么优先补变量声明**：
  - 这是“录得出来但执行不好用”的最短链路缺口，且不需要改 runtime 主行为。
- **优势**：
  - 可以直接复用现有 Studio 变量输入与 runtime 插值能力。
- **风险点**：
  - 占位符提取若扫描范围过宽，可能把非执行字段误判成变量；
  - 变量顺序若不稳定，会让回归测试脆弱。
