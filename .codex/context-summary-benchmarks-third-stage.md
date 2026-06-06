## 项目上下文摘要（Benchmarks 第三阶段：列表筛选与 Modal 基准）

生成时间：2026-06-06 16:14:00 CST

### 1. 相似实现分析

- **实现 1**: `examples/fixtures/checkbox-select.html`
  - 模式：英雄区说明 + 表单主区域 + `data-ready` 结果面板。
  - 可复用：稳定 `id` / `data-testid` 标记、按钮启用态、提交后结果回填。
  - 需注意：适合静态表单，不覆盖异步加载与覆盖层。

- **实现 2**: `examples/fixtures/delayed-panel.html`
  - 模式：点击后 `aria-busy` + loading 提示 + 延迟结果区渲染。
  - 可复用：`wait hidden`、`wait visible`、异步状态切换。
  - 需注意：结果区没有覆盖层结构，无法覆盖弹窗遮罩类问题。

- **实现 3**: `examples/fixtures/spa-route.html`
  - 模式：局部点击触发非整页刷新，再通过 DOM 与 URL 双重就绪标记断言。
  - 可复用：局部状态机、按钮 `aria-current`、`data-ready` 卡片。
  - 需注意：没有筛选列表、结果数量或空结果态。

- **实现 4**: `examples/fixtures/session-dashboard.html`
  - 模式：初始环境决定首屏内容，再通过按钮打开结果区。
  - 可复用：简洁布局、状态 chip、会话态驱动视图切换。
  - 需注意：登录态覆盖的是初始化问题，不覆盖交互中的弹窗与筛选链路。

- **实现 5**: `examples/real-page-smoke.ts`
  - 模式：所有 fixture 统一在 `buildMatrixCases()` 内定义 Flow，最终由 `runRealPageFixtureMatrix()` 循环执行。
  - 可复用：`buildFlow()`、workspace 级测试文件创建、统一 artifact 目录输出。
  - 需注意：新增 case 应直接扩在矩阵内，避免另起平行 smoke 入口。

- **实现 6**: `packages/runtime/src/playwright-runner.test.ts`
  - 模式：用 runtime 真实执行测试兜底矩阵能力，最终只断言 `summary.failed` 长度为 0。
  - 可复用：通过动态 import 直接调用 `examples/real-page-smoke.ts`。
  - 需注意：若要确保新 case 真接入，测试需增加 case 数量或名称断言。

### 2. 项目约定

- fixture 页面继续使用简体中文文案、英文标识符。
- 结果断言节点优先使用稳定 `id`、`data-testid`、`data-ready`。
- 异步交互优先给出 `aria-busy`、loading 文案或可见性切换，方便 runtime `wait` 断言。
- 新回归入口不另起命令，统一继续挂在 `pnpm e2e:real-pages` / `pnpm smoke:full`。

### 3. 可复用组件清单

- `examples/real-page-smoke.ts`：统一矩阵定义与静态服务器。
- `packages/runtime/src/playwright-runner.test.ts`：矩阵集成测试入口。
- `examples/fixtures/delayed-panel.html`：异步等待与 loading 模式参考。
- `examples/fixtures/checkbox-select.html`：表单启用态与结果区模式参考。
- `examples/fixtures/spa-route.html`：按钮状态切换与 `data-ready` 卡片模式参考。

### 4. 测试策略

- 红灯入口：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
  - 通过修改矩阵测试，要求新增 `filterable-list` 与 `modal-bulk-action` 两个 case。
- 绿灯验证：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:full`

### 5. 依赖和集成点

- 只修改：
  - `examples/fixtures/*.html`
  - `examples/real-page-smoke.ts`
  - `packages/runtime/src/playwright-runner.test.ts`
  - `docs/guides/fixture-matrix.md`
- 不修改 runtime 核心执行接口，避免与当前稳定基线再次耦合。

### 6. 技术选型理由

- 选择“列表筛选 + Modal”而不是继续补表单，是因为这两类场景更接近真实后台页面，也更容易暴露 click 后异步稳定、覆盖层遮挡、局部 loading 和结果断言问题。
- 继续使用本地 fixture，而不是外部真实站点，是为了保证回归可重复、可控、可在无网络依赖下运行。

### 7. 关键风险点

- 若新 fixture 没有稳定 ready 标记，容易让 runtime 测试变成偶发绿灯。
- 若只补 fixture 不补测试对 case 数量的断言，新增场景可能没有真正接入矩阵。
- `smoke:full` 耗时会继续上升，需要控制新 case 的异步延迟长度。
