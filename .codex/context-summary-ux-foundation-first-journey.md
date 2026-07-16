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
