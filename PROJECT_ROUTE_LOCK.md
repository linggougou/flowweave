# PROJECT_ROUTE_LOCK

## 1. 当前路线一句话

以“先跑通、再稳定、再让业务用户独立完成首次任务、再实现本地资产可移植、最后智能”为唯一主线，在 Node 24 默认稳定基线下，把现有录制回放闭环收敛为安全、可理解、可连续操作且可迁移的本地产品，并保留 Node 20 兼容。

## 2. 当前阶段

- 生命周期阶段：post-v1 产品化 / 本地资产可移植
- 里程碑编号：P2.6
- 阶段名称：Flow 可移植性与低风险资产维护
- 阶段目标：在不解冻 AI、深度页面理解或 vNext 编排模型的前提下，让用户可在 Studio 安全导出、校验导入任务，并在 Web 维护任务名称。
- 可验收交付物：
  - 统一的 `FlowDocument` 可移植与已知敏感值处理合同
  - project-knowledge / local-api 的“始终导入为新副本”能力
  - Studio 受控文件对话框、导入/导出 UI 与错误反馈
  - 扩展导出复用同一安全合同并兼容历史裸 `FlowDocument` JSON
  - Web 自动化任务重命名与异步选择保护
  - 导出 → 空项目导入 → 运行的可重复验收证据
- Definition of Done：
  - 当前与历史扩展裸 JSON 均可由 Studio 校验并导入
  - 导入生成新 `flowId`、覆盖目标 `projectId`，不静默覆盖现有任务
  - `secret_*` 默认值、密码字面量、本机上传路径和 URL 明显凭据按合同移除或变量化
  - 非法、超大、版本不兼容文件不产生数据库副作用
  - Web 重命名持久化，快速切换项目/任务不会被旧响应污染
  - Node 24 本地主门禁、Node 20 / 24 CI、recorded replay `25/25` 与安全审计通过
- 阶段出口：
  - 用户无需访问源码目录即可从 Studio 导出或导入任务
  - 导出文件只承诺处理当前 schema 中可识别的敏感内容，不误报“完全脱敏”
  - 导入失败、取消选择与 ID/名称冲突都有清晰且无副作用的结果
  - 扩展与 Studio 共享导出合同，历史导出文件保持可导入
  - Web 可在保持当前选择上下文的情况下重命名任务
- 最小可验收闭环：
  - 扩展或 Studio 导出安全 `FlowDocument` JSON
  - Studio 将其导入空项目为新副本
  - 用户补齐被移除/变量化的运行输入后成功执行
  - Web 重命名任务后刷新仍保持新名称
- 明确非目标：
  - 执行记录或 Flow 删除、`runs/` 递归清理
  - Flow 版本 JSON diff
  - vNext 输入节点、步骤编辑、执行暂停后输入并继续
  - P3 深度 page / network intelligence 扩展
  - P4 AI 编排产品化与相关 UI
  - 云端协作、多用户同步、全新技术栈替换
- 禁止提前进入的阶段：
  - P3 深度能力解冻
  - P4 AI 编排接入 Studio / 扩展 / Web
- 允许进入下一阶段的条件：
  - P2.6 本地往返闭环与稳定基线连续通过
  - 入口文档与验证证据齐全
  - 若进入破坏性删除、vNext 产品模型、P3 或 P4，必须再次更新路线并获得明确确认
- 变更批准：用户于 2026-07-16 明确批准按首次用户体验评审调整 post-v1 路线。
- 阶段切换批准：用户于 2026-08-23 在收到“P2.5 已完成、下一阶段需更新路线锁”的交付说明后明确回复“继续”；本授权解释为进入 post-v1 backlog 的 P2.6，不解释为解冻 P3/P4 或 vNext 产品模型。
- 当前状态：P2.5 于 2026-08-23 完成并通过本地与远端 main Node 20/24 双门禁；P2.6 计划已启动；P3/P4 与 vNext 输入节点继续冻结。

## 2.1 里程碑路线图

| 阶段                | 目标                             | 交付物                                                     | DoD                                    | 门禁                                                                                    | 状态      |
| ------------------- | -------------------------------- | ---------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| P0 工程骨架         | Monorepo、工具链、文档骨架       | pnpm + Turbo + TS strict、基础文档                         | 可安装、可构建、可测试                 | `pnpm typecheck && pnpm lint && pnpm test && pnpm build`                                | ✅ 完成   |
| P1 核心闭环         | 扩展录制 → Studio 回放           | recorder、runtime、extension、studio                       | 可录制、可同步、可执行                 | `pnpm e2e:login`、手测闭环                                                              | ✅ 完成   |
| P2 可演示纵向切片   | 知识库、执行历史、真实页面稳定性 | project-knowledge、执行日志、诊断 UI、recorded replay 基线 | 可诊断、可复验、主线稳定               | Node 24 `pnpm smoke`、`pnpm e2e:recorded-pages`、相关 Studio 验证；CI 保持 Node 20 / 24 | ✅ 完成   |
| P2.5 首次体验产品化 | 非技术用户安全完成首次任务       | 内置连接、敏感输入保护、跨端刷新、录制状态、安全运行       | 首次旅程不依赖开发命令且关键风险有守卫 | 分轨测试 + 首次用户手测 + Node 20/24 CI                                                 | ✅ 完成   |
| P2.6 本地资产可移植 | 安全迁移与维护自动化任务         | 统一导出合同、导入新副本、Studio 文件交互、Web 重命名      | 导出导入运行往返可证且无静默覆盖       | 分轨测试 + 文件往返 E2E + recorded replay + Node 20/24 CI                               | 🚧 进行中 |
| P3 完整框架扩展     | 深度页面 / 接口理解              | page-intelligence、network-intelligence 深化能力           | 明确场景与回归面后再开放               | 待路线解冻                                                                              | ⏸ 冻结    |
| P4 产品落地         | AI 编排与智能增强                | ai-orchestrator、AI 产品入口                               | 不影响现有稳定主线                     | 待路线解冻                                                                              | ⏸ 冻结    |

## 3. 产品真源

- PRD：[`docs/superpowers/specs/2026-05-25-web-automation-platform-design.md`](./docs/superpowers/specs/2026-05-25-web-automation-platform-design.md)
- 当前主路线：[`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`](./docs/superpowers/plans/2026-05-26-run-first-roadmap.md)
- 用户旅程：[`docs/guides/quickstart.md`](./docs/guides/quickstart.md)、[`docs/guides/manual-qa.md`](./docs/guides/manual-qa.md)
- 当前实施计划：[`docs/exec-plans/active/p2-6-portability-assets.md`](./docs/exec-plans/active/p2-6-portability-assets.md)
- 非目标：AI 智能编排、云端协作、未纳入当前路线的深度分析能力

## 4. 设计真源

- UI / 原型来源：产品设计文档与当前 `apps/studio`、`apps/web` 已并回实现
- 高保真或截图证据：`.codex/verification-report.md` 中的当前验收记录
- 不允许偏离的页面 / 交互：
  - 扩展录制并将自动化任务同步到知识库
  - Studio 选择自动化任务后确认运行并查看业务结果或专业诊断
  - Studio 仅通过主进程受控文件对话框导入/导出，不接受 renderer 任意路径
  - Web 查看项目、自动化任务与运行记录

## 5. 技术真源

- 架构入口：[`docs/architecture/overview.md`](./docs/architecture/overview.md)
- 技术栈：TypeScript strict、pnpm workspace、Turborepo、Playwright、Electron + Vite + React、SQLite + Drizzle、WXT
- 数据模型：[`docs/domain/flow-dsl.md`](./docs/domain/flow-dsl.md)、`packages/project-knowledge`
- API 契约：`packages/local-api` 本地 API、`packages/runtime` / `packages/recorder` 对外契约
- CodeGraph 自动初始化：允许

## 6. 验收门禁

- 本地测试：
  - 各分轨 TDD 定向测试、typecheck、lint、build
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
- 禁止删除：smoke、recorded replay、Electron 完整性相关门禁与 `.codex` 验收留痕；本阶段不新增 Flow / execution 删除端点，不执行递归资产清理
- 禁止替换：Playwright、Electron、SQLite、pnpm workspace / Turbo 主技术栈
- 禁止新增：AI 产品入口、云协作、与当前稳定主线无关的大范围功能

## 8. 变更入口

- Backlog：`docs/exec-plans/active/post-v1-development-roadmap.md` 中的 P2.6 后续资产维护与未来智能阶段事项
- Change Request：新增需求先进入路线计划或专门变更文档，再决定是否实施
- 当前阶段缺口：
  - Flow 导出尚未复用统一安全合同，Studio 尚无导入/导出入口
  - Web 已有重命名后端但缺少前端交互
- 后续阶段需求：
  - P2.7 路径安全、执行记录删除与 Flow 版本只读 diff
  - vNext 任务模板输入节点、编辑模型与暂停/继续协议
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
