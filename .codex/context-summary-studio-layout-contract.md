# Studio Layout Contract 上下文摘要

## 任务目标

- 为已修复的 Studio 布局回归补自动化 contract，避免后续 CSS 或 DOM 结构调整再次打坏：
  - 左侧项目列表必须位于真实滚动容器内
  - 左侧滚动容器必须保留可滚动语义与结构
  - 右侧两个主内容面板在纵向收缩场景下不得重新发生重叠

## 当前路线与生命周期判断

- 项目根没有物理 `PROJECT_ROUTE_LOCK.md`
- 本轮按项目 `AGENTS.md` 指定的 `docs/superpowers/plans/2026-05-26-run-first-roadmap.md` 作为等效路线真源
- 当前属于 P2 收口阶段内的 Studio 本地体验与回归防护工作，不引入新产品能力，不触碰 AI / Electron 成品化轨道
- 本轮最小可验收闭环：
  - 新增不依赖真实 Electron 窗口的布局 contract 测试
  - 在 `Node v20.19.6` 下通过 `@flowweave/app-studio` 的 test 与 build 验证

## 已确认事实

1. 布局回归修复本身已经完成，并已有 DOM 量测证据：
   - `projectCount = 40`
   - `canScroll = true`
   - `atBottom = true`
   - `panelOverlap = false`
2. 当前缺口不是继续改 UI，而是缺少自动化 contract 去锁住修复结果。
3. `apps/studio` 当前测试环境没有 `jsdom` 和 `@testing-library/react`。
4. 因此本轮采用的 contract 方案是：
   - 用真实 `App` 的静态渲染结果锁 DOM 结构
   - 用 `styles.css` 的关键 flex / overflow 规则锁布局语义
   - 不引入新依赖，不依赖真实 Electron 窗口

## 允许与禁止范围

- 允许：
  - 新增 `apps/studio/src/layout-contract.test.tsx` 或等价新测试文件
  - 如确有必要，对 `apps/studio/src/App.tsx` 做极小可测性调整
  - 新增本文件作为本轨道唯一 `.codex` 留痕
- 禁止：
  - 修改 `DiagnosticInspector.test.tsx`
  - 修改 `shared/*`
  - 修改共享 `.codex/operations-log.md`
  - 修改 Electron 轨道文件
  - 顺手重构 Studio 布局或样式体系

## 计划中的 contract 断言

1. 渲染后的项目列表区块必须完整落在 `.sidebar-scroll` 内。
2. `styles.css` 必须继续为左侧滚动链路保留 `min-height` / `flex` / `overflow-y` 组合。
3. 右侧渲染结果必须继续保留两个独立主面板，并由 `styles.css` 锁住 `flex-shrink: 0` 与 `flex: 0 0 auto` 合同。

## 验证门禁

- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build`
