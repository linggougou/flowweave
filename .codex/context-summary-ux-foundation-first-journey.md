# UX Foundation 首次旅程修复上下文

## 决策

- 用户于 2026-07-16 明确批准按首次用户体验评审调整 post-v1 开发路线。
- 最新体验基线采用 43/100；原 69/100 作为较早审查记录保留。
- 原 Wave A Flow 可移植性后移，先处理敏感输入、跨端刷新、产品内连接、录制状态和安全运行。

## 当前最小闭环

1. password 输入不以明文进入录制 Flow。
2. Studio 不在默认步骤摘要中显示敏感原值。
3. Studio 聚焦时刷新当前项目的 Flow 和执行历史。
4. Studio 提供可见刷新动作并对新 Flow 给出连续反馈。

## 边界

- 不解冻 P3/P4，不接入 AI。
- 不改变 Playwright、Electron、SQLite、pnpm/Turbo 技术栈。
- 产品内本地 API 在下一轨先冻结共享 transport，禁止 apps 直接互依赖。
- 当前轨不实现完整 onboarding、录制状态机、运行取消或页面体系重构。

## 验收

- 先写失败合同，再实施最小修复。
- Node 24 运行相关包测试、Studio typecheck/lint。
- 全量 `pnpm smoke` 与 recorded replay 保持稳定。
- 推送后等待 Node 20/24 CI 双绿。

## UX Foundation 1 完成状态

- password DOM 值在 content 消息发送前转换为 `secret_*` 变量占位符。
- runtime 仍接收当次真实输入，但执行历史只保存 `[已隐藏]`，最近输入恢复省略敏感变量。
- Studio 对新旧密码 Flow 均默认遮罩，敏感运行变量使用 password input。
- Studio 提供项目级刷新入口，窗口聚焦时刷新 workspace；即使首次 API 连接失败，后续也可恢复项目和 Flow。
- UX Foundation 2-5 尚未完成，整体首次体验不标记为通过。

## UX Foundation 2 启动状态

- 当前目标：只启动 Studio，扩展即可列出项目并同步录制 Flow。
- 共享边界：新增 `@flowweave/local-api`，Web 与 Studio 共同复用，禁止应用互依赖。
- 生命周期：Studio ready 后监听本机回环地址；兼容服务已占用端口时复用；退出时关闭自持有服务。
- 产品文案：空项目与扩展离线状态不再要求用户运行 pnpm、理解端口或源码目录。
- 设计真源：`docs/superpowers/specs/2026-07-16-local-sync-service-design.md`。

## UX Foundation 2 完成状态

- `@flowweave/local-api` 已成为 Web 与 Studio 共享的本地 API 真源。
- Studio ready 后自动托管服务，兼容服务占用时复用，非兼容占用时明确报错。
- Studio 空项目与扩展离线恢复文案已移除开发命令、端口和源码目录。
- API 仅允许 Chrome 扩展、本机 Web 与本地工具来源，外部网页来源返回 403。
- Node 24 smoke、recorded replay `25/25`、目录版 `.app` 实机 API 生命周期通过。
- UX Foundation 3-5 尚未完成，整体首次体验仍不标记为最终通过。
