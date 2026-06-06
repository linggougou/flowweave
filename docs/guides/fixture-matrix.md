# 真实页面 Fixture 矩阵

本矩阵对应 `Benchmarks` 轨道第一阶段，只提供本地 HTML fixture 与说明文档，不引入新的 runtime / recorder / test 代码。

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

## 推荐后续接入顺序

1. 先在 runtime 侧把 `checkbox-select` 与 `delayed-panel` 接成最小回归。
2. 再补 `upload-form`，验证 `setInputFiles` 与文件结果断言。
3. 最后接 `spa-route`，用于验证录制端路由监听和 runtime 的 URL / DOM 双重稳定等待。

## 备注

- 本阶段没有新增 smoke 脚本，也没有改 runtime 测试文件；这是为了避免在 Foundation / Runtime 轨道接口未完全合入前引入耦合。
- 第二阶段可在以上断言节点不变的前提下补 `examples/run-real-page-smoke.ts` 与对应测试。
