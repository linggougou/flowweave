# PROJECT_ROUTE_LOCK

## 1. 当前路线一句话

vNext-1 数据基础已完成；当前只开放 vNext-2A Runtime 输入会话规划，vNext-2A 实施、vNext-2B/3、P3 与 P4 继续锁定。

## 2. 当前阶段

- 生命周期阶段：vNext-2A S4 计划冻结，尚未进入 S5 实施
- 里程碑编号：vNext-2A（Runtime 输入会话规划）
- 阶段名称：waitingForInput Runtime session 计划冻结
- 阶段目标：基于已完成的 vNext-1 数据基础，冻结 Runtime 输入会话内核的最小实现范围、状态机、验证矩阵、回滚点与 worktree 分工；本阶段不写生产代码。
- 可验收交付物：
  - vNext-2A change request、active plan 与上下文摘要
  - Runtime session 最小影响面映射与实施 DAG
  - waitingForInput 状态机、事件顺序、取消/超时/幂等计划
  - 安全 canary、Node 20/24、独立 Judge 与回滚点计划
- Definition of Done：
  - vNext-1 完成证据与 main Node 20/24 会签已记录到 `.codex/verification-report.md`
  - 2A 的最小可验收闭环、红灯合同、回滚点和 worktree 分工已冻结
  - 规划输出不与 2B/3A/3B 混淆，不把设计文本包装为已授权编码
  - 继续保持 v1 可运行路径与 v2 capability 关闭边界
- 阶段出口：
  - `PROJECT_ROUTE_LOCK.md`、change request、active plan 与 `.codex` 上下文摘要一致
  - 2A 只开放规划，不包含生产代码改动
  - 明确进入 2A 实施所需的路线锁切换与验证门禁
  - 只有再次更新路线锁后，才可进入 vNext-2A Runtime 输入会话实施
- 最小可验收闭环：
  - 现状审计 → 2A 实施 DAG → 状态机/安全/验证计划冻结 → 路线锁切换条件明确；仍不进入生产编码
- 明确非目标：
  - Runtime 输入会话生产实现、Electron 会话桥、Studio 模板编辑与运行态输入 UI
  - 条件、循环、子流程、批量数据集、多人协作、模板市场或云同步
  - 自动抽取变量、任意表达式、任意 CSS/XPath 参数化或通用编排画布
  - 关闭 Studio 后恢复等待输入的长会话
  - P3 深度 page / network intelligence 扩展
  - P4 AI 编排产品化与相关 UI
- 禁止提前进入的阶段：
  - vNext-2A 业务实现
  - vNext-2B/3 业务实现
  - P3 深度能力解冻
  - P4 AI 编排接入 Studio / 扩展 / Web
- 允许进入下一阶段的条件：
  - 2A 规划冻结完成
  - 最小可验收闭环、红灯合同、worktree 分工和独立 Judge 条件完整
  - 更新路线锁，只开放 vNext-2A 最小实施阶段
- 阶段切换批准：用户于 2026-08-30 明确“全权负责项目的落地”；当前 Agent 可在不越过门禁、不解冻 P3/P4 的前提下，自主完成 vNext-1 收口并推进 vNext-2A 规划冻结。
- 当前状态：vNext-1 已在本地与远端全部会签通过并归档；当前进入 vNext-2A 计划冻结，尚未进入实现。

## 2.1 里程碑路线图

| 阶段                  | 目标                              | 交付物                                                     | DoD                                    | 门禁                                                                                    | 状态      |
| --------------------- | --------------------------------- | ---------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| P0 工程骨架           | Monorepo、工具链、文档骨架        | pnpm + Turbo + TS strict、基础文档                         | 可安装、可构建、可测试                 | `pnpm typecheck && pnpm lint && pnpm test && pnpm build`                                | ✅ 完成   |
| P1 核心闭环           | 扩展录制 → Studio 回放            | recorder、runtime、extension、studio                       | 可录制、可同步、可执行                 | `pnpm e2e:login`、手测闭环                                                              | ✅ 完成   |
| P2 可演示纵向切片     | 知识库、执行历史、真实页面稳定性  | project-knowledge、执行日志、诊断 UI、recorded replay 基线 | 可诊断、可复验、主线稳定               | Node 24 `pnpm smoke`、`pnpm e2e:recorded-pages`、相关 Studio 验证；CI 保持 Node 20 / 24 | ✅ 完成   |
| P2.5 首次体验产品化   | 非技术用户安全完成首次任务        | 内置连接、敏感输入保护、跨端刷新、录制状态、安全运行       | 首次旅程不依赖开发命令且关键风险有守卫 | 分轨测试 + 首次用户手测 + Node 20/24 CI                                                 | ✅ 完成   |
| P2.6 本地资产可移植   | 安全迁移与维护自动化任务          | 统一导出合同、导入新副本、Studio 文件交互、Web 重命名      | 导出导入运行往返可证且无静默覆盖       | 分轨测试 + 文件往返 E2E + recorded replay + Node 20/24 CI                               | ✅ 完成   |
| P2.7 本地资产安全维护 | 单条执行清理与版本差异理解        | 路径安全、Studio 受控删除、共享只读 Diff、双端展示         | 删除无越界且 diff 无编辑/串线          | 故障注入 + 双端 UI + recorded replay + Node 20/24 CI                                    | ✅ 完成   |
| P2.8 执行证据预览     | Studio 内直接查看步骤截图         | 受控只读解析、固定 IPC、内嵌 PNG 预览、竞态保护            | 无任意路径读取且截图不串线             | 故障注入 + Electron UI + recorded replay + Node 20/24 CI                                | ✅ 完成   |
| vNext-0 设计门禁      | 冻结交互式任务模板合同            | 产品/UX、DSL 迁移、会话协议、安全模型、实施 DAG            | 设计一致、可实施、可回滚且无关键未决项 | 文档静态检查 + 源码映射 + 独立 Judge                                                    | ✅ 完成   |
| vNext-1 数据基础      | 安全解析、预览与原子保存 v2       | DSL v2、迁移预览、revision/CAS、最近值、旧入口护栏         | v1 不变、v2 数据闭环安全且不可误执行   | 分轨 TDD + 故障注入 + canary + Node 20/24 + 独立 Judge                                  | ✅ 完成   |
| vNext-2A 输入会话规划 | 冻结 Runtime waitingForInput 实施 | 变更单、计划、状态机、验证矩阵、回滚点、worktree 分工      | 规划可实施且未越权进入编码             | 文档静态核对 + 源码映射 + 路线锁更新                                                    | 🚧 进行中 |
| P3 完整框架扩展       | 深度页面 / 接口理解               | page-intelligence、network-intelligence 深化能力           | 明确场景与回归面后再开放               | 待路线解冻                                                                              | ⏸ 冻结    |
| P4 产品落地           | AI 编排与智能增强                 | ai-orchestrator、AI 产品入口                               | 不影响现有稳定主线                     | 待路线解冻                                                                              | ⏸ 冻结    |

## 3. 产品真源

- PRD：[`docs/superpowers/specs/2026-05-25-web-automation-platform-design.md`](./docs/superpowers/specs/2026-05-25-web-automation-platform-design.md)
- 当前主路线：[`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`](./docs/superpowers/plans/2026-05-26-run-first-roadmap.md)
- 用户旅程：[`docs/guides/quickstart.md`](./docs/guides/quickstart.md)、[`docs/guides/manual-qa.md`](./docs/guides/manual-qa.md)
- 当前执行计划：[`docs/exec-plans/active/vnext-2a-runtime-session-planning.md`](./docs/exec-plans/active/vnext-2a-runtime-session-planning.md)
- 最近完成计划：
  - [`docs/exec-plans/completed/vnext-1-data-foundation.md`](./docs/exec-plans/completed/vnext-1-data-foundation.md)
  - [`docs/exec-plans/completed/vnext-0-design-gate.md`](./docs/exec-plans/completed/vnext-0-design-gate.md)
- vNext 产品基线：[`docs/superpowers/specs/2026-06-10-backoffice-interactive-task-template-design.md`](./docs/superpowers/specs/2026-06-10-backoffice-interactive-task-template-design.md)
- 非目标：vNext-2/3、AI 智能编排、云端协作、未纳入当前路线的深度分析能力

## 4. 设计真源

- UI / 原型来源：vNext 产品规格、当前 `apps/studio` 已并回实现与本阶段待冻结的线性编辑设计
- vNext 已冻结设计真源：
  - [`docs/design-docs/vnext-studio-linear-template-editor.md`](./docs/design-docs/vnext-studio-linear-template-editor.md)
  - [`docs/design-docs/vnext-flow-schema-migration.md`](./docs/design-docs/vnext-flow-schema-migration.md)
  - [`docs/design-docs/vnext-runtime-input-session.md`](./docs/design-docs/vnext-runtime-input-session.md)
  - [`docs/design-docs/vnext-implementation-dag.md`](./docs/design-docs/vnext-implementation-dag.md)
- 高保真或截图证据：`.codex/verification-report.md` 中的当前验收记录
- 不允许偏离的页面 / 交互：
  - 扩展录制并将自动化任务同步到知识库
  - Studio 选择自动化任务后确认运行并查看业务结果或专业诊断
  - Studio 仅通过主进程受控文件对话框导入/导出，不接受 renderer 任意路径
  - Web 查看项目、自动化任务与运行记录，并只读查看版本差异
  - Studio 运行详情只通过受控业务标识请求截图预览，不展示或提交绝对路径

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
  - Node 24 / 20：`pnpm e2e:portability`
  - 官方 npm registry：`pnpm audit --prod --audit-level high`
  - CI：Node 20 / 24 双矩阵
- 构建命令：
  - `pnpm build`
  - `pnpm --filter @flowweave/ui test`
  - `pnpm --filter @flowweave/app-studio test`
  - `pnpm --filter @flowweave/app-web test`
  - `pnpm --filter @flowweave/app-studio build`
  - `pnpm --filter @flowweave/app-web build`
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
- 禁止删除：smoke、recorded replay、Electron 完整性相关门禁与 `.codex` 验收留痕；不得新增 Flow / 项目 / 批量删除，不得经 Local API 开放 execution 删除，不得执行递归资产清理
- 禁止替换：Playwright、Electron、SQLite、pnpm workspace / Turbo 主技术栈
- 禁止新增：AI 产品入口、云协作、与当前稳定主线无关的大范围功能
- vNext-1 额外禁止：Runtime 输入会话、生产输入 IPC、Studio 编辑/输入 UI；不得把“可保存 v2”包装为“可运行 v2”

## 8. 变更入口

- 当前阶段：vNext-2A Runtime 输入会话规划；活跃计划为 `docs/exec-plans/active/vnext-2a-runtime-session-planning.md`
- Change Request：新增需求先进入路线计划或专门变更文档，再决定是否实施
- 当前阶段缺口：2A 的状态机、验证矩阵、回滚点、worktree 分工与最小影响面尚未冻结成唯一实施真源
- 后续阶段需求：
  - 在 2A 规划冻结后评估是否进入 2A 最小实现
  - Flow 删除或批量资产清理
  - vNext-2B Electron bridge、vNext-3A/3B 与更后续 DAG
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
