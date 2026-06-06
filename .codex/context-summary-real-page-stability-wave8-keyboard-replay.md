## 项目上下文摘要（真实页面稳定性 Wave 8 键盘驱动录制回放）

生成时间：2026-06-07 03:58:00 CST

### 1. 相似实现分析

- **实现 1**: `apps/extension/entrypoints/content.ts:103`
  - 模式：扩展内容脚本在 `keydown` 里把用户按键收敛为 `keypress` recorded event，再交给 background session。
  - 可复用：`buildRecordedPressKey()`、`isSubmitLikePressKey()`、`recordPress()`。
  - 需注意：当前白名单只包含 `Enter`、`Tab`、`Escape`，对无修饰键的方向键完全忽略。
- **实现 2**: `apps/extension/lib/content-contract.test.ts:103`
  - 模式：用 fake DOM + mocked recorder 验证内容脚本录制合同。
  - 可复用：`loadContentModule()`、`keydown` handler 驱动、pending fill flush 验证方式。
  - 需注意：当前只锁住“提交型按键先 flush 再记录”，没有覆盖方向键保留 fill 缓冲的边界。
- **实现 3**: `packages/recorder/src/normalize.test.ts:284`
  - 模式：共享协议中的 `keypress` event 会被归一化为 DSL `press` step，后续还能参与自动 wait 推断。
  - 可复用：`event()` helper、`buildFlowFromEvents()`、`press -> wait -> click` 的断言模板。
  - 需注意：归一化层已经支持任意 `payload.key` 字符串，本轮大概率不需要改 recorder 生产代码。
- **实现 4**: `packages/runtime/src/playwright-runner.test.ts:1380`
  - 模式：runtime 已支持 `press` 执行与 `wait attached / detached / visible` 等组合。
  - 可复用：`executeFlow()` 的按键回放模板、fixture 临时文件生成模式。
  - 需注意：现有 runtime 测试证明“按键能执行”，但没有真实页面风格的键盘筛选 / 命令面板 recorded replay 场景。

### 2. 项目约定

- **命名约定**:
  - recorded replay 场景使用 `flow_recorded_*`。
  - fixture 名称使用 kebab-case，如 `linked-filters.html`、`session-dashboard.html`。
  - smoke case 名称使用简短英文 slug，如 `drawer-double-save`。
- **文件组织**:
  - 扩展内容录制行为在 `apps/extension/entrypoints/content.ts`。
  - 扩展合同测试放在 `apps/extension/lib/*.test.ts`。
  - runtime recorded replay 单测集中在 `packages/runtime/src/playwright-runner.test.ts`。
  - recorded smoke 入口集中在 `examples/recorded-replay-smoke.ts`。
- **导入顺序**:
  - 先第三方，再 monorepo 包，再本地相对路径。
- **代码风格**:
  - 最小行为增强优先，不引入第二套事件类型或额外执行器。
  - 文档与注释统一简体中文，标识符继续英文。

### 3. 可复用组件清单

- `apps/extension/entrypoints/content.ts`
  - `buildRecordedPressKey()`：按键过滤与标准化入口。
  - `recordPress()`：录制按键事件并决定是否 flush pending fill。
- `apps/extension/lib/content-contract.test.ts`
  - fake DOM/`keydown` handler 测试模板。
- `packages/shared/src/recording-protocol.ts`
  - `recordedEventTypeSchema`、`parseRecordedEvent()`：共享 recorded protocol 校验入口。
- `packages/recorder/src/normalize.ts`
  - `normalizePress()` / `insertInferredWaitSteps()`：按键 recorded event 到 DSL step 的桥接。
- `packages/runtime/src/playwright-runner.test.ts`
  - `buildRecordedFlowMeta()`、fixture server、`executeFlow()` recorded replay 模板。
- `examples/recorded-replay-smoke.ts`
  - `buildBaselineMatrixCases()`：recorded replay curated baseline 聚合入口。

### 4. 测试策略

- **测试框架**: Vitest + Playwright
- **测试模式**:
  - 扩展层：contract test，直接驱动 DOM 事件与 `browser.runtime.sendMessage`
  - recorder/runtime 层：recorded event -> Flow -> executeFlow 整链回归
  - smoke：`pnpm e2e:recorded-pages` 与 `pnpm e2e:real-pages`
- **参考文件**:
  - `apps/extension/lib/content-contract.test.ts`
  - `packages/recorder/src/normalize.test.ts`
  - `packages/runtime/src/playwright-runner.test.ts`
  - `packages/runtime/src/recorded-replay-matrix.test.ts`
- **覆盖要求**:
  - 正常流程：方向键筛选 + Enter 提交的键盘命令面板 recorded replay 成功
  - 边界条件：方向键不会误触发 pending fill flush
  - 回归条件：Node 20 下扩展合同、runtime recorded replay、recorded smoke、real-pages smoke 都通过

### 5. 依赖和集成点

- **外部依赖**: WXT content script、Playwright、Vitest
- **内部依赖**:
  - `content.ts` -> `@flowweave/recorder` payload builder
  - `background.ts` session -> `buildFlowFromEvents()`
  - `buildFlowFromEvents()` -> `executeFlow()`
- **集成方式**:
  - 内容脚本先录 `keypress` event
  - shared protocol 校验后由 recorder 归一化为 `press`
  - runtime 使用 Playwright `locator.press()` 或 `page.keyboard.press()`
- **配置来源**:
  - Node 验收统一使用 `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH`

### 6. 技术选型理由

- **为什么不新增 `keydown` / `keyup` 新事件类型**:
  - 共享协议、recorder 归一化与 runtime 已围绕 `keypress -> press` 跑通，继续复用现有协议改动最小。
- **为什么不把所有非文本按键都录下来**:
  - 方向键、Home/End、PageUp/PageDown 一刀切会明显放大噪声，尤其在普通输入框中会录到大量无业务意义的光标移动。
- **为什么优先聚焦组合框 / 命令面板 / suggest 输入**:
  - 这类真实页面普遍依赖 `ArrowDown / ArrowUp + Enter`，且正是“记录了内容却回放不好”的高频来源。

### 7. 关键风险点

- **录制噪声风险**:
  - 如果方向键录制范围过宽，普通文本编辑会生成无意义 `press` step。
- **覆盖错位风险**:
  - 只补扩展合同测试而不补 recorded replay fixture，无法证明真实回放收益。
- **协议漂移风险**:
  - 如果扩展层对方向键的条件判断与 runtime fixture 设计不一致，容易出现“能录但回放场景不典型”。

### 8. 推荐主题

- **Wave 8 主题**：`键盘驱动录制回放补齐`
- **推荐并行轨道**：
  1. `Keyboard Capture Contract`
  2. `Keyboard Replay Matrix`
- **主代理职责**：
  - 统一 Node 20 验收
  - 合并两条轨道
  - 扩 recorded replay / real-pages 矩阵后更新 `.codex` 留痕
