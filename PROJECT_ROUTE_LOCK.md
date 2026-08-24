# PROJECT_ROUTE_LOCK

## 1. 当前路线一句话

vNext-0“后台管理网站交互式任务模板”设计门禁已完成并冻结；当前没有已开启的实现阶段，vNext-1、P3 与 P4 继续锁定，必须先更新路线锁并获得新的实施授权。

## 2. 当前阶段

- 生命周期阶段：vNext S7 设计会签完成；下一阶段未开启
- 里程碑编号：vNext-0（设计门禁，已完成）
- 阶段名称：交互式任务模板设计冻结（已归档）
- 阶段目标：基于现有线性 Flow、Studio 与 Runtime 真实能力，冻结“输入节点 + 有限变量绑定 + 暂停输入后继续”的产品与技术合同，形成可拆分、可回滚、可验收的后续实施 DAG。
- 可验收交付物：
  - 产品与 UX 规格：目标用户、线性模板编辑、输入节点、变量来源/消费、搜索后选择与运行态反馈
  - Flow DSL vNext 结构与迁移规格：版本边界、旧 Flow 兼容、导入导出、回滚和拒绝策略
  - Runtime / Electron 会话协议：启动、运行、等待输入、继续、取消、失败、退出清理与幂等语义
  - 敏感输入生命周期：采集、传输、内存、日志、错误、历史记录、最近值与清理边界
  - ADR、验收合同、风险台账与后续分阶段实施 DAG
  - 独立 Judge 的结构化 scorecard 与最终裁决
- Definition of Done：
  - 所有规格与当前 schema、执行 for-loop、IPC、取消、进度、知识库持久化和 Studio 状态模型逐项映射
  - 输入节点及变量定义只有一个规范真源，生产者/消费者、作用域、类型、默认值和敏感性无歧义
  - 明确 schema version、旧 Flow 读取、v1→vNext 迁移、不可逆边界、导出兼容与失败回滚
  - 明确会话状态机、事件顺序、一次性 token/请求标识、重复提交、迟到响应、取消与应用退出语义
  - 敏感值默认不写日志、错误、步骤快照、普通执行历史或最近值；任何例外必须显式建模并有用户控制
  - Studio 第一版保持顺序步骤流，不引入画布、条件、循环、子流程、批量、协作或 AI
  - 每个后续实施阶段都有最小闭环、测试先行合同、回滚点、依赖关系和独立验收门
  - 独立 Judge 对一致性、安全性、可实施性和范围控制给出 PASS，且无未关闭 P0/P1
- 阶段出口：
  - 设计真源、ADR 与实施 DAG 已冻结且互不矛盾
  - 关键未决策项为零；非阻塞探索项明确进入 backlog
  - 独立 Judge PASS，验证报告记录文档链接、静态检查与范围复核
  - 用户收到设计阶段交付；是否进入 vNext-1 实施需再次更新路线锁
- 最小可验收闭环：
  - 录制所得线性 Flow → Studio 插入输入节点并绑定后续字段 → Runtime 会话到节点暂停 → Studio 安全提交 → 从下一节点继续 → 取消/失败可诊断且敏感值不落盘；本阶段仅冻结该闭环合同，不实现代码
- 明确非目标：
  - 本阶段修改 `apps/*`、`packages/*` 或数据库 migration 等业务实现
  - 条件、循环、子流程、批量数据集、多人协作、模板市场或云同步
  - 自动抽取变量、任意表达式、任意 CSS/XPath 参数化或通用编排画布
  - 关闭 Studio 后恢复等待输入的长会话
  - P3 深度 page / network intelligence 扩展
  - P4 AI 编排产品化与相关 UI
- 禁止提前进入的阶段：
  - vNext-1 业务实现
  - P3 深度能力解冻
  - P4 AI 编排接入 Studio / 扩展 / Web
- 允许进入下一阶段的条件：
  - vNext-0 全部设计真源与独立 Judge 通过
  - 后续实施 DAG 已拆为可独立回滚的最小阶段
  - 更新路线锁并再次确认具体实现阶段；本次授权不自动延伸到编码
- 阶段切换批准：用户于 2026-08-24 在收到“P2.8 已完成、vNext 尚冻结”的状态与下一步计划后明确回复“可以，解冻 vNext 设计阶段”。本授权仅开放 vNext-0 设计门禁，不开放业务代码、P3 或 P4。
- 当前状态：vNext-0 R3 独立 L3 Judge `PASS 100/100`，`P0/P1/P2=0/0/0`、`required_fixes=[]`；设计计划已归档。下一阶段未开启，本次授权不延伸到编码。

## 2.1 里程碑路线图

| 阶段                  | 目标                             | 交付物                                                     | DoD                                    | 门禁                                                                                    | 状态    |
| --------------------- | -------------------------------- | ---------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| P0 工程骨架           | Monorepo、工具链、文档骨架       | pnpm + Turbo + TS strict、基础文档                         | 可安装、可构建、可测试                 | `pnpm typecheck && pnpm lint && pnpm test && pnpm build`                                | ✅ 完成 |
| P1 核心闭环           | 扩展录制 → Studio 回放           | recorder、runtime、extension、studio                       | 可录制、可同步、可执行                 | `pnpm e2e:login`、手测闭环                                                              | ✅ 完成 |
| P2 可演示纵向切片     | 知识库、执行历史、真实页面稳定性 | project-knowledge、执行日志、诊断 UI、recorded replay 基线 | 可诊断、可复验、主线稳定               | Node 24 `pnpm smoke`、`pnpm e2e:recorded-pages`、相关 Studio 验证；CI 保持 Node 20 / 24 | ✅ 完成 |
| P2.5 首次体验产品化   | 非技术用户安全完成首次任务       | 内置连接、敏感输入保护、跨端刷新、录制状态、安全运行       | 首次旅程不依赖开发命令且关键风险有守卫 | 分轨测试 + 首次用户手测 + Node 20/24 CI                                                 | ✅ 完成 |
| P2.6 本地资产可移植   | 安全迁移与维护自动化任务         | 统一导出合同、导入新副本、Studio 文件交互、Web 重命名      | 导出导入运行往返可证且无静默覆盖       | 分轨测试 + 文件往返 E2E + recorded replay + Node 20/24 CI                               | ✅ 完成 |
| P2.7 本地资产安全维护 | 单条执行清理与版本差异理解       | 路径安全、Studio 受控删除、共享只读 Diff、双端展示         | 删除无越界且 diff 无编辑/串线          | 故障注入 + 双端 UI + recorded replay + Node 20/24 CI                                    | ✅ 完成 |
| P2.8 执行证据预览     | Studio 内直接查看步骤截图        | 受控只读解析、固定 IPC、内嵌 PNG 预览、竞态保护            | 无任意路径读取且截图不串线             | 故障注入 + Electron UI + recorded replay + Node 20/24 CI                                | ✅ 完成 |
| vNext-0 设计门禁      | 冻结交互式任务模板合同           | 产品/UX、DSL 迁移、会话协议、安全模型、实施 DAG            | 设计一致、可实施、可回滚且无关键未决项 | 文档静态检查 + 源码映射 + 独立 Judge                                                    | ✅ 完成 |
| P3 完整框架扩展       | 深度页面 / 接口理解              | page-intelligence、network-intelligence 深化能力           | 明确场景与回归面后再开放               | 待路线解冻                                                                              | ⏸ 冻结  |
| P4 产品落地           | AI 编排与智能增强                | ai-orchestrator、AI 产品入口                               | 不影响现有稳定主线                     | 待路线解冻                                                                              | ⏸ 冻结  |

## 3. 产品真源

- PRD：[`docs/superpowers/specs/2026-05-25-web-automation-platform-design.md`](./docs/superpowers/specs/2026-05-25-web-automation-platform-design.md)
- 当前主路线：[`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`](./docs/superpowers/plans/2026-05-26-run-first-roadmap.md)
- 用户旅程：[`docs/guides/quickstart.md`](./docs/guides/quickstart.md)、[`docs/guides/manual-qa.md`](./docs/guides/manual-qa.md)
- 当前执行计划：无；下一阶段未开启
- 最近完成计划：[`docs/exec-plans/completed/vnext-0-design-gate.md`](./docs/exec-plans/completed/vnext-0-design-gate.md)
- vNext 产品基线：[`docs/superpowers/specs/2026-06-10-backoffice-interactive-task-template-design.md`](./docs/superpowers/specs/2026-06-10-backoffice-interactive-task-template-design.md)
- 非目标：当前阶段业务实现、AI 智能编排、云端协作、未纳入当前路线的深度分析能力

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
- vNext-0 额外禁止：业务代码、数据库迁移、schema 版本发布、生产 IPC 变更；设计内容不得伪装为已实现或已验证能力

## 8. 变更入口

- 当前阶段：无活跃实施阶段；vNext-0 已归档至 `docs/exec-plans/completed/vnext-0-design-gate.md`，post-v1 backlog 继续保留为历史与候选路线
- Change Request：新增需求先进入路线计划或专门变更文档，再决定是否实施
- 当前阶段缺口：无；vNext-0 设计门禁已闭合。vNext-1 仍是未授权的后续实施候选，不得按“设计已完成”推定已开放编码
- 后续阶段需求：
  - 评估下一项低风险 post-v1 backlog，并先更新路线锁与阶段真源
  - Flow 删除或批量资产清理
  - vNext-1 按已冻结 DAG 实施任务模板输入节点、编辑模型与暂停/继续协议
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
