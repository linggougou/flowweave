## 项目上下文摘要（Benchmarks 缺口分析）

生成时间：2026-06-06 16:31:15 CST

### 1. 相似实现分析

- **实现 1**: `docs/guides/fixture-matrix.md:21`
  - 模式：以矩阵表维护 fixture、自动化步骤、可断言 DOM 和稳定性问题映射。
  - 可复用：后续新增场景仍应落到同一张矩阵中，不额外发明平行文档。
  - 需注意：文档已明确点名“分页、Tab、抽屉侧栏、二次确认 toast、登录失效”是下一轮候选。

- **实现 2**: `examples/real-page-smoke.ts:84`
  - 模式：所有真实页面基准统一由 `buildMatrixCases()` 生成，再由 `runRealPageFixtureMatrix()` 串行执行。
  - 可复用：新增 case 只需扩充矩阵数组、复用 `buildFlow()`、`storageStatePath` 和临时工作目录能力。
  - 需注意：当前只生成了“正向登录态” storage state，没有“失效会话”或多环境变体。

- **实现 3**: `examples/fixtures/filterable-list.html`
  - 模式：后台列表页的筛选栏 + 局部 loading + 结果摘要区。
  - 可复用：可作为分页场景的基础骨架，继续复用 `data-loading`、`data-ready`、结果数量断言。
  - 需注意：目前只覆盖筛选，不覆盖分页切页、页码状态变化和列表重新挂载。

- **实现 4**: `examples/fixtures/modal-bulk-action.html`
  - 模式：勾选记录 -> 打开覆盖层 -> 输入确认信息 -> 提交 -> 等待关闭和结果区展示。
  - 可复用：覆盖层、按钮启用态、`aria-busy` 和关闭后成功态的结构可以迁移到 Drawer 场景。
  - 需注意：这是“强存在感”的 modal，不是后台里更常见的抽屉、轻量 popconfirm 或短暂 toast。

- **实现 5**: `examples/fixtures/spa-route.html`
  - 模式：点击触发同页切换，依靠 loading、URL hash 和 `data-ready` 完成断言。
  - 可复用：与 Tab 切换共享“非整页刷新、点击后内容切换”的模式。
  - 需注意：当前仍依赖 URL 变化；真实后台中的 Tab 往往不改 URL，且 inactive panel 仍常驻 DOM。

- **实现 6**: `packages/runtime/src/playwright-runner.ts:243`
  - 模式：点击、选择、勾选、上传、按键后统一走 `waitForPageSettled()`；显式等待依赖 `wait visible/hidden/attached/detached/urlIncludes`。
  - 可复用：更高价值的新场景应优先锚定这些等待原语，而不是只加普通表单。
  - 需注意：当前稳定等待主要识别 loading mask、`aria-busy="true"` 和 `[data-loading='true']`，对短暂 toast、无 URL 变化 Tab、登录态失效跳转最容易暴露短板。

### 2. 项目约定

- **命名约定**：fixture 文件使用 kebab-case，矩阵 case 名与 fixture 名一致，flow id 使用 `flow_*` 形式。
- **文件组织**：本地 fixture 放在 `examples/fixtures/`，矩阵入口集中在 `examples/real-page-smoke.ts`，矩阵说明集中在 `docs/guides/fixture-matrix.md`。
- **导入顺序**：Node 内建模块在前，包级导入在后；矩阵脚本直接导入 `packages/*/src/index.ts` live implementation。
- **代码风格**：fixture 使用单文件自包含 HTML，文案简体中文，标识符英文，断言锚点优先 `id`、`data-testid`、`data-ready`。

### 3. 可复用组件清单

- `examples/real-page-smoke.ts`：矩阵定义、静态服务器、上传文件和 storage state 生成。
- `examples/run-real-page-smoke.ts`：矩阵执行结果打印，无需为新场景另起命令。
- `packages/runtime/src/playwright-runner.test.ts`：断言 case 总数和名称顺序，确保新增场景真正接入矩阵。
- `examples/fixtures/filterable-list.html`：列表页、局部 loading、结果摘要模式。
- `examples/fixtures/modal-bulk-action.html`：覆盖层、确认输入、关闭后结果区模式。
- `examples/fixtures/session-dashboard.html`：会话驱动页面初始化模式。

### 4. 测试策略

- **当前测试框架**：Vitest，runtime 侧通过 `packages/runtime/src/playwright-runner.test.ts` 动态导入真实页面矩阵。
- **矩阵验证方式**：`pnpm e2e:real-pages` 执行本地 fixture 回归；`pnpm smoke:full` 做仓库级联验证。
- **若进入下一轮实现**：
  - 先扩 `packages/runtime/src/playwright-runner.test.ts` 的 case 数量和名称断言。
  - 再补 `examples/real-page-smoke.ts` 新 case。
  - 最后新增 fixture 和同步 `docs/guides/fixture-matrix.md`。

### 5. 依赖和集成点

- **外部依赖**：Playwright 执行能力已具备，无需为下一轮场景新增重量依赖。
- **内部依赖**：
  - `examples/real-page-smoke.ts` 消费 `executeFlow()`。
  - `packages/runtime/src/playwright-runner.ts` 当前等待和定位能力决定了 fixture 应如何设计成功态。
  - `packages/runtime/src/playwright-runner.test.ts` 决定新增场景是否被 CI/烟测真正看见。
- **集成方式**：fixture 通过本地静态 server 提供 HTTP 基准；登录态通过 `storageStatePath` 注入；断言依赖可见性、URL 包含或结果区 ready 标记。

### 6. 技术选型理由

- **为什么优先补后台稳定性场景**：当前 7 个 case 已经覆盖基础表单、局部 loading、SPA 路由、上传、登录态恢复与 modal，但仍偏“理想型成功链路”；更容易让真实后台翻车的是分页、登录过期、抽屉、轻量二次确认和短暂 toast。
- **为什么不把 Tab 放到最高优先级**：`spa-route.html` 已部分覆盖“点击后同页内容切换”，Tab 的新增价值存在，但紧迫性低于分页、登录失效和轻量确认链路。
- **为什么建议继续用本地 fixture**：这类问题主要考验 DOM 稳定性、异步等待和环境切换，本地 fixture 最容易复现且不会被网络噪音污染。

### 7. 关键风险点

- **并发问题**：若下一轮同时补多个 fixture，需避免多人并发改 `examples/real-page-smoke.ts` 和 `packages/runtime/src/playwright-runner.test.ts`。
- **边界条件**：toast/popup 这类短暂元素若没有稳定 `data-open` 或结果区锚点，会让回归变成偶发绿灯。
- **性能瓶颈**：分页、抽屉和登录失效场景若都叠加长延迟，`smoke:full` 耗时会继续上升。
- **集成风险**：如果把“登录失效”直接塞进 `session-dashboard.html` 的现有正向逻辑，可能降低当前稳定性；更稳妥的是拆成新 fixture 或新 case。
