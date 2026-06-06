## 项目上下文摘要（真实页面稳定性 Wave 9 异步 Suggest / Active-Descendant 键盘稳定性）

生成时间：2026-06-07 03:54:29 CST

### 1. 当前目标

- 协调分支：`codex/real-page-stability-program`
- 当前主线状态：
  - `Wave 8` 已完成并收口，主工作区干净。
  - `recorded replay` 基线当前为 `12` 条。
  - `pnpm e2e:real-pages` 当前主线实跑为 `20` 条。
- 下一轮目标：
  - 把“输入后异步加载建议 -> `ArrowDown` / `ArrowUp` -> `Enter`”这一类真实后台常见流程纳入稳定录制与回放证据。
  - 优先补足 runtime 对 suggest / `aria-activedescendant` 的 ready 等待，而不是再扩一轮新的录制协议。

### 2. 相似实现分析

- **实现 1**：`apps/extension/entrypoints/content.ts:103-183`
  - 模式：扩展内容脚本先把按键收敛成 `keypress` recorded event，再由 recorder 归一化成 DSL `press` step。
  - 可复用：
    - `buildRecordedPressKey()`
    - `isKeyboardNavigationTarget()`
    - `isSubmitLikePressKey()`
  - 需注意：
    - 当前 `isKeyboardNavigationTarget()` 只要命中 `role="combobox"`、`aria-autocomplete` 或任意 `aria-controls` 就会放开方向键，缺少 `aria-autocomplete="none"` 这类反例保护。
- **实现 2**：`packages/recorder/src/normalize.ts:427-505`
  - 模式：`buildFlowFromEvents()` 通过 `inferWaitStep()` 只在“明显异步”的提交型动作后插入 `wait`。
  - 可复用：
    - `isAsyncWaitTriggerStep()`
    - `buildUrlIncludesFragment()`
    - `insertInferredWaitSteps()`
  - 需注意：
    - `press` 只有 `Enter / Tab / Escape / Ctrl|Meta+S` 才算 wait 触发器。
    - `ArrowDown / ArrowUp` 当前不会触发 recorder 侧自动 wait 推断。
- **实现 3**：`packages/runtime/src/playwright-runner.ts:748-1072`
  - 模式：runtime 在 `click / select / setChecked / press / upload` 后统一调用 `waitForPageSettled()`，再进入下一步。
  - 可复用：
    - `resolveTarget()`
    - `waitForTargetState()`
    - `waitForPageSettled()`
  - 需注意：
    - `waitForPageSettled()` 当前只看 loading mask、`[aria-busy='true']`、`[data-loading='true']` 和 `networkidle`。
    - 还没有针对 `aria-activedescendant`、listbox options ready、combobox 候选可见性的专门等待。
- **实现 4**：`examples/fixtures/keyboard-command-palette.html:268-336`
  - 模式：命令面板 fixture 已经具备 `aria-activedescendant` 和 `ArrowDown -> Enter` 语义，但筛选与高亮切换是同步完成的。
  - 可复用：
    - `filterCommands()`
    - `renderActiveState()`
    - `executeCommand()`
  - 需注意：
    - 当前 `input` 事件里没有 debounce、没有 loading、没有异步 options ready，因此它只能证明同步命令面板闭环。
- **实现 5**：`examples/fixtures/linked-filters.html:196-266` 与 `examples/fixtures/filterable-list.html:214-296`
  - 模式：现有真实页面 fixture 已普遍使用 `data-loading`、`aria-busy`、`setTimeout()` 来模拟后台异步刷新。
  - 可复用：
    - `setLoading(true/false)`
    - 结果 ready 节点
    - 基于 `hidden/visible` 的显式等待断言模式
  - 需注意：
    - 这些 fixture 验证的是按钮/筛选后的异步刷新，不是“输入框 suggestions 准备完成后再导航”的键盘链路。

### 3. 当前已知事实

- Wave 8 的键盘导航已经证明：
  - `ArrowDown / ArrowUp` 能在导航型目标上被录制。
  - `fill -> ArrowDown -> Enter` 的同步命令面板 recorded replay 可以稳定通过。
- 当前仍未证明：
  - debounce / 异步 suggestions 加载完成前，回放是否会过早发送 `ArrowDown`。
  - `ArrowDown` 之后，runtime 是否会等待 `aria-activedescendant` 或 active option 真正更新，再继续执行 `Enter`。
- 旧 `Target Disambiguation` 文档里提到的很多能力，当前仓库已经部分或大部分落地：
  - `scopeText / scopeKind` 已在协议、recorder、runtime、Studio 中存在。
  - `repeated-row-actions` 相关 fixture 和 recorded replay 基线已存在。
- 因此下一轮不应直接沿用旧歧义方案，而应转向“异步 suggest 键盘稳定性”这一更贴近真实痛点的主题。

### 4. 项目约定

- **语言与风格**：
  - 文档、日志、注释统一简体中文。
  - 生产代码保持 TypeScript strict 与既有命名。
- **文件组织**：
  - 扩展内容录制逻辑在 `apps/extension/entrypoints/content.ts`
  - 录制归一化与自动 wait 推断在 `packages/recorder/src/normalize.ts`
  - runtime 执行器在 `packages/runtime/src/playwright-runner.ts`
  - fixture 与 smoke 入口集中在 `examples/`
- **验证基线**：
  - Node 统一使用 `20.19.6`
  - 当前有效命令前缀：
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH`

### 5. 可复用组件清单

- `apps/extension/entrypoints/content.ts`
  - `isKeyboardNavigationTarget()`：方向键录制开口的唯一入口。
- `apps/extension/lib/content-contract.test.ts`
  - fake DOM + `keydown` handler 合同测试模板。
- `packages/recorder/src/normalize.ts`
  - `normalizePress()`、`inferWaitStep()`：recorded event 到 DSL 的桥接。
- `packages/runtime/src/playwright-runner.ts`
  - `waitForPageSettled()`：当前动作后通用稳定等待入口。
  - `resolveTarget()`：先定位目标，再决定下一步如何执行。
- `packages/runtime/src/playwright-runner.test.ts`
  - 使用 `executeFlow()` 与临时 fixture 的整链测试模板。
- `examples/recorded-replay-smoke.ts`
  - recorded replay curated baseline 聚合入口。
- `examples/real-page-smoke.ts`
  - hand-written 真实页面矩阵聚合入口。

### 6. 测试策略

- **测试框架**：Vitest + Playwright
- **测试模式**：
  - 扩展层：contract test，验证方向键录制开口和 pending fill flush 边界。
  - runtime 层：`executeFlow()` 驱动的按键等待与 ready 条件测试。
  - smoke 层：
    - `pnpm e2e:recorded-pages`
    - `pnpm e2e:real-pages`
- **参考文件**：
  - `apps/extension/lib/content-contract.test.ts:291-427`
  - `packages/recorder/src/normalize.test.ts:809-946`
  - `packages/runtime/src/playwright-runner.test.ts:1441-1489`
  - `examples/recorded-replay-smoke.ts:726-781`
  - `examples/real-page-smoke.ts:463-501`
- **覆盖要求**：
  - 正常流程：异步 suggestions 完成后，`ArrowDown` 选中目标候选，`Enter` 命中正确命令。
  - 边界条件：
    - `aria-autocomplete="none"` 或伪 `aria-controls` 目标不应误录方向键。
    - recorder 不应为导航方向键自动插入宽泛 wait。
  - 回归条件：Node 20 下扩展合同、runtime 测试、recorded smoke、real-pages smoke 全通过。

### 7. 依赖与集成点

- **外部依赖**：
  - WXT content script
  - Playwright
  - Vitest
- **内部依赖链路**：
  - `content.ts` 录 `keypress`
  - `@flowweave/shared` 校验 recorded protocol
  - `@flowweave/recorder` 归一化为 `press`
  - `@flowweave/runtime` 用 Playwright 执行 `locator.press()`
- **集成关键点**：
  - 若要增强异步 suggest 稳定性，优先落在 runtime 对“真实 DOM 当前状态”的观察，不优先扩协议。
  - 若要减少录制噪声，则只收紧 `isKeyboardNavigationTarget()`，避免改动 recorder 协议。

### 8. 技术选型理由

- **为什么不优先扩 recorded protocol**：
  - 当前协议已经能表达 `keypress -> press`；问题主要出在 replay 时机与 ready 判断，而不是事件类型不够。
- **为什么优先补 runtime 窄等待，而不是 recorder 自动插入 `ms` wait**：
  - recorder 侧插固定毫秒等待会把录制时延迟硬编码进 Flow，稳定性差且不易复用。
  - runtime 可以直接读取当前 DOM 的 `aria-controls`、`aria-activedescendant`、listbox options 可见性，更贴近真实 ready 状态。
- **为什么仍保留一条扩展收紧轨道**：
  - 现在任意 `aria-controls` 都会放开方向键，容易把并非 suggest 的输入框误记成导航流程，先收紧可避免把新能力建立在错误样本上。

### 9. 关键风险点

- **误录风险**：
  - 如果扩展继续把非 suggest 输入也识别成导航目标，会放大录制噪声。
- **等待过宽风险**：
  - 如果 runtime 在所有 `fill` / `press` 后都加重等待，会拖慢现有稳定路径，甚至引入假超时。
- **覆盖脱节风险**：
  - 只补 runtime helper 不补 recorded replay / real-pages 基线，无法证明真实用户价值。
- **文档漂移风险**：
  - `recorded-replay-matrix.md`、`fixture-matrix.md`、`real-page-matrix.test.ts` 已有部分数字落后于主线，需要在 Wave 9 同步对齐。

### 10. 推荐主题与轨道

- **Wave 9 主题**：`异步 Suggest / Active-Descendant 键盘稳定性`
- **推荐并行轨道**：
  1. `Capture Heuristic Tightening`
  2. `Press Wait Stabilization`
  3. `Async Suggest Replay Matrix`
- **主代理职责**：
  - 统一 Node 20 验收
  - 按通过顺序合并轨道
  - 更新 `.codex/operations-log.md` 与 `.codex/verification-report.md`
  - 回收 worktree / 分支 / 子代理
