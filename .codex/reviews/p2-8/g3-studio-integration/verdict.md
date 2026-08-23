# 结论

**REVISE（84/100）**。固定对象 IPC、sender/main-frame/origin、`openPath` 移除、sandbox/导航/CSP、污染数据库路径拒绝、renderer 无路径与 Blob 回收均通过；但 `App` 的迟到 reject 守卫存在一个 P1 竞态，G3 暂不能会签。

# 为什么

`App.tsx:1166-1173` 和 `1186-1194` 对成功/缺席响应都比较 `generation + projectId + flowId + executionId`，而 `1202-1212` 的 `catch` 只比较 generation。选择 refs 在 render 时同步更新（`269-271`），generation 则依赖选择变化后的 passive effect 才递增（`288-292`）；因此旧截图请求可在“新选择已经 render、清理 effect 尚未执行”的窗口 reject，并把旧步骤错误写成当前 UI 的 unavailable 状态。现有乱序用例只覆盖迟到 fulfilled，切换执行用例使用立即 fulfilled，无法关闭这个分支。

其余安全边界成立：主进程严格拒绝路径/额外字段和非受信 frame，preload 不再暴露通用路径能力；Studio 壳启用 sandbox 并封锁导航、新窗口与主动内容；结构化诊断只从受控运行目录读取固定 JSON 文件，不信任 SQLite 路径；renderer DTO/DOM 不含本机路径，图片只使用短生命周期 `blob:`。未新增 Web/Local API 文件读取，也未触及 P3/P4/vNext。

# 必须修改

P1：在 `catch` 写入 unavailable 前，使用与 fulfilled 分支完全相同的 `generation + projectId + flowId + executionId` 当前性判断；建议抽为单一判定，避免分支漂移。补一条迟到 reject 故障注入：旧请求 pending 时切换 execution（最好参数化 project/flow/execution），在新上下文已经 render 后触发旧请求 reject，断言新上下文不出现旧步骤标签、旧错误或 unavailable 弹层，且不创建 Blob URL。除这一最小修复与测试外无需扩大范围。

# 证据

- 被审：`393c8135aeda2ee4d674c766c424593e8ded3a3e` / `c39ceafe935a7e2c4d530a7d49d31c736fd8f2a8`；`apps/studio` 与 `packages/ui` 代码树一致
- 缺陷：`apps/studio/src/App.tsx:269-292,1166-1213`
- 测试缺口：`apps/studio/src/App.execution-screenshot-preview.test.tsx:222-301`
- IPC/sender/壳层：`apps/studio/electron/main.ts:91-151,455-465,530-545`
- 路径污染：`apps/studio/electron/services.ts:290-374,462-490`；`apps/studio/electron/services.test.ts:261-289`
- CSP/renderer：`apps/studio/csp-policy.ts:3-22`；`apps/studio/src/ExecutionScreenshotPreview.tsx:14-16,92-99`
- 复用主证据：Studio 208/208、UI 14/14、typecheck、lint、build 全绿
- 本轮收敛检查：`git diff --quiet c39ceaf 393c813 -- apps/studio packages/ui`、`git diff --check 393c813^..393c813` 通过；未重跑全量测试
