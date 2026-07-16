# PROJECT_ROUTE_LOCK

## 1. 当前路线一句话

以“先跑通、再稳定、再让业务用户独立完成首次任务、最后智能”为唯一主线，在 Node 24 默认稳定基线下，把现有录制回放闭环收敛为安全、可理解、可连续操作的本地产品，并保留 Node 20 兼容。

## 2. 当前阶段

- 生命周期阶段：post-v1 产品化 / 首次用户体验修复
- 里程碑编号：P2.5
- 阶段名称：非技术用户首次旅程闭环
- 阶段目标：在不解冻 AI 与深度页面理解的前提下，消除首次启动、敏感输入、跨端同步、录制边界和安全运行的主要阻塞。
- 可验收交付物：
  - 项目根物理 `PROJECT_ROUTE_LOCK.md`
  - 与当前主线一致的 `README.md`、架构总览和路线计划
  - recorded replay 稳定基线 `25 = 23 fixture + 2 runtime-generated`
  - Studio 布局 contract、歧义候选诊断增强、Electron bundle integrity 修复
  - 敏感输入默认不落明文，Studio 展示默认遮罩
  - 扩展同步后 Studio 可自动或手动刷新并定位新任务
  - 产品内首次启动、录制状态与安全运行的分批交付计划
- Definition of Done：
  - Node 24 下主线验证链与相关定向验证通过
  - Node 20 / 24 双基线 CI 与文档口径一致
  - 项目入口文档与 `.codex/verification-report.md` 口径一致
  - 当前 residual gaps 已并回主线且无活跃待回收 worktree
  - 首次旅程 P0 问题具备测试合同和可重复验收证据
- 阶段出口：
  - 非技术用户不需要理解 pnpm、端口和源码目录即可进入首次录制主线
  - 真实页面稳定性增强主线不再依赖临时口头说明
  - Studio 桌面端可在当前电脑稳定构建与启动
  - 密码等敏感输入不会以明文进入录制 Flow 或默认界面
  - 扩展保存后，Studio 能可靠发现新任务
- 最小可验收闭环：
  - 扩展录制事件可入库
  - Studio 可运行选定 Flow 并展示执行诊断
  - recorded replay `25/25`
  - Electron GUI 可正常启动并通过 bundle 完整性校验
- 明确非目标：
  - P3 深度 page / network intelligence 扩展
  - P4 AI 编排产品化与相关 UI
  - 云端协作、多用户同步、全新技术栈替换
- 禁止提前进入的阶段：
  - P3 深度能力解冻
  - P4 AI 编排接入 Studio / 扩展 / Web
- 允许进入下一阶段的条件：
  - 当前稳定基线连续通过
  - 入口文档与验证证据齐全
  - 用户明确确认解冻下一阶段路线
- 变更批准：用户于 2026-07-16 明确批准按首次用户体验评审调整 post-v1 路线。
- 当前状态：P2 工程门禁保持通过；P2.5 产品化体验修复进行中。

## 2.1 里程碑路线图

| 阶段                | 目标                             | 交付物                                                     | DoD                                    | 门禁                                                                                    | 状态      |
| ------------------- | -------------------------------- | ---------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| P0 工程骨架         | Monorepo、工具链、文档骨架       | pnpm + Turbo + TS strict、基础文档                         | 可安装、可构建、可测试                 | `pnpm typecheck && pnpm lint && pnpm test && pnpm build`                                | ✅ 完成   |
| P1 核心闭环         | 扩展录制 → Studio 回放           | recorder、runtime、extension、studio                       | 可录制、可同步、可执行                 | `pnpm e2e:login`、手测闭环                                                              | ✅ 完成   |
| P2 可演示纵向切片   | 知识库、执行历史、真实页面稳定性 | project-knowledge、执行日志、诊断 UI、recorded replay 基线 | 可诊断、可复验、主线稳定               | Node 24 `pnpm smoke`、`pnpm e2e:recorded-pages`、相关 Studio 验证；CI 保持 Node 20 / 24 | ✅ 完成   |
| P2.5 首次体验产品化 | 非技术用户安全完成首次任务       | 内置连接、敏感输入保护、跨端刷新、录制状态、安全运行       | 首次旅程不依赖开发命令且关键风险有守卫 | 分轨测试 + 首次用户手测 + Node 20/24 CI                                                 | 🚧 进行中 |
| P3 完整框架扩展     | 深度页面 / 接口理解              | page-intelligence、network-intelligence 深化能力           | 明确场景与回归面后再开放               | 待路线解冻                                                                              | ⏸ 冻结    |
| P4 产品落地         | AI 编排与智能增强                | ai-orchestrator、AI 产品入口                               | 不影响现有稳定主线                     | 待路线解冻                                                                              | ⏸ 冻结    |

## 3. 产品真源

- PRD：[`docs/superpowers/specs/2026-05-25-web-automation-platform-design.md`](./docs/superpowers/specs/2026-05-25-web-automation-platform-design.md)
- 当前主路线：[`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`](./docs/superpowers/plans/2026-05-26-run-first-roadmap.md)
- 用户旅程：[`docs/guides/quickstart.md`](./docs/guides/quickstart.md)、[`docs/guides/manual-qa.md`](./docs/guides/manual-qa.md)
- 非目标：AI 智能编排、云端协作、未纳入当前路线的深度分析能力

## 4. 设计真源

- UI / 原型来源：产品设计文档与当前 `apps/studio`、`apps/web` 已并回实现
- 高保真或截图证据：`.codex/verification-report.md` 中的当前验收记录
- 不允许偏离的页面 / 交互：
  - 扩展录制并同步到知识库
  - Studio 选择 Flow 后执行并查看诊断
  - Web 查看项目、Flow 与执行历史

## 5. 技术真源

- 架构入口：[`docs/architecture/overview.md`](./docs/architecture/overview.md)
- 技术栈：TypeScript strict、pnpm workspace、Turborepo、Playwright、Electron + Vite + React、SQLite + Drizzle、WXT
- 数据模型：[`docs/domain/flow-dsl.md`](./docs/domain/flow-dsl.md)、`packages/project-knowledge`
- API 契约：`packages/local-api` 本地 API、`packages/runtime` / `packages/recorder` 对外契约
- CodeGraph 自动初始化：允许

## 6. 验收门禁

- 本地测试：
  - Node 24：`pnpm lint`
  - Node 24：`pnpm smoke`
  - Node 24：`pnpm e2e:recorded-pages`
  - CI：Node 20 / 24 双矩阵
- 构建命令：
  - `pnpm build`
  - `pnpm --filter @flowweave/app-studio build`
- 真机 / 浏览器 / E2E：
  - `pnpm e2e:login`
  - Studio 桌面端可本机启动
  - Electron bundle 完整性与签名异常能被脚本显式处理
- 发布或阶段门禁：
  - `.codex/verification-report.md` 有对应验收证据
  - 入口文档与路线锁不互相冲突
- 阶段 DoD 覆盖证据：`.codex/verification-report.md`、`.codex/operations-log.md`
- 会签或用户确认：仅在变更路线、解冻 P3 / P4、改技术栈或改门禁时需要

## 7. 禁止无确认改动

- 禁止重写：runtime / Studio / knowledge 主链路骨架
- 禁止删除：smoke、recorded replay、Electron 完整性相关门禁与 `.codex` 验收留痕
- 禁止替换：Playwright、Electron、SQLite、pnpm workspace / Turbo 主技术栈
- 禁止新增：AI 产品入口、云协作、与当前稳定主线无关的大范围功能

## 8. 变更入口

- Backlog：`docs/superpowers/plans/2026-05-26-run-first-roadmap.md` 中的 M5 与未来智能阶段事项
- Change Request：新增需求先进入路线计划或专门变更文档，再决定是否实施
- 当前阶段缺口：
  - 扩展分发与启用引导（Studio 内置本地同步服务已完成）
  - 敏感输入识别、遮罩与变量化
  - 扩展录制开始/暂停/完成状态机
  - Studio 同步刷新、业务/专业信息分层
  - 运行前影响摘要、过程进度与取消
- 后续阶段需求：
  - P3 深度 page / network intelligence
  - P4 AI 编排、建议与自动修复
- 已拒绝需求：
  - 在当前路线未解冻前直接引入 AI 产品化能力
  - 以重写架构替代当前稳定主线的小步收口

## 9. 改路线流程

1. 写明现路线问题。
2. 列出受影响文件和门禁。
3. 给出迁移 / 回滚方案。
4. 说明生命周期阶段、里程碑、DoD 和验收门禁的变化。
5. 用户确认后再执行。
6. 更新本文件和 `.codex/operations-log.md`。
