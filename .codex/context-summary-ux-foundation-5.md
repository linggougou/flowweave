# UX Foundation 5 上下文摘要

## 任务与路线判断

- 当前路线：`PROJECT_ROUTE_LOCK.md` 的 P2.5「非技术用户首次旅程闭环」。
- 生命周期：S5 开发落地；完成定向验证后进入 S6/S7，由集成代理统一验收。
- 里程碑真源：`docs/exec-plans/active/ux-foundation-3-5-development.md` Track F5。
- 本轮阶段出口：Studio 与 Web 默认用业务语言呈现任务、参数和最近结果，专业信息按需折叠。
- 最小可验收闭环：业务文案、默认最近结果、空状态、结果摘要、专业诊断折叠、键盘可访问与窄窗口合同全部通过。
- 变更判断：属于已批准的当前阶段缺口，不涉及新需求、阶段切换或路线变更。
- 高危动作判断：不改变 API、导航骨架、技术栈、数据模型或验收门禁；不解冻 P3/P4。

## 文件边界

- 允许：`apps/studio/src/App.tsx`、`apps/studio/src/styles.css`、Studio 展示组件与合同测试、`apps/web/src/**`、Web 前端测试、本文。
- 禁止：`apps/studio/electron/**`、preload、runtime、Extension、`apps/studio/src/shared/**` 与中央 `.codex/operations-log.md`、`.codex/verification-report.md`。
- 并行说明：F3、F4 在独立 worktree 开发；本分支不触碰其所有权范围，并为 F4 保留清晰的 Studio 运行区域。

## 已分析的实现与复用点

1. `apps/studio/src/App.tsx`：沿用现有项目/任务选择、运行参数、执行历史和版本状态，不引入状态库。
2. `apps/studio/src/layout-contract.test.tsx`：沿用 `renderToStaticMarkup` 与测试注入状态的静态合同模式。
3. `apps/studio/src/FlowEmptyGuide.tsx` 与 `product-copy-contract.test.ts`：沿用产品文案合同与首次任务空状态模式。
4. `apps/studio/src/DiagnosticInspector.tsx`、`ExecutionRunContextPanel.tsx`、`shared/failure-insights.ts`：复用既有失败摘要与诊断组件，只在 App 层调整默认层级。
5. `apps/web/src/App.tsx` 与 `api.ts`：保持现有 API，不改变后端；从版本优先改为最近运行结果优先。
6. `packages/ui/src/StepLogTable.tsx`：复用步骤表；业务摘要在应用层前置，表格放入专业详情。

## 测试与实现策略

- 已启用 `tdd-workflow`：先新增失败的业务合同测试，再实现最小代码使其通过。
- 已启用 `frontend-patterns`：用小型展示组件组合、语义化 `nav/details/section`、清晰焦点和响应式布局。
- 已启用 `verification-loop`：完成后依次运行 build、typecheck、lint、tests、安全扫描和 diff 审查。
- Web 沿用静态合同测试，避免为本次任务新增 jsdom 或测试依赖。
- CodeGraph 当前无可调用入口；本任务不修改跨包调用关系，使用 `rg`、现有类型和测试作替代结构审计。
- 无需查询外部框架 API；实现仅使用仓库已采用的 React/HTML 基础能力。

## 主要风险与缓解

- F4 后续接线冲突：Studio 保留独立 `run-workspace` 运行区和清晰的结果区，不在 F5 添加进度协议。
- 专业能力被隐藏后不可达：仅默认折叠，所有版本、环境高级项、原始 JSON、步骤日志和诊断仍可键盘展开。
- 执行状态词不一致：应用层集中格式化为「成功 / 失败 / 已取消」。
- 窄窗口溢出：为侧栏、工具栏、摘要网格、执行列表和表格增加明确断点与横向滚动容器。

## 实施结果

- Studio：新增独立 `run-workspace`，默认突出当前任务、目标站点、必要参数、步骤数和最近结果；业务步骤改为可读列表。
- Studio：环境、Base URL、Storage State、preflight 进入「高级设置」；任务标识、定位细节、原始 JSON、运行上下文和诊断产物进入「专业诊断」。
- Studio：运行结果新增业务摘要，统一展示「成功 / 失败 / 已取消」，失败优先显示主因和单一建议。
- Web：默认页签改为「最近运行结果」，按当前任务筛选记录并自动选择最近一条；版本记录保留为次级页签。
- Web：空项目、空任务、空运行记录统一给出「打开织流 Studio → 打开浏览器扩展开始录制 → 回 Studio 运行」路径。
- Web：运行标识、任务标识、底层错误、截图路径与诊断文件默认收进「专业日志」。
- 两端：主区增加「项目 › 自动化任务 › 当前视图」上下文，补齐 tab 语义、焦点可见样式和窄窗口断点。

## TDD 与验证证据

- 红灯：新增合同首次运行时，Studio 缺少业务运行区与信息分层；Web 默认仍为版本页且缺少业务摘要组件，测试按预期失败。
- 绿灯定向合同：Studio `6/6`，Web `5/5`。
- Studio 全量测试：`24` 个文件、`101/101` 通过。
- Web 全量测试：`3` 个文件、`8/8` 通过。
- Studio：typecheck、lint、生产构建通过；构建 `67 modules transformed`。
- Web：typecheck、lint、client/server 生产构建通过；client `35 modules transformed`，server DTS 生成成功。
- Prettier：本任务 `13` 个文件检查通过。
- `git diff --check`：通过。
- 本任务文件敏感信息扫描：未发现；首次全目录扫描仅命中仓库既有脱敏测试夹具，收窄到本任务文件后通过。

## 验收判断

- 需求字段完整性：96/100。
- 原始意图覆盖：94/100。
- 技术实现与回归保护：93/100。
- 可访问性与窄窗口合同：91/100。
- 综合评分：94/100，建议通过并交由集成代理接入 F4 进度/取消组件。
- 当前轨道门禁：通过；P3/P4 保持冻结，不构成进入下一阶段的授权。
- 残余风险：本 worktree 未包含并行 F4 的最终共享状态类型，`cancelled` 的 Studio 真实接线需由集成代理在合并 F4 后复验；F5 已预留独立运行区且文案格式器可识别该状态。
