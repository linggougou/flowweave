# PROJECT_ROUTE_LOCK

## 1. 当前路线一句话

以“先跑通、再稳定、再让业务用户独立完成首次任务、再实现本地资产可移植、再补齐本地资产维护、最后智能”为唯一主线，在 Node 24 默认稳定基线下，把现有录制回放闭环收敛为安全、可理解、可连续操作且可迁移、可维护的本地产品，并保留 Node 20 兼容。

## 2. 当前阶段

- 生命周期阶段：post-v1 产品化 / 本地资产安全维护（P2.7 进行中）
- 里程碑编号：P2.7
- 阶段名称：执行记录安全清理与 Flow 版本只读 Diff
- 阶段目标：在不开放匿名破坏性 HTTP 能力、不解冻 AI、深度页面理解或 vNext 编排模型的前提下，让用户可在 Studio 安全删除单条执行记录及其受控运行产物，并在 Studio / Web 只读理解历史版本与当前任务的差异。
- 可验收交付物：
  - project / execution 单段 ID 白名单与运行目录 containment 合同
  - project-knowledge 单条 execution 事务删除、page snapshot 精确关联清理和运行目录原子隔离
  - Studio 主进程专用删除 IPC、活动执行拒绝、明确确认和异步选择保护
  - `@flowweave/ui` 共享的有界、确定性、只读 JSON diff
  - Studio / Web “历史 vN → 当前任务”差异摘要与专业详情
  - 路径故障注入、真实 UI、Node 20 / 24 与安全审计证据
- Definition of Done：
  - `.`、`..`、分隔符、编码分隔符、控制字符、超长 ID 在任何文件或数据库副作用前被拒绝
  - 删除仅作用于真实项目中的精确 execution；其他 execution、Flow、版本、项目和兄弟目录保持不变
  - 运行目录仅在通过 symlink、类型和直属文件白名单检查后处理；不使用递归删除
  - 数据库失败可回滚隔离目录；最终清理失败保留受控 quarantine 并结构化报告
  - 活动执行不能删除；renderer 永不传入或取得任意文件路径
  - Diff 只读、有条目上限、敏感值隐藏，快速切换项目 / Flow / 版本不会串线
  - Node 24 本地主门禁、Node 20 / 24 CI、recorded replay `25/25` 与安全审计通过
- 阶段出口：
  - 用户可在 Studio 明确确认后删除一条已完成执行，成功后列表、详情和后继选择一致
  - 清理只触及由受控根与两个 ID 推导出的精确目录；异常形态 fail closed
  - 删除能力不经当前无破坏性授权的 Local API 暴露给 Web、扩展或任意本机调用方
  - Studio / Web 可查看历史版本相对当前任务的新增、删除、修改摘要和只读详情
  - 删除与 diff 的慢响应不会污染用户已经切换的项目、Flow、版本或执行记录
- 最小可验收闭环：
  - Studio 选择一条已完成执行 → 明确确认 → 主进程校验项目、活动状态和路径 → 原子隔离 → 事务删除 → 安全清理 → 刷新并恢复选择
  - Studio / Web 选择一个历史版本 → 对安全展示副本计算有界只读 diff → 展示“历史 vN → 当前任务”摘要与专业详情
- 明确非目标：
  - Flow、项目、批量执行记录或版本删除
  - 通过 Local API / Web 暴露破坏性删除能力
  - 整棵 `runs/` 递归清理、孤儿目录 sweep 或按数据库任意路径删除
  - 任意两版本比较、diff 编辑、合并、应用补丁或保存
  - vNext 输入节点、步骤编辑、执行暂停后输入并继续
  - P3 深度 page / network intelligence 扩展
  - P4 AI 编排产品化与相关 UI
  - 云端协作、多用户同步、全新技术栈替换
- 禁止提前进入的阶段：
  - P3 深度能力解冻
  - P4 AI 编排接入 Studio / 扩展 / Web
- 允许进入下一阶段的条件：
  - P2.7 删除与 Diff 闭环、本地与远端双版本门禁连续通过
  - 入口文档与验证证据齐全
  - 若进入其他破坏性删除、vNext 产品模型、P3 或 P4，必须再次更新路线并获得明确确认
- 变更批准：用户于 2026-07-16 明确批准按首次用户体验评审调整 post-v1 路线。
- 阶段切换批准：用户于 2026-08-23 在收到“P2.5 已完成、下一阶段需更新路线锁”的交付说明后明确回复“继续”；本授权解释为进入 post-v1 backlog 的 P2.6，不解释为解冻 P3/P4 或 vNext 产品模型。
- 阶段切换批准补充：用户于 2026-08-23 在收到“P2.6 已完成；下一阶段拟进行路径安全、执行记录删除 / runs 清理与 Flow 版本只读 diff，尚未开启”的交付说明后再次回复“继续”；本授权解释为进入 P2.7，不解释为开放匿名破坏性 HTTP、Flow / 项目删除、P3/P4 或 vNext 产品模型。
- 当前状态：P2.7 G1-G5、独立总审、本地 Node 20/24、真实 Web/Studio、安全审计与 E2E 门禁已通过；等待集成分支与 main 远端双矩阵会签后归档。P3/P4 与 vNext 输入节点继续冻结。

## 2.1 里程碑路线图

| 阶段                  | 目标                             | 交付物                                                     | DoD                                    | 门禁                                                                                    | 状态      |
| --------------------- | -------------------------------- | ---------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| P0 工程骨架           | Monorepo、工具链、文档骨架       | pnpm + Turbo + TS strict、基础文档                         | 可安装、可构建、可测试                 | `pnpm typecheck && pnpm lint && pnpm test && pnpm build`                                | ✅ 完成   |
| P1 核心闭环           | 扩展录制 → Studio 回放           | recorder、runtime、extension、studio                       | 可录制、可同步、可执行                 | `pnpm e2e:login`、手测闭环                                                              | ✅ 完成   |
| P2 可演示纵向切片     | 知识库、执行历史、真实页面稳定性 | project-knowledge、执行日志、诊断 UI、recorded replay 基线 | 可诊断、可复验、主线稳定               | Node 24 `pnpm smoke`、`pnpm e2e:recorded-pages`、相关 Studio 验证；CI 保持 Node 20 / 24 | ✅ 完成   |
| P2.5 首次体验产品化   | 非技术用户安全完成首次任务       | 内置连接、敏感输入保护、跨端刷新、录制状态、安全运行       | 首次旅程不依赖开发命令且关键风险有守卫 | 分轨测试 + 首次用户手测 + Node 20/24 CI                                                 | ✅ 完成   |
| P2.6 本地资产可移植   | 安全迁移与维护自动化任务         | 统一导出合同、导入新副本、Studio 文件交互、Web 重命名      | 导出导入运行往返可证且无静默覆盖       | 分轨测试 + 文件往返 E2E + recorded replay + Node 20/24 CI                               | ✅ 完成   |
| P2.7 本地资产安全维护 | 单条执行清理与版本差异理解       | 路径安全、Studio 受控删除、共享只读 Diff、双端展示         | 删除无越界且 diff 无编辑/串线          | 故障注入 + 双端 UI + recorded replay + Node 20/24 CI                                    | 🟡 进行中 |
| P3 完整框架扩展       | 深度页面 / 接口理解              | page-intelligence、network-intelligence 深化能力           | 明确场景与回归面后再开放               | 待路线解冻                                                                              | ⏸ 冻结    |
| P4 产品落地           | AI 编排与智能增强                | ai-orchestrator、AI 产品入口                               | 不影响现有稳定主线                     | 待路线解冻                                                                              | ⏸ 冻结    |

## 3. 产品真源

- PRD：[`docs/superpowers/specs/2026-05-25-web-automation-platform-design.md`](./docs/superpowers/specs/2026-05-25-web-automation-platform-design.md)
- 当前主路线：[`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`](./docs/superpowers/plans/2026-05-26-run-first-roadmap.md)
- 用户旅程：[`docs/guides/quickstart.md`](./docs/guides/quickstart.md)、[`docs/guides/manual-qa.md`](./docs/guides/manual-qa.md)
- 当前执行计划：[`docs/exec-plans/active/p2-7-asset-maintenance.md`](./docs/exec-plans/active/p2-7-asset-maintenance.md)
- 最近完成计划：[`docs/exec-plans/completed/p2-6-portability-assets.md`](./docs/exec-plans/completed/p2-6-portability-assets.md)
- 非目标：AI 智能编排、云端协作、未纳入当前路线的深度分析能力

## 4. 设计真源

- UI / 原型来源：产品设计文档与当前 `apps/studio`、`apps/web` 已并回实现
- 高保真或截图证据：`.codex/verification-report.md` 中的当前验收记录
- 不允许偏离的页面 / 交互：
  - 扩展录制并将自动化任务同步到知识库
  - Studio 选择自动化任务后确认运行并查看业务结果或专业诊断
  - Studio 仅通过主进程受控文件对话框导入/导出，不接受 renderer 任意路径
  - Web 查看项目、自动化任务与运行记录，并只读查看版本差异

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

## 8. 变更入口

- Backlog：`docs/exec-plans/active/post-v1-development-roadmap.md`；当前 P2.7 以 `docs/exec-plans/active/p2-7-asset-maintenance.md` 为实施真源
- Change Request：新增需求先进入路线计划或专门变更文档，再决定是否实施
- 当前阶段缺口：
  - 路径与删除核心、Studio 删除接线、共享 diff 和双端接线尚待分轨实施与验收
- 后续阶段需求：
  - P2.7 完成后再评估下一项低风险 post-v1 backlog
  - Flow 删除或批量资产清理
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
