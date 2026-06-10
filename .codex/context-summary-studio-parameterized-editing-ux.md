# Studio「录制后参数化编辑」UX 讨论上下文

## 时间

- 2026-06-10

## 任务目标

- 在不展开底层实现的前提下，定义 FlowWeave Studio 针对后台管理类网站的「先录制真实流程，再参数化编辑录制流程」核心用户体验。
- 重点聚焦：
  - 弹窗节点的用户心智
  - 变量来源的可理解性
  - 后续步骤对前置变量的绑定方式
  - 运行时暂停后继续的交互反馈

## 已确认前提

1. vNext 先聚焦后台管理类网站。
2. 用户先手动录制真实流程，再在 Studio 中编辑录制流程。
3. Studio 允许显式加入弹窗节点，在运行时收集信息。
4. 弹窗节点既可集中放在前面一次收集，也可分散放在多个步骤前分步收集。
5. 后续录制步骤需要绑定前面弹窗节点产出的变量。
6. 第一版先基于原始录制步骤 + 变量绑定完成，不强依赖高级复合节点。
7. 当前主用户是“录制者自己反复执行”，未来再扩展到模板给别人执行。
8. “搜索后选择实体”是后台网站中的高频动态流程。

## 本轮读取的真源

- `PROJECT_ROUTE_LOCK.md`
- `docs/architecture/overview.md`
- `docs/domain/flow-dsl.md`
- `docs/adr/README.md`
- `docs/superpowers/plans/2026-05-26-run-first-roadmap.md`
- `docs/superpowers/specs/2026-05-25-web-automation-platform-design.md`
- `docs/superpowers/specs/2026-06-06-real-page-stability-design.md`
- `docs/superpowers/specs/2026-06-06-real-page-stability-autonomous-wave-design.md`
- `apps/studio/src/App.tsx`
- `apps/studio/src/shared/run-input-state.ts`
- `apps/studio/src/DiagnosticInspector.tsx`

## 边界结论

- 方案必须停留在 P2/P2.5 的 Studio 体验增强，不进入 P3 深度页面理解与 P4 AI 编排。
- 第一版应延续当前 Studio 已存在的“运行前上下文 + 执行后诊断”心智，而不是引入新的复杂编排器。
- 参数化编辑的主对象应仍是录制步骤本身；弹窗节点只是变量采集入口，不应变成新的流程编程模型。

## 输出定位

- 本轮产出用于后续产品 spec 讨论，不视为已批准的最终交互稿。
- 本轮未修改业务代码、未触发构建或自动化测试。
