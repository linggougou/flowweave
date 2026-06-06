# 真实页面 Target Disambiguation 设计

生成时间：2026-06-07

## 1. 背景

截至 `2026-06-07`，`codex/real-page-stability-program` 已完成以下主线能力：

1. Recorder / runtime / Studio / Benchmarks 的真实页面稳定性底座已经打通。
2. `Node v20.19.6` 基线下，`pnpm smoke` 与 `pnpm e2e:real-pages` 均通过。
3. 真实页面矩阵已经扩展到 `p6`，覆盖 `18` 个 fixture。
4. Recorder 已能采集 `nameAttr / placeholder / labelText / textSample` 等 target hints。
5. Studio 也已能在失败后根据 `targetHints` 生成修复建议。

但当前仍存在一个高价值缺口：

- runtime 在成功路径里几乎不消费这些 hints，而是沿 strategy 顺序取 `locator.first()`。
- 一旦页面上存在多个同文案按钮、多个“编辑 / 保存 / 查看”操作列、同页多个相似输入区，就容易发生“能找到元素，但点错对象”的问题。
- 这类问题在本地矩阵中尚未被单独建模，因为现有 fixture 多数使用唯一 `id` 或唯一 CTA。

换句话说，当前主线已经从“不会录 / 不会跑”提升到了“能录能跑”，下一阶段要解决的是“跑到对的那个元素”。

## 2. 目标

### 2.1 核心目标

1. 让 Recorder 为真实页面步骤补充最小但高价值的“作用域线索”。
2. 让 runtime 在多命中目标时优先做候选消解，而不是直接取第一个元素。
3. 当 runtime 仍无法可靠缩小范围时，明确产出“歧义定位失败”诊断，而不是静默误点。
4. 为“重复按钮 / 重复文案 / 列表行作用域”建立新的真实页面基准与 recorded replay 回归。
5. 让 Studio 明确展示这类歧义失败的根因和下一步修复动作。

### 2.2 成功标准

1. `Target.hints` 中新增的作用域字段可以从 Recorder 保真流入 Flow，并被 runtime / Studio 统一消费。
2. runtime 在 `matchedCount > 1` 时，会尝试基于 hints 做候选打分和收窄，而不是始终走 `.first()`。
3. 新增至少 `1` 条 recorded replay 回归，证明重复操作列仍能命中正确行。
4. 新增至少 `1` 个真实页面 fixture，覆盖相同按钮文案的歧义列表或表格。
5. Studio 能把“多命中但无法唯一确认”的场景解释为歧义定位问题，而不是笼统“找不到元素”。
6. `Node v20.19.6` 下以下验证通过：
   - `pnpm --filter @flowweave/recorder test`
   - `pnpm --filter @flowweave/runtime test`
   - `pnpm --filter @flowweave/app-studio test`
   - `pnpm e2e:real-pages`

## 3. 方案比较

### 方案 A：只改 runtime，复用现有 hints 做候选打分

做法：

- 不改 Recorder 协议。
- runtime 在 `matchedCount > 1` 时，依据 `nameAttr / placeholder / labelText / textSample` 为候选元素打分。

优点：

- 改动小，能快速落地。
- 对已有 Flow 也有直接收益。

缺点：

- 现有 hints 更偏元素本体，不足以区分“第 2 行编辑”和“第 5 行编辑”。
- 对真实后台最常见的“重复按钮列表”帮助有限。

### 方案 B：端到端补作用域线索 + runtime 候选消解 + Studio 歧义诊断

做法：

- Recorder 在元素本体 hints 之外，再补最小作用域线索。
- runtime 先按 strategy 找候选，再按元素 hints + 作用域线索打分。
- 如果仍无法唯一确定，产出结构化歧义诊断。
- Benchmarks 和 Studio 同步补回归与可视化说明。

优点：

- 能同时覆盖“重复按钮”“重复 tab 文案”“相似输入区”这类真实后台问题。
- 诊断信息更完整，不会出现“点错了但没有任何解释”。
- 与现有 `targetHints`、`repair-suggestions`、`diagnosticPath` 体系兼容。

缺点：

- 需要跨 `flow-dsl / recorder / runtime / studio / examples` 协同改动。
- 必须谨慎控制新 hint 字段，避免协议膨胀。

### 方案 C：只加强 Studio 失败解释，不改变 runtime 行为

做法：

- 维持 `.first()`。
- 一旦失败或误命中，只在 Studio 里给出更细修复建议。

优点：

- 风险最小。

缺点：

- 只能“解释失败”，不能“减少失败”。
- 对用户真实使用价值不足。

### 推荐方案

采用 **方案 B**。

原因：

- 它是当前最贴近用户真实痛点的最小闭环。
- 它不需要引入 AI、自愈或远端真实站点 smoke，就能明显提升“录制后直接可用”的概率。
- 它还保持了良好的递进关系：先做作用域线索和歧义消解，后续如果要进入 richer selector 或语义自愈，也能复用这层基础。

## 4. 设计范围

### 4.1 Foundation：扩展 Target hints 协议

目标：

- 在 `flow-dsl` 中为 `Target.hints` 增加最小作用域线索字段。

推荐字段：

- `scopeText?: string`
  - 最近的表格行 / 列表项 / 卡片标题 / 弹层标题等短文本锚点
- `scopeKind?: "row" | "listitem" | "dialog" | "tabpanel" | "section" | "card"`
  - 线索来自哪类容器，帮助 runtime 采用不同的 DOM 上溯策略

约束：

- 不新增复杂嵌套结构，保持 JSON 导出与手工阅读友好。
- 继续与现有 `nameAttr / placeholder / labelText / textSample` 并存。

### 4.2 Recorder：采集作用域线索

目标：

- 在 `target-from-dom.ts` 中，从最近的语义容器提取作用域线索。

优先容器：

1. 表格行：`tr`、`[role=row]`
2. 列表项：`li`、`[role=listitem]`
3. 弹层：`[role=dialog]`、`.el-dialog`
4. Tab 面板：`[role=tabpanel]`
5. 一般区域：`section`、`article`、卡片标题容器

规则：

- 只保留短文本摘要，避免把整段长文案塞进 Flow。
- 若作用域文本与元素本体文本高度重复，则不额外写入。
- 对 upload / contenteditable / 列表操作按钮都允许采集。

### 4.3 Runtime：候选消解与歧义失败

目标：

- 修改 `resolveTarget()` 和 `waitForTargetState()`：
  - `matchedCount === 1` 时保持当前快路径
  - `matchedCount > 1` 时进入候选消解

候选消解规则：

1. 先过滤不可见候选
2. 再基于以下信号打分：
   - `nameAttr`
   - `placeholder`
   - `labelText`
   - `textSample`
   - `scopeText`
   - `scopeKind`
3. 若唯一最高分候选明显领先，则选该候选
4. 若最高分并列，或所有候选得分都过低，则抛出“歧义定位失败”

诊断增强：

- 失败时额外记录：
  - 候选数量
  - 前几名候选摘要
  - 哪些 hint 未能帮助收窄
- 保持现有 `strategyAttempts` 兼容，不替换既有诊断结构

### 4.4 Studio：歧义修复建议

目标：

- 当 diagnostic 指向“多命中 / 候选并列 / 作用域不足”时，给出专门的修复建议。

建议方向：

- 优先重新录制到带更强上下文的目标
- 补稳定 `testId` 或更明确的 `aria-label`
- 若是列表行操作，建议把步骤重新录到包含行标题的那一行

展示范围：

- `DiagnosticInspector`
- `repair-suggestions.ts`
- 必要时 `studio-api-types.ts`

### 4.5 Benchmarks：重复元素基准

优先新增 fixture：

1. `repeated-row-actions.html`
   - 多行数据共享同一个“编辑”按钮文案
   - 只有目标行编辑后会把结果区写成指定摘要
2. 如果节奏允许，再补 `duplicate-save-surfaces.html`
   - 页面主区和弹层内都存在“保存”按钮
   - 要求录制步骤必须命中弹层内保存

对应回归：

- runtime recorded replay 新增直接由 recorded events 构建 Flow 的回放证明
- `real-page-matrix` 增加新场景并验证汇总输出不退化

## 5. 非目标

本轮不做：

1. AI 自愈选择器
2. 通用模糊 DOM diff
3. 自动改写旧 Flow
4. 远端真实站点 smoke
5. 对所有历史执行记录做批量修复迁移

## 6. 并行原则

本轮适合采用“Foundation + 4 轨并行”：

1. **Foundation**
   - 只管协议与类型
2. **Recorder Scope Hints**
   - 只管 DOM 采集与 normalize 保真
3. **Runtime Disambiguation**
   - 只管候选消解与诊断产物
4. **Studio Ambiguity Insight**
   - 只管诊断展示与修复建议
5. **Benchmarks P7**
   - 只管 fixture、recorded replay、矩阵验证

拆分理由：

- `flow-dsl` / `recorder` / `runtime` / `studio` / `examples` 的写入范围可较好隔离
- `Runtime` 与 `Benchmarks` 仍有少量耦合，但可以通过“runtime 先补算法、benchmarks 后补 fixture”降低冲突

## 7. 验收口径

- Foundation
  - `pnpm --filter @flowweave/flow-dsl test`
- Recorder
  - `pnpm --filter @flowweave/recorder test -- target-from-dom.test.ts normalize.test.ts step-filter.test.ts`
- Runtime
  - `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
- Studio
  - `pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts`
  - `pnpm --filter @flowweave/app-studio typecheck`
- Benchmarks
  - `pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts playwright-runner.test.ts`
  - `pnpm e2e:real-pages`
- 主代理统一门槛
  - `pnpm smoke`
  - `pnpm e2e:real-pages`

## 8. 结论

下一轮最值得继续推进的，不是再横向补步骤类型，而是把“歧义目标消解”这条真实页面使用中的高频失败路径做实。只要按 `Foundation -> Recorder -> Runtime -> Studio -> Benchmarks` 的顺序并行推进，FlowWeave 就能从“多数页面能跑”进一步升级到“重复元素页面也更可能跑对对象”。
