# 真实页面 Fixture 矩阵

本矩阵起始于 `Benchmarks` 轨道第一阶段，用于沉淀稳定、可复现的本地 HTML fixture。

当前 `Benchmarks` 第三阶段已经把这些 fixture 接入真实回归脚本：

- `examples/real-page-smoke.ts`
- `examples/run-real-page-smoke.ts`
- `pnpm e2e:real-pages`
- `pnpm smoke:full`

所有页面都满足以下约束：

- 单文件自包含，可直接通过 `file://` 打开。
- 页面内有明确的交互目标与成功态 DOM。
- 关键断言节点使用稳定 `id` 或 `data-*` 标记。
- 不依赖外部接口或网络请求，便于后续回归脚本稳定复用。

## 总览矩阵

| Fixture | 主要交互目标 | 建议自动化步骤 | 可断言 DOM 结果 | 预计覆盖的稳定性问题 |
| --- | --- | --- | --- | --- |
| `examples/fixtures/checkbox-select.html` | `select`、checkbox、按钮启用态 | 选择城市 -> 勾选授权 -> 可选勾选提醒 -> 点击保存 | `#result-panel[data-ready="true"]`、`#result-city`、`#result-agree`、`#result-notice` | select 语义识别、checkbox 去噪、动态按钮启用、表单提交后结果断言 |
| `examples/fixtures/delayed-panel.html` | 点击后延迟展示结果面板 | 点击加载 -> 等待 `#loading-indicator` 消失 -> 断言 `#report-panel` 可见 | `#report-panel[data-ready="true"]`、`#completed-steps`、`#manual-checks`、`#retry-count` | 动作后稳定等待、`visible/hidden` 条件、局部 loading、`aria-busy` 检测 |
| `examples/fixtures/upload-form.html` | 文件上传、文件预览、提交结果 | 填写提交人 -> 设置文件 -> 点击提交 | `#file-preview[data-ready="true"]`、`#selected-count`、`#upload-result[data-ready="true"]`、`#result-batch` | `upload` 语义、文件列表断言、表单可用态、提交后结果回显 |
| `examples/fixtures/spa-route.html` | 同页路由切换与延迟渲染 | 点击导航 -> 等待 loading 消失 -> 断言 hash 与标题 | `#route-token`、`#route-title`、`#route-hash`、`#route-card[data-ready="true"]` | SPA hash 路由切换、点击后非整页刷新、动作后 URL 校验、局部异步渲染 |
| `examples/fixtures/session-dashboard.html` | 登录态 localStorage 注入、受会话影响的页面初始化 | 通过 `storageState` 预置登录态 -> 打开日报 -> 等待结果面板可见 | `#session-state`、`#session-user`、`#report-panel[data-ready="true"]`、`#report-owner` | `storageStatePath` 透传、登录态环境注入、真实页面会话恢复 |
| `examples/fixtures/filterable-list.html` | 列表筛选、局部 loading、结果数量回填 | 输入关键字 -> 选择状态 -> 点击筛选 -> 等待 loading 消失 | `#filter-summary[data-ready="true"][data-count="2"]`、`#result-count`、`#result-status`、`#result-keyword` | 筛选链路稳定等待、列表结果数量断言、局部刷新与空结果态前置能力 |
| `examples/fixtures/modal-bulk-action.html` | 覆盖层弹窗、批量操作、确认文本填写 | 勾选任务 -> 打开弹窗 -> 填写原因 -> 确认归档 -> 等待弹窗关闭和结果展示 | `#archive-modal[data-ready="true"]`、`#confirm-archive`、`#archive-result[data-ready="true"]`、`#archive-result-summary` | Modal 遮罩层稳定定位、弹窗内表单填写、关闭后结果区断言、批量操作链路 |

## 页面细节

### `checkbox-select.html`

- 交互目的：
  - 模拟真实表单中的下拉选择与复选框组合。
  - 验证“点击 checkbox”与“设置 checked 状态”两类录制/执行语义都能回到同一个成功态。
- 关键断言：
  - `#save-preferences` 只有在城市已选且 `#agree` 勾选后才启用。
  - 提交后 `#result-panel` 从隐藏切换为显示，并写入城市、授权、提醒三项结果。
- 后续自动化价值：
  - 适合覆盖 `select`、`setChecked`、`click` 的组合流程。
  - 适合验证 checkbox 前置 click 噪声是否被归并。

### `delayed-panel.html`

- 交互目的：
  - 模拟按钮点击后出现 loading，随后局部面板异步渲染完成的页面。
  - 为 runtime 的等待策略提供稳定、可复现的非导航型场景。
- 关键断言：
  - 点击 `#load-panel` 后 `#loading-indicator` 显示，容器带 `aria-busy="true"`。
  - 约 1.2 秒后 `#loading-indicator` 隐藏，`#report-panel[data-ready="true"]` 可见。
  - `#completed-steps`、`#manual-checks`、`#retry-count` 被填入确定值。
- 后续自动化价值：
  - 适合覆盖 `wait visible`、`wait hidden`、点击后稳定等待。
  - 适合验证局部 loading 标记与禁用按钮场景。

### `upload-form.html`

- 交互目的：
  - 模拟本地表单上传文件并展示文件预览与提交结果。
  - 为后续 `upload`、`fill`、可用态判断提供基准页面。
- 关键断言：
  - 设置文件后 `#file-preview[data-ready="true"]` 显示，`#selected-files` 回显文件名。
  - 填写提交人并选择文件后 `#submit-upload` 才可点击。
  - 提交后 `#upload-result[data-ready="true"]` 显示，`#result-file-count` 与 `#result-batch` 可直接断言。
- 后续自动化价值：
  - 适合覆盖 file input、单文件与多文件上传。
  - 适合验证结果区是否正确消费浏览器传入的 `FileList`。

### `spa-route.html`

- 交互目的：
  - 模拟单页应用中的 hash 路由切换和延迟内容渲染。
  - 为录制器的路由变更监听和 runtime 的 URL 断言提供本地基准。
- 关键断言：
  - 点击导航按钮后显示 `#route-loading`，随后 hash 更新为目标路由。
  - `#route-token` 写成 `route:<route>`，`#route-title` 与列表内容切到目标路由。
  - 当前路由按钮带 `aria-current="page"`。
- 后续自动化价值：
  - 适合覆盖 SPA 点击后 URL 变化但不刷新文档的场景。
  - 适合验证“等待路由就绪标记”是否优于只等网络空闲。

### `session-dashboard.html`

- 交互目的：
  - 模拟“页面内容依赖已登录会话”的真实场景。
  - 验证 Studio / runtime 已打通的 `storageStatePath` 是否真正传递到 Playwright `browser.newContext()`。
- 关键断言：
  - 注入 localStorage 后，页面初始即从“访客模式”切换到“已登录环境”。
  - `#session-user` 与 `#report-owner` 都会回显当前登录用户。
  - 点击 `#open-report` 后，`#report-panel[data-ready="true"]` 可见。
- 后续自动化价值：
  - 适合覆盖登录态恢复、会话环境切换、受权限影响的页面初始化。
  - 适合验证“流程本身没问题，但环境没注入导致失败”的真实问题。

### `filterable-list.html`

- 交互目的：
  - 模拟后台列表页的“关键字 + 状态”联合筛选。
  - 为 runtime 提供点击后局部 loading、列表项显隐和结果摘要回填的稳定基准。
- 关键断言：
  - 点击 `#apply-filters` 后，`#filter-loading` 先显示，再在约 `720ms` 后隐藏。
  - `#filter-summary[data-ready="true"][data-count="2"]` 会暴露命中数量，适合直接做强断言。
  - `#result-status`、`#result-keyword` 与列表项显隐会同步到最新筛选结果。
- 后续自动化价值：
  - 适合覆盖筛选栏、结果数量校验、列表页局部刷新。
  - 适合作为后续分页、排序、空结果态等后台页面能力的基础夹具。

### `modal-bulk-action.html`

- 交互目的：
  - 模拟真实后台中常见的“勾选记录 -> 打开覆盖层弹窗 -> 填写原因 -> 批量提交”。
  - 为 runtime 提供覆盖层可见性、弹窗内输入、提交后弹窗关闭与结果回显的稳定基准。
- 关键断言：
  - 勾选任务后 `#open-archive-modal` 才会启用。
  - 打开后 `#archive-modal[data-ready="true"]` 可见，且 `#confirm-archive` 只有在原因长度达到 4 个字后才可点击。
  - 提交完成后弹窗隐藏，`#archive-result[data-ready="true"]` 显示并回填归档摘要。
- 后续自动化价值：
  - 适合覆盖 Modal 遮罩层、批量工具条、弹窗确认表单。
  - 适合验证“元素可见但被遮罩层影响”“提交后等待弹窗关闭再继续”的真实稳定性问题。

## 当前回归入口

- `examples/real-page-smoke.ts`
  - 统一定义 7 个 fixture 的 Flow、上传测试文件和 `storageStatePath` 注入配置。
- `examples/run-real-page-smoke.ts`
  - 负责打印矩阵结果、耗时和每个 case 的产物目录。
- `pnpm e2e:real-pages`
  - 独立执行真实页面矩阵，适合局部回归 Benchmarks 轨道。
- `pnpm smoke:full`
  - 在仓库级 `typecheck / test / build / e2e:login` 之后，再补跑真实页面矩阵。

## 后续扩展建议

1. 增补分页、Tab 切换、抽屉侧栏、二次确认 toast 等更贴近后台页面的基准。
2. 把 `session-dashboard` 扩展为“登录态失效 -> 回到访客模式”的双态基准。
3. 为矩阵汇总保留成功率、失败类型与平均耗时，形成可比对的长期基线。

## 备注

- 第一阶段只落 fixture 与文档，不改 runtime / test，是为了避免在 Foundation / Runtime 轨道接口未完全合入前引入耦合。
- 第二阶段已新增 `examples/run-real-page-smoke.ts`、runtime 矩阵测试与 `session-dashboard.html`。
- 第三阶段继续扩到 `filterable-list.html` 与 `modal-bulk-action.html`，矩阵总数提升到 `7`。
- 矩阵脚本直接从 `packages/*/src/index.ts` 导入 live implementation，避免脚本误吃旧 `dist` 产物，导致基准结果与当前源码脱节。
