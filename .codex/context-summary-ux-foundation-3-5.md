# UX Foundation 3-5 上下文摘要

## 当前事实

- 当前基线提交：`6ad5ff4`，包含 UX Foundation 1-2。
- 当前阶段：P2.5 post-v1 产品化 / 首次用户体验修复。
- 已完成：敏感输入保护、Studio 刷新连续性、Studio 内置本地同步服务。
- 未完成：录制状态机、安全运行与进度/取消、业务视图与 Web 结果收口。
- 现有主门禁：Node 24 smoke、recorded replay `25/25`、Node 20/24 CI。

## 关键复用点

- Extension 会话：`apps/extension/entrypoints/background.ts` 与 `browser.storage.session`。
- Extension UI：`apps/extension/entrypoints/sidepanel/main.ts`、`index.html`。
- Runtime：`packages/runtime/src/playwright-runner.ts` 的 `executeFlow` 与逐步执行循环。
- Studio 执行链：`apps/studio/electron/services.ts` → runtime → project-knowledge。
- Studio IPC：`ipc-channels.ts`、`main.ts`、`preload.ts`、`shared/studio-api-types.ts`。
- Studio 视图：`apps/studio/src/App.tsx`、`styles.css`。
- Web 视图：`apps/web/src/App.tsx`、`styles.css`。

## 决策与边界

- 三个功能轨道使用独立 worktree 和分支并行实施。
- F4 不直接重构 Studio `App.tsx`，F5 不修改 runtime/Electron；主代理负责最终接线。
- 先写失败合同，再实施最小代码；不引入新框架或重量级依赖。
- 不改变 Flow DSL、数据库主模型或技术栈；project-knowledge 已支持 `cancelled` 状态，优先复用。
- 不解冻 P3/P4，不实现 AI、云协作、复杂流程编排或全新页面体系。

## 验收要点

- 暂停时事件不入会话，完成后可预览、命名并确认保存。
- 运行前可理解目标与风险；运行中可见步骤进度并可取消。
- 默认界面不要求理解 P2、UUID、Storage State、preflight 或 locator。
- 敏感输入保护、本地 API 来源限制和 recorded replay 基线不得回退。
