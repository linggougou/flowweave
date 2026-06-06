## 项目上下文摘要（target-disambiguation-wave）

生成时间：2026-06-07 00:43:00 CST

### 1. 当前目标

- 协调分支：`codex/real-page-stability-program`
- 当前主线状态：
  - `autonomous-wave` 已完成收尾并推送
  - `pnpm smoke` 与 `pnpm e2e:real-pages` 已在 `Node v20.19.6` 基线通过
  - 仓库当前工作区干净
- 新一轮目标候选：
  - 继续提升真实页面执行稳定性
  - 优先解决“重复文案 / 重复按钮 / 多命中目标”导致的错误命中问题

### 2. 相似实现分析

- **实现 1**：`packages/recorder/src/target-from-dom.ts`
  - 关键位置：
    - `buildStrategies()`
    - `buildInteractionPayload()`
    - `readLabelText()` / `readTextSample()`
  - 当前模式：
    - 录制时会采集 `role / testId / css / text`
    - 同时把 `nameAttr / placeholder / labelText / textSample` 放入 payload/hints
  - 可复用点：
    - 现有 target hints 采集已经较完整
    - 可在这一层继续补“作用域线索”而不用另起协议
  - 需注意：
    - 当前未采集父级容器、表格行、卡片标题等更强的上下文锚点

- **实现 2**：`packages/recorder/src/normalize.ts`
  - 关键位置：
    - `buildTargetHints()`
    - `buildTargetFromPayload()`
    - `normalizeRecordedEvent()`
  - 当前模式：
    - 录制 payload 中的 `hints` 会稳定进入 `Target.hints`
    - normalize 阶段并不会重写或消费这些 hints，只负责保真
  - 可复用点：
    - 目标协议入口已经统一，后续可沿 `Target.hints` 扩展
  - 需注意：
    - 任何新 hint 都要保持 DSL / normalize / studio 类型一致

- **实现 3**：`packages/runtime/src/playwright-runner.ts`
  - 关键位置：
    - `resolveTarget()`
    - `waitForTargetState()`
    - `buildTargetDiagnosticError()`
  - 当前模式：
    - 按 strategy 顺序创建 locator
    - 对每条 strategy 只取 `locator.first()`
    - `target.hints` 只进入诊断，不参与实际选中逻辑
  - 可复用点：
    - 已有 `matchedCount / visibleCount / strategyAttempts` 诊断框架
    - 可在此基础上扩展“多候选打分 / 歧义判定 / 失败原因”
  - 需注意：
    - 当前的 `.first()` 语义在重复按钮列表页里极易误命中

- **实现 4**：`apps/studio/src/shared/repair-suggestions.ts`
  - 关键位置：
    - `buildDiagnosticRepairSuggestions()`
    - `describeTargetHints()`
  - 当前模式：
    - Studio 已能识别 “多命中 / 不可见 / 缺失 / timeout” 等诊断形态
    - 但这些建议发生在失败之后，不会反向提升 runtime 定位成功率
  - 可复用点：
    - 可以直接复用现有歧义提示文案与优先级排序
  - 需注意：
    - 如果本轮新增 runtime 歧义诊断字段，Studio 类型与展示也要同步

- **实现 5**：`docs/guides/fixture-matrix.md` 与 `examples/fixtures/*.html`
  - 当前矩阵：
    - `baseline=11`
    - `p5=15`
    - `p6=18`
  - 当前缺口：
    - 现有 fixture 多数使用唯一 `id` 或唯一 CTA
    - 尚未明确覆盖“列表行内多个相同按钮 / 多个相同 Tab 名称 / 同文案操作列”的歧义定位问题

### 3. 当前已知事实

- `targetHints` 当前主要用于：
  - `packages/runtime/src/playwright-runner.ts` 的失败诊断
  - `apps/studio/src/DiagnosticInspector.tsx` 的诊断展示
  - `apps/studio/src/shared/repair-suggestions.ts` 的修复建议
- `targetHints` 当前没有用于：
  - runtime 成功路径的候选筛选
  - locator 多命中时的优先级判断
  - 作用域缩小或表格行锚定
- `packages/page-intelligence/src/fragility.ts` 已能提示：
  - `CSS_ONLY`
  - `CSS_NTH_OF_TYPE`
  - `TEXT_ONLY`
  - `WAIT_MAY_BE_UNSTABLE`
  - `MISSING_ENVIRONMENT`
  - `MISSING_VARIABLE`
- 这说明项目已经承认“选择器稳定性”是核心问题，但当前主要停留在体检和失败后提示阶段

### 4. 项目约定

- 语言：注释、文档、日志统一简体中文；标识符英文
- 技术栈：TypeScript strict、Vitest、Playwright、pnpm workspace、Turborepo
- 现有运行基线：`Node v20.19.6`
- 现有主要验证口径：
  - `pnpm smoke`
  - `pnpm e2e:real-pages`
  - 包级 `vitest` / `typecheck`

### 5. 可复用组件清单

- `packages/recorder/src/target-from-dom.ts`
  - 录制时 target strategy 与 hints 抽取
- `packages/recorder/src/normalize.ts`
  - RecordedEvent -> Flow Target 保真
- `packages/runtime/src/playwright-runner.ts`
  - runtime target 解析、等待和诊断产物
- `packages/page-intelligence/src/fragility.ts`
  - 选择器稳定性体检规则
- `apps/studio/src/shared/repair-suggestions.ts`
  - 失败后修复建议优先级与文案
- `docs/guides/fixture-matrix.md`
  - 真实页面基准矩阵定义

### 6. 推荐设计方向

- 推荐主题：**真实页面歧义目标消解（Target Disambiguation）**
- 核心判断：
  - 当前最大的剩余真实使用风险，不是“不会录”“不会跑”，而是“能录也能跑，但在重复元素页面上跑错对象”
- 推荐方案：
  1. 扩展 `Target.hints` 或同层协议，加入最小但高价值的作用域线索
  2. runtime 在 strategy 多命中时，基于 hints 做候选打分，而不是直接 `.first()`
  3. 对无法可靠收窄的情况输出明确“歧义失败”诊断，而不是静默点错
  4. 补一组重复按钮 / 重复行操作 fixture，形成长期回归基线
  5. Studio 展示“歧义定位”专用诊断与修复建议

### 7. 风险点

- 新增 hint 字段会影响：
  - `flow-dsl`
  - `recorder`
  - `runtime`
  - `studio-api-types`
  - 相关测试快照 / 手写 fixture
- 若 runtime 打分策略过宽，可能把当前稳定路径也变慢或误判
- 若仅做 runtime 打分、不补 recorder 作用域线索，重复列表页仍可能证据不足
- 若只补 fixture、不改 runtime 成功路径，仍只能“看见问题”，不能“解决问题”

### 8. 下一步验证策略

- 先跑与目标链路最相关的 Node 20 基线：
  - `pnpm --filter @flowweave/recorder test -- target-from-dom.test.ts normalize.test.ts step-filter.test.ts`
  - `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts real-page-matrix.test.ts`
  - `pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts`
- 若基线通过，再产出：
  - 设计文档
  - 实施计划
  - 并行编排板
