# PROJECT_ROUTE_LOCK

## 1. 当前路线一句话

以“先跑通、再稳定、再让业务用户独立完成首次任务、再实现本地资产可移植、再补齐本地资产维护、最后智能”为唯一主线，在 Node 24 默认稳定基线下，把现有录制回放闭环收敛为安全、可理解、可连续操作且可迁移、可维护的本地产品，并保留 Node 20 兼容。

## 2. 当前阶段

- 生命周期阶段：post-v1 产品化 / P2.8 S4 计划冻结，准备进入 S5 分轨开发
- 里程碑编号：P2.8（进行中）
- 阶段名称：Studio 执行截图受控内嵌预览
- 阶段目标：在不新增 Web / Local API 文件服务、不解冻 P3/P4 或 vNext 的前提下，让用户可在 Studio 内直接查看所选执行步骤的只读 PNG 截图证据，并关闭 renderer 任意路径打开能力。
- 可验收交付物：
  - project / execution 单段 ID、stepIndex 与运行目录 containment 的只读截图解析合同
  - project-knowledge 精确执行归属、普通文件、非 symlink / hardlink、PNG signature / IHDR、大小 / 像素上限与读取期间身份一致性校验
  - Studio 主进程固定业务 ID IPC 与 renderer 安全预览模型，不接收或返回本机绝对路径
  - Studio 只读截图弹层，覆盖加载、成功、缺失、拒绝、关闭与焦点恢复
  - 项目 / Flow / execution / step 快速切换、删除和关闭期间的独立预览请求竞态保护
  - 路径故障注入、真实 Electron、Node 20 / 24 与安全审计证据
- Definition of Done：
  - renderer 只传 `projectId + executionId + stepIndex`，不能传路径、MIME、URL 或任意文件名
  - 主进程只从真实 execution 与受控 run 目录推导 `step-<N>.png`，不信任 SQLite 中的历史路径
  - 非法 ID / stepIndex、跨项目、缺失、目录、symlink、非普通文件、伪 PNG、超限与读取期间替换均 fail closed
  - 返回内容固定为受限 `image/png` bytes，并以可回收 Blob URL 展示；不加载 data URL、`file:`、外部 URL、SVG、HTML、HAR 或原始 DOM
  - 通用 `openPath` 不再暴露给 renderer；绝对路径不进入 UI title、文本、错误或 IPC 响应
  - 新 bytes IPC 校验主窗口 main frame / 允许来源；Studio 壳启用 sandbox、CSP、导航与新窗口拒绝
  - 预览请求迟到时不会覆盖已经切换或关闭的项目、Flow、execution、step
  - Node 24 本地主门禁、Node 20 / 24 CI、recorded replay `25/25` 与安全审计通过
- 阶段出口：
  - 用户从 Studio 运行详情选择某步骤截图，可在应用内看到对应像素证据或明确的不可用原因
  - 关闭预览后仍停留在原 execution 与步骤，键盘焦点返回触发按钮
  - 任何异常产物形态都在字节到达 renderer 前被拒绝，且错误不泄露绝对路径
  - 该能力仅经 Electron 主进程固定 IPC 提供，Web / Local API / 扩展不新增文件读取能力
- 最小可验收闭环：
  - Studio 选择历史执行 → 专业诊断中的步骤截图 → 固定业务 ID IPC → 主进程校验执行归属与受控 PNG → 内嵌只读预览 → 关闭并恢复上下文
- 明确非目标：
  - Web / Local API / 扩展截图预览或二进制文件服务
  - HAR、页面原始 HTML / DOM、SVG、PDF、诊断 JSON 原文或外部 URL 内嵌
  - 截图编辑、下载、导出、删除、OCR、标注、缩略图索引或批量浏览
  - Flow、项目、版本或批量执行维护能力扩展
  - vNext 输入节点、步骤编辑、执行暂停后输入并继续
  - P3 深度 page / network intelligence 扩展
  - P4 AI 编排产品化与相关 UI
  - 云端协作、多用户同步、全新技术栈替换
- 禁止提前进入的阶段：
  - P3 深度能力解冻
  - P4 AI 编排接入 Studio / 扩展 / Web
- 允许进入下一阶段的条件：
  - P2.8 截图预览闭环、本地与远端双版本门禁连续通过
  - 入口文档与验证证据齐全
  - 若进入其他破坏性删除、vNext 产品模型、P3 或 P4，必须再次更新路线并获得明确确认
- 变更批准：用户于 2026-07-16 明确批准按首次用户体验评审调整 post-v1 路线。
- 阶段切换批准：用户于 2026-08-23 在收到“P2.5 已完成、下一阶段需更新路线锁”的交付说明后明确回复“继续”；本授权解释为进入 post-v1 backlog 的 P2.6，不解释为解冻 P3/P4 或 vNext 产品模型。
- 阶段切换批准补充：用户于 2026-08-23 在收到“P2.6 已完成；下一阶段拟进行路径安全、执行记录删除 / runs 清理与 Flow 版本只读 diff，尚未开启”的交付说明后再次回复“继续”；本授权解释为进入 P2.7，不解释为开放匿名破坏性 HTTP、Flow / 项目删除、P3/P4 或 vNext 产品模型。
- 阶段切换批准补充：用户于 2026-08-24 在 P2.7 已归档、候选路线已披露后明确要求“继续开发”，本授权解释为进入已登记低风险 backlog 的 P2.8，不解释为开放 Web / Local API 文件读取、P3/P4 或 vNext。
- 当前状态：P2.8 已完成变更分流与开发前基线，准备按安全解析、Electron IPC、renderer 预览三轨实施；P3/P4 与 vNext 输入节点继续冻结。

## 2.1 里程碑路线图

| 阶段                  | 目标                             | 交付物                                                     | DoD                                    | 门禁                                                                                    | 状态      |
| --------------------- | -------------------------------- | ---------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| P0 工程骨架           | Monorepo、工具链、文档骨架       | pnpm + Turbo + TS strict、基础文档                         | 可安装、可构建、可测试                 | `pnpm typecheck && pnpm lint && pnpm test && pnpm build`                                | ✅ 完成   |
| P1 核心闭环           | 扩展录制 → Studio 回放           | recorder、runtime、extension、studio                       | 可录制、可同步、可执行                 | `pnpm e2e:login`、手测闭环                                                              | ✅ 完成   |
| P2 可演示纵向切片     | 知识库、执行历史、真实页面稳定性 | project-knowledge、执行日志、诊断 UI、recorded replay 基线 | 可诊断、可复验、主线稳定               | Node 24 `pnpm smoke`、`pnpm e2e:recorded-pages`、相关 Studio 验证；CI 保持 Node 20 / 24 | ✅ 完成   |
| P2.5 首次体验产品化   | 非技术用户安全完成首次任务       | 内置连接、敏感输入保护、跨端刷新、录制状态、安全运行       | 首次旅程不依赖开发命令且关键风险有守卫 | 分轨测试 + 首次用户手测 + Node 20/24 CI                                                 | ✅ 完成   |
| P2.6 本地资产可移植   | 安全迁移与维护自动化任务         | 统一导出合同、导入新副本、Studio 文件交互、Web 重命名      | 导出导入运行往返可证且无静默覆盖       | 分轨测试 + 文件往返 E2E + recorded replay + Node 20/24 CI                               | ✅ 完成   |
| P2.7 本地资产安全维护 | 单条执行清理与版本差异理解       | 路径安全、Studio 受控删除、共享只读 Diff、双端展示         | 删除无越界且 diff 无编辑/串线          | 故障注入 + 双端 UI + recorded replay + Node 20/24 CI                                    | ✅ 完成   |
| P2.8 执行证据预览     | Studio 内直接查看步骤截图        | 受控只读解析、固定 IPC、内嵌 PNG 预览、竞态保护            | 无任意路径读取且截图不串线             | 故障注入 + Electron UI + recorded replay + Node 20/24 CI                                | 🟡 进行中 |
| P3 完整框架扩展       | 深度页面 / 接口理解              | page-intelligence、network-intelligence 深化能力           | 明确场景与回归面后再开放               | 待路线解冻                                                                              | ⏸ 冻结    |
| P4 产品落地           | AI 编排与智能增强                | ai-orchestrator、AI 产品入口                               | 不影响现有稳定主线                     | 待路线解冻                                                                              | ⏸ 冻结    |

## 3. 产品真源

- PRD：[`docs/superpowers/specs/2026-05-25-web-automation-platform-design.md`](./docs/superpowers/specs/2026-05-25-web-automation-platform-design.md)
- 当前主路线：[`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`](./docs/superpowers/plans/2026-05-26-run-first-roadmap.md)
- 用户旅程：[`docs/guides/quickstart.md`](./docs/guides/quickstart.md)、[`docs/guides/manual-qa.md`](./docs/guides/manual-qa.md)
- 当前执行计划：[`docs/exec-plans/active/p2-8-execution-screenshot-preview.md`](./docs/exec-plans/active/p2-8-execution-screenshot-preview.md)
- 最近完成计划：[`docs/exec-plans/completed/p2-7-asset-maintenance.md`](./docs/exec-plans/completed/p2-7-asset-maintenance.md)
- 非目标：AI 智能编排、云端协作、未纳入当前路线的深度分析能力

## 4. 设计真源

- UI / 原型来源：产品设计文档与当前 `apps/studio`、`apps/web` 已并回实现
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

## 8. 变更入口

- Backlog：`docs/exec-plans/active/post-v1-development-roadmap.md`；P2.8 实施真源为 `docs/exec-plans/active/p2-8-execution-screenshot-preview.md`
- Change Request：新增需求先进入路线计划或专门变更文档，再决定是否实施
- 当前阶段缺口：
  - Studio 执行截图仍通过 renderer 任意路径调用系统外部应用，缺少应用内受控只读预览
- 后续阶段需求：
  - 评估下一项低风险 post-v1 backlog，并先更新路线锁与阶段真源
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
