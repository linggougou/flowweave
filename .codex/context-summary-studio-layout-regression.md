# Studio 布局回归修复上下文摘要

## 任务目标

- 修复 Studio 左侧侧栏在项目较多时无法滚动的问题。
- 修复 Studio 右侧主内容区中“运行环境”面板与“录制内容 / 脆弱性提示”等区块发生文字堆叠、视觉上像 DOM 结构错乱的问题。
- 在 `Node v20.19.6` 基线下完成本地可重复验证，并补齐项目 `.codex` 留痕。

## 当前路线与边界

- 项目根未提供物理 `PROJECT_ROUTE_LOCK.md`，当前按项目 `AGENTS.md` 指向的
  `docs/superpowers/plans/2026-05-26-run-first-roadmap.md` 作为等效路线真源。
- 本轮任务属于 Studio 本地运行体验与执行工作台可用性修复，不扩展产品功能，不改变录制 / 回放 / 执行主线。
- 允许修改范围：
  - `apps/studio/src/App.tsx`
  - `apps/studio/src/styles.css`
  - 项目 `.codex/*`
- 禁止修改范围：
  - `.idea/`
  - Flow DSL / runtime / project-knowledge 业务逻辑
  - 路线文档与阶段冻结边界

## 已确认事实

1. 左侧滚动失效不是浏览器兼容问题，而是 DOM 结构层级问题。
   - “项目”区块之前渲染在 `.sidebar-scroll` 外层。
   - 当项目很多时，真正增长高度的是外层内容，不是可滚动容器本身，所以滚动条无法覆盖到项目列表下半部分。
2. 右侧“DOM 结构乱了 / 文字堆叠”不是数据错乱，而是布局压缩问题。
   - `.main` 是纵向 flex 容器。
   - 两个 `.flow-content-panel` 是 flex item。
   - 旧样式允许这些面板在纵向空间不足时继续收缩，并且内部若干元素保留默认 margin。
   - 结果是上方面板里的“变量注入 / 运行前检查”等内容视觉上压进下方 fragility notice 与 Flow 区块，形成文字叠在一起的现象。
3. 当前采取的是最小修复策略，不重构 Studio 页面结构。
   - `App.tsx`：把“项目”区块纳入 `.sidebar-scroll`。
   - `styles.css`：为侧栏滚动容器和主内容 flex 子项补齐约束，阻止内容压缩串位，并清掉影响叠层观感的默认段落 / 标题 margin。
4. 浏览器级复验已留有证据：
   - 截图：`apps/studio/output/playwright/studio-layout/layout-fixed.png`
   - 之前的 DOM 量测结果显示：
     - `projectCount = 40`
     - `sidebar.clientHeight = 1097`
     - `sidebar.scrollHeight = 2867`
     - `canScroll = true`
     - 强制滚到底后 `atBottom = true`
5. 附件中的 pasted text 实际是一次 Electron 崩溃报告。
   - 报错主题是 `Code Signature Invalid`
   - 属于桌面壳运行链路的独立问题，与本轮布局回归不是同一根因，但会影响后续“把成品真正跑起来”的复验。

## 本轮修复后的预期结果

- 侧栏项目过多时可连续滚动到底部，项目列表、Flow 列表、最近执行共享同一滚动层。
- 右侧“运行环境”面板与下方 Flow / fragility 面板按自然高度顺序排布，不再发生文字跨卡片堆叠。
- 现有 Studio 业务逻辑、执行数据、脆弱性分析结果不变，仅修复展示层回归。
