# UX Foundation 3 上下文与验证摘要

## 路线与边界

- 日期：2026-08-23
- 生命周期：S5 开发落地，定向验证后进入 S6/S7。
- 路线依据：`PROJECT_ROUTE_LOCK.md` 的 P2.5“非技术用户首次旅程闭环”。
- 里程碑真源：`docs/exec-plans/active/ux-foundation-3-5-development.md` Track F3。
- 当前阶段出口：用户明确控制录制开始、暂停、继续和完成；完成后预览、命名并确认保存。
- 最小可验收闭环：持久化会话状态机 → 暂停/完成事件守卫 → 可读预览与站点 → 有效命名同步 → 清空确认与单次恢复。
- 允许范围：`apps/extension/entrypoints/**`、`apps/extension/lib/**`，必要时 `packages/recorder/src/**`。
- 禁止范围：`apps/studio/**`、`apps/web/**`、`packages/runtime/**`、路线锁、共享执行计划、中央 `.codex/operations-log.md` 与 `.codex/verification-report.md`。
- 明确非目标：不解冻 P3/P4，不改变技术栈，不重构 Studio/Web/runtime，不新增依赖。
- 变更判断：属于已批准的 P2.5 当前阶段缺口，不涉及路线变更、阶段切换或高危动作。

## 研究与复用结论

- 会话继续使用 `browser.storage.session`，并从旧版 `{meta, events}` 结构做保守迁移。
- Flow 继续复用 `buildFlowFromEvents`；敏感输入继续沿用 `{{secret_*}}` 占位符，不引入明文回显。
- 本轮采用 `tdd-workflow`：先增加 background/content/sidepanel 用户可观察合同并记录红灯，再实现最小代码转绿。

## TDD 证据

- 环境前置：首次执行 Extension test 因 worktree 未安装依赖而报 `vitest: command not found`；随后执行 `pnpm install --frozen-lockfile` 成功，锁文件无变化。
- 包前置：安装后首次用例执行因 workspace 包尚无 `dist` 而无法解析 `@flowweave/shared` / `@flowweave/recorder`；先构建 shared、flow-dsl、recorder 后重跑。
- 功能红灯：`pnpm --filter @flowweave/app-extension test` 得到 `5 failed / 22 passed`。失败准确覆盖：空闲态仍收事件、状态转换消息未知、暂停恢复无状态/预览、命名消息未知、清空不要求确认。
- 并发红灯：增加快速事件合同后，background listener 并发写入只保留 `1/2` 个事件；加入消息队列串行化后定向测试 `14/14` 通过。
- 基线保护：既有 content 敏感输入占位符等 `14/14` 合同保持通过。

## 最终验证

- `pnpm --filter @flowweave/app-extension test`：通过，`4 files / 33 tests`。
  - background `14/14`：状态转换、空闲/暂停/完成事件守卫、service worker 恢复、并发事件、命名同步、清空单次恢复、原有导出/同步与错误包装。
  - content `14/14`：敏感输入占位符、填充/按键/滚动/上传等既有采集合同无回退。
  - recording-session `3/3`：可读步骤、敏感值不回显、站点去重、旧存储迁移。
  - sidepanel/copy `2/2`：完整控制、预览、命名、确认清空与恢复入口。
- `pnpm --filter @flowweave/app-extension typecheck`：通过。
- `pnpm --filter @flowweave/app-extension lint`：通过。
- `pnpm --filter @flowweave/app-extension build`：通过；Chrome MV3 产物总计 `161.68 kB`。
- `pnpm --filter @flowweave/recorder test`：通过，`54/54`。
- `pnpm --filter @flowweave/recorder typecheck`：通过。
- `git diff --check`：通过。
- 覆盖率工具：执行 `pnpm --filter @flowweave/app-extension exec vitest run --coverage` 时缺少 `@vitest/coverage-v8`。原用途为生成覆盖率百分比；按“不新增依赖”边界未安装，替代为 background/content/session/sidepanel 四层 `33/33` 合同、类型检查、lint 与生产构建，均通过。

## 实施摘要

- 会话状态固定为 `idle | recording | paused | completed`；新会话默认 `idle`，只有 `recording` 接收事件。
- 会话、事件和一次性清空快照均保存在 `browser.storage.session`；旧版有事件会话迁移为 `completed`，旧版空会话迁移为 `idle`。
- 侧栏提供开始、暂停、继续、完成；开始时记录当前网页导航，完成后展示业务可读步骤和去重目标站点。
- 任务名在 background 强制去除首尾空白、拒绝空白与超过 80 字符；同步 Flow 使用确认后的名称。
- 清空由 UI 二次确认且 background 再验证 `confirmed`；清空后提供一次恢复，恢复成功立即销毁快照。
- 预览不返回原始事件与输入值；`{{secret_*}}` 仅显示“敏感信息已保护”，原有 content 占位符链保持通过。
- background runtime listener 串行处理消息，防止快速页面事件并发覆盖。

## 审查结论

- 质量评分：94/100。
- 建议：通过 Track F3 定向验收，可交由主代理审查并集成。
- 阶段门禁：UX Foundation 3 代码与定向门禁通过；P2.5 整体仍需 F4/F5 与集成验收，不允许据此单独解冻 P3/P4。
- 残余风险：本 worktree 未安装到真实 Chrome 做人工侧栏视觉/交互验收；生产构建与结构/行为合同已通过，真实旅程由集成阶段统一验证。
