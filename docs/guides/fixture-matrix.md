# 真实页面 Fixture 矩阵

本矩阵起始于 `Benchmarks` 轨道第一阶段，用于沉淀稳定、可复现的本地 HTML fixture。

当前 `Benchmarks` 第七阶段已经把这些 fixture 接入真实回归脚本：

- `examples/real-page-smoke.ts`
- `examples/run-real-page-smoke.ts`
- `pnpm e2e:real-pages`
- `pnpm smoke:full`

当前矩阵分成四个档位：

- `baseline`
  - 当前主线的基础真实页面夹具已扩到 `13` 个核心交互场景，其中 Wave 8 纳入了 `keyboard-command-palette`，Wave 9 再补 `async-command-palette`。
- `p5`
  - 在 `baseline` 之上新增 `4` 个更贴近后台站点的 fixture，由 `examples/run-real-page-smoke.ts` 和 `pnpm e2e:real-pages` 默认执行。
- `p6`
  - 在 `p5` 之上继续新增 `3` 个后台异常路径 / 复杂状态切换 fixture，并输出失败类型统计、最慢场景排行与成功态覆盖摘要；当前默认由 `examples/run-real-page-smoke.ts` 和 `pnpm e2e:real-pages` 执行。
- `p7`
  - 在 `p6` 之上新增 `1` 个“重复行同文案按钮” fixture，用于验证目标消歧；随后又通过 `examples/real-page-smoke.ts` 兼容接入 `keyboard-command-palette` 与 `async-command-palette` 两条键盘基线，因此 `pnpm e2e:real-pages` 当前会直接执行 `21` 个场景的最新兼容矩阵。

所有页面都满足以下约束：

- 单文件自包含，可直接通过 `file://` 打开。
- 页面内有明确的交互目标与成功态 DOM。
- 关键断言节点使用稳定 `id` 或 `data-*` 标记。
- 不依赖外部接口或网络请求，便于后续回归脚本稳定复用。

## 总览矩阵

| Fixture                                            | 主要交互目标                                     | 建议自动化步骤                                                                             | 可断言 DOM 结果                                                                                                                | 预计覆盖的稳定性问题                                                  |
| -------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `examples/fixtures/checkbox-select.html`           | `select`、checkbox、按钮启用态                   | 选择城市 -> 勾选授权 -> 可选勾选提醒 -> 点击保存                                           | `#result-panel[data-ready="true"]`、`#result-city`、`#result-agree`、`#result-notice`                                          | select 语义识别、checkbox 去噪、动态按钮启用、表单提交后结果断言      |
| `examples/fixtures/delayed-panel.html`             | 点击后延迟展示结果面板                           | 点击加载 -> 等待 `#loading-indicator` 消失 -> 断言 `#report-panel` 可见                    | `#report-panel[data-ready="true"]`、`#completed-steps`、`#manual-checks`、`#retry-count`                                       | 动作后稳定等待、`visible/hidden` 条件、局部 loading、`aria-busy` 检测 |
| `examples/fixtures/upload-form.html`               | 文件上传、文件预览、提交结果                     | 填写提交人 -> 设置文件 -> 点击提交                                                         | `#file-preview[data-ready="true"]`、`#selected-count`、`#upload-result[data-ready="true"]`、`#result-batch`                    | `upload` 语义、文件列表断言、表单可用态、提交后结果回显               |
| `examples/fixtures/spa-route.html`                 | 同页路由切换与延迟渲染                           | 点击导航 -> 等待 loading 消失 -> 断言 hash 与标题                                          | `#route-token`、`#route-title`、`#route-hash`、`#route-card[data-ready="true"]`                                                | SPA hash 路由切换、点击后非整页刷新、动作后 URL 校验、局部异步渲染    |
| `examples/fixtures/session-dashboard.html`         | 登录态 localStorage 注入、受会话影响的页面初始化 | 通过 `storageState` 预置登录态 -> 打开日报 -> 等待结果面板可见                             | `#session-state`、`#session-user`、`#report-panel[data-ready="true"]`、`#report-owner`                                         | `storageStatePath` 透传、登录态环境注入、真实页面会话恢复             |
| `examples/fixtures/filterable-list.html`           | 列表筛选、局部 loading、结果数量回填             | 输入关键字 -> 选择状态 -> 点击筛选 -> 等待 loading 消失                                    | `#filter-summary[data-ready="true"][data-count="2"]`、`#result-count`、`#result-status`、`#result-keyword`                     | 筛选链路稳定等待、列表结果数量断言、局部刷新与空结果态前置能力        |
| `examples/fixtures/modal-bulk-action.html`         | 覆盖层弹窗、批量操作、确认文本填写               | 勾选任务 -> 打开弹窗 -> 填写原因 -> 确认归档 -> 等待弹窗关闭和结果展示                     | `#archive-modal[data-ready="true"]`、`#confirm-archive`、`#archive-result[data-ready="true"]`、`#archive-result-summary`       | Modal 遮罩层稳定定位、弹窗内表单填写、关闭后结果区断言、批量操作链路  |
| `examples/fixtures/session-expired-dashboard.html` | 失效会话恢复、局部 loading、恢复后仪表盘重新可用 | 通过 `storageState` 预置失效会话 -> 点击恢复会话 -> 等待 loading 消失 -> 断言恢复面板可见  | `#session-refreshing`、`#dashboard-panel[data-ready="true"]`、`#session-state[data-tone="success"]`、`#refresh-result`         | 会话失效恢复、会话相关页局部刷新、恢复后重新可操作                    |
| `examples/fixtures/paginated-list.html`            | 后台分页切换、页码摘要、结果列表换页             | 点击下一页 -> 等待 `#pagination-loading` 消失 -> 断言 `#page-summary[data-page="2"]`       | `#pagination-loading`、`#page-summary[data-ready="true"][data-page="2"]`、`#current-page`、`#page-anchor`                      | 分页按钮稳定性、页码更新、结果区间断言、后台列表换页                  |
| `examples/fixtures/drawer-edit-form.html`          | Drawer 打开、表单编辑、保存后关闭并回填结果      | 打开 Drawer -> 填写负责人 -> 选择优先级 -> 保存 -> 等待 Drawer 关闭和结果区展示            | `#edit-drawer[data-ready="true"]`、`#save-drawer`、`#drawer-result[data-ready="true"]`、`#result-owner`、`#result-priority`    | Drawer 侧栏稳定定位、表单填写、保存后等待侧栏关闭与列表回填           |
| `examples/fixtures/toast-popconfirm.html`          | 轻量确认 toast、确认后关闭、结果区回显           | 点击提交审核 -> 等待 toast 可见 -> 点击确认 -> 等待 toast 消失 -> 断言结果区可见           | `#toast-popconfirm[data-ready="true"]`、`#toast-confirm`、`#toast-result[data-ready="true"]`、`#result-summary`                | 轻量确认而非 Modal、短暂浮层稳定定位、确认后消失与结果回显            |
| `examples/fixtures/tabbed-workspace.html`          | 同页 Tab 切换、局部 loading、面板 ready 态切换   | 点击审批记录 Tab -> 等待 `#tab-loading` 消失 -> 断言 `#panel-approvals[data-ready="true"]` | `#tab-loading`、`#panel-approvals[data-ready="true"]`、`#approval-count`、`#approval-anchor`                                   | 同页 Tab 切换、局部异步渲染、非导航型视图切换                         |
| `examples/fixtures/contenteditable-editor.html`    | `contenteditable` 编辑、保存按钮启用、结果回显   | 填写备注正文 -> 点击保存 -> 断言 `#note-result[data-ready="true"]`                         | `#editor-body`、`#save-note`、`#note-result[data-ready="true"]`、`#note-length`、`#note-preview`                               | 富文本备注输入、非传统 input/textarea 填写、保存后摘要回显            |
| `examples/fixtures/empty-results-retry.html`       | 空结果态、重试成功、结果面板恢复                 | 执行查询 -> 断言空结果 -> 点击重试 -> 等待 `#query-loading` 消失 -> 断言结果面板显示       | `#empty-state[data-ready="true"]`、`#retry-query`、`#query-loading`、`#result-panel[data-ready="true"][data-count="3"]`        | 空结果态到成功态的二次转换、重试链路、结果恢复稳定性                  |
| `examples/fixtures/linked-filters.html`            | 联动筛选、依赖下拉刷新、结果摘要                 | 先选业务线 -> 等待团队下拉刷新 -> 选择团队 -> 应用筛选                                     | `#business-unit`、`#team-filter`、`#filter-loading`、`#linked-result[data-ready="true"][data-team="growth-east"]`              | 联动筛选、依赖选项刷新、后台筛选摘要稳定断言                          |
| `examples/fixtures/session-expired-retry.html`     | 会话第一次恢复失败、第二次重试成功               | 点击恢复会话 -> 等待失败提醒 -> 点击再次重试 -> 等待恢复面板 ready                         | `#refresh-alert[data-state="failed"]`、`#retry-session`、`#session-refreshing`、`#dashboard-panel[data-ready="true"]`          | 会话恢复异常路径、二次重试、失败态到成功态切换                        |
| `examples/fixtures/bulk-cross-page-selection.html` | 跨页保留勾选、换页后继续选择、最终批量提交       | 第 1 页勾选一条 -> 下一页 -> 第 2 页再勾选一条 -> 提交批量归档                             | `#selection-loading`、`#selection-summary[data-count]`、`#submit-selection`、`#bulk-result[data-ready="true"][data-count]`     | 跨页状态保持、分页与批量选择复合流程、最终批量提交                    |
| `examples/fixtures/drawer-double-save.html`        | Drawer 第一次保存失败、修正备注后二次保存成功    | 打开 Drawer -> 直接保存触发失败提醒 -> 补备注 -> 再次保存 -> 等待结果区 ready              | `#edit-drawer[data-ready="true"]`、`#save-alert[data-state="error"]`、`#drawer-review-note`、`#save-result[data-ready="true"]` | 抽屉内失败后修正、二次保存、错误态与成功态切换                        |
| `examples/fixtures/repeated-row-actions.html`      | 重复行共享同文案按钮、命中正确行后结果区 ready  | 直接点击同文案“编辑”按钮 -> 仅目标行成功后才等待 `#result-panel[data-ready="true"]` 可见   | `#result-panel[data-ready="true"][data-target-row="campaign-204"]`、`#result-row-title`、`#result-owner`、`#result-anchor`     | 重复按钮歧义、列表行作用域、错误命中第一条记录                        |
| `examples/fixtures/async-command-palette.html`     | 异步 suggestions、`aria-activedescendant`、命令执行 | 输入“账单” -> 等待 suggestions 准备 -> `ArrowDown` -> `Enter` -> 断言命令执行结果          | `#command-shell[data-loading="false"]`、`#async-command-options`、`#async-command-search[aria-activedescendant]`、`#async-command-toast[data-ready="true"][data-command-id="sync-billing"]` | 输入后 debounce、异步候选加载、键盘高亮更新、active-descendant 稳定性 |

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

### `session-expired-dashboard.html`

- 交互目的：
  - 模拟“登录过但会话失效”的后台仪表盘场景。
  - 为 runtime 提供带 `storageState` 打开的失效环境恢复基准，而不是只覆盖正常登录态。
- 关键断言：
  - 打开页面后 `#session-state` 初始为失效态，`#session-expired-banner[data-state="expired"]` 可见。
  - 点击 `#refresh-session` 后 `#session-refreshing` 先显示，约 `820ms` 后隐藏。
  - 恢复完成后 `#dashboard-panel[data-ready="true"]` 可见，`#refresh-result` 与 `#queue-owner` 回填恢复结果。
- 后续自动化价值：
  - 适合覆盖会话过期、重新注入环境、恢复后重新可操作的后台真实路径。
  - 适合验证“不是流程错，而是会话失效”的脆弱性场景。

### `paginated-list.html`

- 交互目的：
  - 模拟后台列表页常见的换页操作，而不是只做筛选。
  - 为 runtime 提供“点击分页 -> 局部 loading -> 列表和摘要同步更新”的稳定基准。
- 关键断言：
  - 点击 `#next-page` 后 `#pagination-loading` 显示，约 `680ms` 后隐藏。
  - `#page-summary[data-ready="true"][data-page="2"]` 能直接作为分页成功断言。
  - `#current-page`、`#visible-range`、`#page-anchor` 和表格行内容都会切换到第 2 页。
- 后续自动化价值：
  - 适合覆盖分页按钮、页码状态、结果区间和后台表格换页。
  - 适合作为后续排序、页大小、跨页选择等场景的基础夹具。

### `drawer-edit-form.html`

- 交互目的：
  - 模拟后台常见的“从列表打开 Drawer 编辑侧栏”的场景。
  - 为 runtime 提供覆盖列表页内打开侧栏、编辑表单、保存后关闭并回填结果的稳定基准。
- 关键断言：
  - 点击 `#edit-rule-512` 后 `#edit-drawer[data-ready="true"]` 可见。
  - 修改 `#drawer-owner` 和 `#drawer-priority` 后点击保存，约 `760ms` 后 Drawer 关闭。
  - `#drawer-result[data-ready="true"]` 展示最终保存结果，列表中的 `#row-owner-512`、`#row-priority-512` 同步更新。
- 后续自动化价值：
  - 适合覆盖 Drawer 侧栏、输入框与下拉框组合、保存后等待侧栏关闭。
  - 适合验证“结果区已更新但 Drawer 还没完全收起”这类真实时序问题。

### `toast-popconfirm.html`

- 交互目的：
  - 模拟不再使用大弹窗，而改用轻量 toast 做二次确认的后台交互。
  - 为 runtime 提供短暂浮层确认、确认后关闭和结果区回显的稳定基准。
- 关键断言：
  - 点击 `#open-popconfirm` 后 `#toast-popconfirm[data-ready="true"]` 可见。
  - 点击 `#toast-confirm` 后 `#toast-status` 进入处理中，约 `640ms` 后 toast 消失。
  - `#toast-result[data-ready="true"]` 显示提交成功结果，`#result-summary` 可直接做强断言。
- 后续自动化价值：
  - 适合覆盖轻量确认浮层，而不是传统 Modal。
  - 适合验证确认按钮点击后短暂 UI 消失与结果回显的链路稳定性。

### `tabbed-workspace.html`

- 交互目的：
  - 模拟后台工作台里常见的同页 Tab 切换，不依赖真实路由跳转。
  - 为 runtime 提供“点击后局部 loading，再切换面板 ready 态”的稳定夹具。
- 关键断言：
  - 点击 `#tab-approvals` 后，`#tab-loading` 先显示，约 `620ms` 后隐藏。
  - `#panel-approvals[data-ready="true"]` 可见，`#approval-anchor` 固定为 `tab:approvals`。
- 后续自动化价值：
  - 适合覆盖同页 Tab 切换与非导航型视图变化。
  - 适合验证“页面没有跳转，但内容面板发生切换”的后台真实路径。

### `contenteditable-editor.html`

- 交互目的：
  - 模拟后台中常见的交接备注、运营说明、富文本简报这类 `contenteditable` 编辑区。
  - 为 runtime 提供不同于 `input` / `textarea` 的填写目标。
- 关键断言：
  - 当备注文本长度达到 8 个字符后，`#save-note` 才会启用。
  - 保存后 `#note-result[data-ready="true"]` 可见，字符数与预览摘要同步更新。
- 后续自动化价值：
  - 适合覆盖 contenteditable 填写。
  - 适合验证“能否稳定操作富文本容器而不是传统表单控件”。

### `empty-results-retry.html`

- 交互目的：
  - 模拟后台查询第一次为空、第二次重试成功的真实链路。
  - 为 runtime 提供空结果态 -> 重试成功的稳定基准。
- 关键断言：
  - 第一次点击 `#run-query` 后，`#empty-state[data-ready="true"]` 出现。
  - 点击 `#retry-query` 后 `#query-loading` 显示并消失，随后 `#result-panel[data-ready="true"][data-count="3"]` 可见。
- 后续自动化价值：
  - 适合覆盖空结果态、重试按钮和恢复成功链路。
  - 适合验证“第一次失败不代表流程失败，重试后应继续成功”的时序问题。

### `linked-filters.html`

- 交互目的：
  - 模拟业务线与团队之间的联动筛选，而不是两个完全独立的表单项。
  - 为 runtime 提供“先刷新依赖选项，再提交最终筛选”的后台夹具。
- 关键断言：
  - 选择 `#business-unit` 后，`#team-filter` 会在 loading 结束后解锁并注入对应选项。
  - 选择团队并点击 `#apply-linked-filters` 后，`#linked-result[data-ready="true"][data-team="growth-east"]` 可见。
- 后续自动化价值：
  - 适合覆盖联动筛选、依赖下拉刷新与筛选摘要回填。
  - 适合作为后续“跨页批量选择”“多条件联动”的基准前置页。

### `session-expired-retry.html`

- 交互目的：
  - 模拟后台会话第一次恢复失败、第二次重试成功的真实异常路径。
  - 为 runtime 提供失败态提示、重试按钮与最终恢复面板三段式状态机。
- 关键断言：
  - 第一次点击 `#refresh-session` 后，`#refresh-alert[data-state="failed"]` 显示。
  - 第二次点击 `#retry-session` 后，`#session-refreshing` 隐藏，`#dashboard-panel[data-ready="true"]` 可见。
  - `#refresh-result` 与 `#retry-attempt` 会回填“第 2 次重试成功”和重试次数。
- 后续自动化价值：
  - 适合覆盖会话恢复失败后的二次重试，而不是只覆盖一次成功。
  - 适合形成会话相关失败类型的长期基线。

### `bulk-cross-page-selection.html`

- 交互目的：
  - 模拟后台列表跨页保留勾选、继续选择并最终统一提交的批量流程。
  - 为 runtime 提供“分页切换 + 选中状态持久化 + 批量提交”复合链路。
- 关键断言：
  - 第 1 页勾选后切到第 2 页，`#selection-summary[data-count]` 会持续保留已选数量。
  - 第二页再勾选后点击 `#submit-selection`，`#bulk-result[data-ready="true"][data-count="2"]` 可见。
  - `#selection-anchor` 与 `#result-codes` 会暴露跨页保留的批次编号。
- 后续自动化价值：
  - 适合覆盖跨页批量选择这一类后台复杂状态切换。
  - 适合观察分页与勾选状态是否被错误重置。

### `drawer-double-save.html`

- 交互目的：
  - 模拟 Drawer 第一次保存被后台拒绝，修正备注后第二次保存成功的真实编辑链路。
  - 为 runtime 提供 Drawer 内错误态、修正动作与二次成功回填的稳定基准。
- 关键断言：
  - 打开侧栏后第一次点击 `#save-drawer`，`#save-alert[data-state="error"]` 会出现。
  - 填写 `#drawer-review-note` 后再次保存，`#edit-drawer` 隐藏，`#save-result[data-ready="true"]` 可见。
  - 列表行与结果区会同步显示二次保存后的负责人和优先级。
- 后续自动化价值：
  - 适合覆盖 Drawer 内失败后修正、二次提交和状态回填。
  - 适合作为后台表单错误恢复的长期基准。

### `repeated-row-actions.html`

- 交互目的：
  - 模拟后台列表中多行共享同一个“编辑”按钮文案的常见歧义场景。
  - 为 target disambiguation 提供真实页面基准，验证只有命中目标行才会把结果区写成 ready。
- 关键断言：
  - 三行按钮文案完全一致，都会暴露为“编辑”。
  - 点击非目标行后，`#result-panel` 会展示当前行信息，但保持 `data-ready="false"`。
  - 只有命中标题为“华东运营日报”的目标行后，`#result-panel[data-ready="true"][data-target-row="campaign-204"]` 才可见。
- 后续自动化价值：
  - 适合覆盖重复按钮、多命中 locator 和列表行作用域缩小。
  - 适合作为 Runtime 消歧策略并回后的长期回归基线。

## 当前观测输出

- `examples/real-page-smoke.ts`
  - `runRealPageFixtureMatrix()` 当前会返回：
    - `failureTypeCounts`：按场景族聚合的失败类型统计。
    - `slowestCases`：按耗时倒序的最慢场景 Top 5，包含名次、case 名、状态、步数与耗时。
    - `successCoverage`：按场景族聚合的成功覆盖摘要，包含 `caseCount / successCount / failureCount`。
- `examples/run-real-page-smoke.ts`
  - CLI 当前会打印：
    - 成功数 / 失败数
    - 总耗时 / 平均耗时
    - 成功态摘要（按场景族）
    - 最慢场景排行（Top 5）
    - 失败类型统计
    - 每个 case 的产物目录与失败信息

## 当前回归入口

- `examples/real-page-smoke.ts`
  - 统一定义 `baseline` / `p5` / `p6` / `p7` 四档矩阵，负责 Flow、上传测试文件、`storageStatePath` 注入，以及观测字段汇总。
  - 当前 `p6` 请求会兼容映射到最新 `p7` 档位，避免额外改动 CLI 入口也能执行最新矩阵。
- `examples/run-real-page-smoke.ts`
  - 当前默认通过兼容映射执行 `p7` 档位，并打印成功数、失败数、总耗时、平均耗时、成功态摘要、最慢场景排行、失败类型统计与每个 case 的产物目录。
- `pnpm e2e:real-pages`
  - 独立执行当前最新的 `p7` 增强矩阵，适合局部回归 Benchmarks 轨道。
- `pnpm smoke:full`
  - 在仓库级 `typecheck / test / build / e2e:login` 之后，再补跑真实页面矩阵。

## 后续扩展建议

1. 当矩阵继续扩容时，评估是否需要独立的 `p8` 档位，而不是继续挤压当前默认矩阵时长。
2. 如果未来要从“业务场景族”继续下钻，可在失败类型统计之外再补一层技术根因分类，例如 `locator`、`timeout`、`detached`。

## 备注

- 第一阶段只落 fixture 与文档，不改 runtime / test，是为了避免在 Foundation / Runtime 轨道接口未完全合入前引入耦合。
- 第二阶段已新增 `examples/run-real-page-smoke.ts`、runtime 矩阵测试与 `session-dashboard.html`。
- 第三阶段继续扩到 `filterable-list.html` 与 `modal-bulk-action.html`，矩阵总数提升到 `7`。
- 第四阶段继续扩到 `session-expired-dashboard.html`、`paginated-list.html`、`drawer-edit-form.html` 与 `toast-popconfirm.html`，矩阵总数提升到 `11`。
- 第五阶段新增 `tabbed-workspace.html`、`contenteditable-editor.html`、`empty-results-retry.html` 与 `linked-filters.html`，`p5` 档位矩阵总数提升到 `15`，同时保留 `baseline` 的 `11` 个稳定 case。
- 第六阶段新增 `session-expired-retry.html`、`bulk-cross-page-selection.html` 与 `drawer-double-save.html`，`p6` 档位矩阵总数提升到 `18`，并新增失败类型统计、最慢场景排行与成功态覆盖摘要输出。
- 第七阶段新增 `repeated-row-actions.html`，`p7` 档位矩阵总数提升到 `19`，用于验证重复行同文案按钮的目标消歧场景，并通过兼容映射接入 `pnpm e2e:real-pages`。
- 矩阵脚本直接从 `packages/*/src/index.ts` 导入 live implementation，避免脚本误吃旧 `dist` 产物，导致基准结果与当前源码脱节。
