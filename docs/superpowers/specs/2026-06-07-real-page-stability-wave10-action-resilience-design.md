# 真实页面稳定性 Wave 10：动作级韧性与 P8 技术根因观测设计

生成时间：2026-06-07 06:05:00 CST

## 1. 背景

截至 Wave 9，`codex/real-page-stability-program` 已经把真实页面稳定性推进到以下状态：

1. recorded replay baseline 已稳定覆盖 `13` 个场景。
2. `pnpm e2e:real-pages` 已稳定覆盖 `21` 个场景。
3. runtime 已具备：
   - 多策略定位回退
   - 候选消歧
   - suggest / combobox 窄等待
   - 失败诊断 JSON 与页面快照落盘
4. Studio 已能解释：
   - `ambiguous-target`
   - `hidden-target`
   - `missing-target`
   - `execution-error`
5. 真实页面矩阵、recorded replay baseline 与 `docs/guides/fixture-matrix.md` 已出现“场景名单不同步”的维护压力：
   - `examples/fixtures` 当前已有 `22` 个 HTML fixture
   - `p7` 真实页面矩阵当前执行 `21` 个场景
   - recorded replay baseline 当前只覆盖其中 `12` 个真实 fixture，再加 `1` 个临时生成页

但从当前代码和矩阵结构看，仍有一个很现实的缺口：

- `runStep()` 里的核心动作仍是“一次性直接调用 Playwright 动作”。
- 一旦目标元素在定位成功后发生 rerender、瞬时 detached、短暂不可编辑或被局部层遮挡，当前 runtime 更容易直接失败，而不是先做一次窄范围恢复。
- 真实页面矩阵目前按业务场景族统计成功率，却还没有把这类“动作执行瞬态失败”单独建模成技术根因。

换句话说，当前主线已经能解决“不会录 / 不会跑 / 跑错元素 / suggest 时序错”的问题，下一阶段更值得解决的是：

**元素找对了，但动作落下去时页面刚好抖了一下，导致真实用户环境里偶发红灯。**

## 2. 目标

### 2.1 核心目标

1. 为 runtime 的 `click / fill / select / setChecked / press / upload` 增加最小但高价值的动作级恢复能力。
2. 让 runtime 在遇到瞬态执行错误时，先尝试重新定位、轻量预备动作和有限重试，而不是立即失败。
3. 为这类动作失败增加结构化技术根因分类，便于 Studio 与矩阵脚本统一解释。
4. 收敛 fixture / 文档 / real-page smoke / recorded replay 的场景单一真相，降低后续计数漂移。
5. 建立新的 `p8` 真实页面矩阵档位，专门承载动作级韧性场景，而不是继续把所有用例压进当前默认 `p7`。
6. 同步补 recorded replay 与 real-page smoke 回归，优先覆盖当前缺失的真实后台交互家族，证明新能力既能提升 runtime 也能稳住闭环。

### 2.2 成功标准

1. runtime 在以下瞬态错误上至少具备一次恢复机会：
   - detached / not attached
   - not visible / not editable / not enabled 这类可操作状态尚未稳定
   - 遮挡 / pointer interception / 目标被其他层覆盖
2. 统一 `examples/fixtures`、`fixture-matrix.md`、`real-page-smoke.ts`、`recorded-replay-smoke.ts` 的场景归属与名单口径。
3. 新增至少 `2` 个能稳定复现上述问题的 fixture。
4. `examples/real-page-smoke.ts` 新增 `p8` profile，并保留对现有 `p7` 默认执行行为的兼容。
5. recorded replay 至少新增 `2` 条此前未覆盖的真实 fixture 家族。
6. `apps/studio` 能把这类问题优先解释成具体技术根因，而不是统一落成笼统的 `execution-error`。
7. `Node v20.19.6` 下以下验证通过：
   - `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
   - `pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts real-page-matrix.test.ts`
   - `pnpm --filter @flowweave/app-studio test -- DiagnosticInspector failure-insights repair-suggestions`
   - `pnpm e2e:recorded-pages`
   - `pnpm e2e:real-pages`

## 3. 方案比较

### 方案 A：只扩 benchmark，不改 runtime

做法：

- 只新增更多 fixture 和矩阵分类。
- 不改 runtime 的动作执行逻辑。

优点：

- 改动小，风险最低。

缺点：

- 只能更稳定地复现问题，不能减少真实失败。
- 用户实际体验收益有限。

### 方案 B：runtime 动作级恢复 + P8 fixture + Studio 根因解释

做法：

- runtime 增加动作预备与有限重试。
- benchmarks 新增专门暴露动作瞬态问题的 fixture。
- Studio 根据结构化根因输出更具体的修复建议。

优点：

- 直接命中真实页面常见红灯来源。
- 不需要改 DSL，不会放大协议复杂度。
- 与现有诊断产物和矩阵体系兼容。

缺点：

- 需要跨 runtime / examples / studio 三块并行协同。

### 方案 C：只做 Studio 文案增强

做法：

- 保持 runtime 原样。
- 只把动作失败的错误信息解释得更清楚。

优点：

- 风险最小。

缺点：

- 只能解释失败，不能减少失败。

### 推荐方案

采用 **方案 B**。

原因：

1. 当前最大的缺口在 runtime 行为层，而不是 DSL 表达层。
2. 现有 `targetHints`、页面快照、诊断 JSON 已经能承载足够的上下文，不必再扩协议。
3. 增加动作级韧性后，Studio 和矩阵的观测能力才能真正体现收益，而不是只做包装层改良。

## 4. 详细设计

### 4.1 Runtime：动作级恢复封装

文件：

- `packages/runtime/src/playwright-runner.ts`
- `packages/runtime/src/playwright-runner.test.ts`
- `packages/runtime/src/types.ts`

设计：

1. 引入统一动作封装，例如：
   - `performLocatorActionWithRecovery()`
   - `classifyRuntimeActionFailure()`
2. 封装职责：
   - 首次执行动作前，补一次 `scrollIntoViewIfNeeded()` 或等价轻量预备。
   - 动作失败时识别是否属于可恢复的瞬态错误。
   - 若可恢复，则重新 `resolveTarget()`，最多再尝试一次。
3. 可恢复错误范围只聚焦高价值瞬态：
   - detached / not attached
   - element is not visible / not editable / not enabled
   - pointer interception / 目标被其他元素遮挡
4. 不做无限重试，也不做通用强等待。
5. runtime-error 诊断中新增结构化字段，例如：
   - `runtimeCauseCategory`
   - `recoveredAttemptCount`
   - `recoveryTried`

### 4.2 Benchmarks：建立 P8 动作瞬态矩阵

文件：

- `examples/fixtures/*`
- `examples/real-page-smoke.ts`
- `examples/run-real-page-smoke.ts`
- `examples/recorded-replay-smoke.ts`
- `packages/runtime/src/real-page-matrix.test.ts`
- `packages/runtime/src/recorded-replay-matrix.test.ts`
- `docs/guides/fixture-matrix.md`

设计：

1. 先统一矩阵单一真相：
   - 明确哪些场景属于 `examples/fixtures` 实体页
   - 明确 `placeholder-disambiguation` 这类临时生成页不进入 fixture 文档总表
   - 把 `keyboard-command-palette` 等已进主线的场景补齐到文档总览
2. 新增 `p8` 档位，不再继续把动作韧性场景直接塞进 `p7`。
3. 优先新增 2 个 fixture：
   - `rerender-action-panel.html`
     - 点击或输入前目标节点发生局部重渲染，要求 runtime 重新定位后成功
   - `dialog-save-surface.html`
     - 页面主区和弹层内都存在保存动作，且弹层按钮初始短暂不可点或被覆盖，要求 runtime 等待可操作后命中弹层内正确动作
4. `real-page-smoke` 输出继续保留业务场景族统计，同时新增技术根因维度统计。
5. recorded replay baseline 优先补当前尚未覆盖的真实 fixture 家族：
   - 容器 / 覆盖层家族：`modal + toast + drawer + tab`
   - 异步状态家族：`delayed + pagination + empty-results + session-recovery`
6. 至少让其中 `2` 个缺口场景进入 recorded replay baseline，证明录制闭环也能享受到动作级恢复能力。

### 4.3 Studio：动作失败技术根因解释

文件：

- `apps/studio/src/shared/studio-api-types.ts`
- `apps/studio/src/shared/failure-insights.ts`
- `apps/studio/src/shared/repair-suggestions.ts`
- `apps/studio/src/DiagnosticInspector.tsx`
- 相关测试文件

设计：

1. 在 `runtime-error` 诊断已有基础上，增加动作失败技术根因分类：
   - `detached`
   - `intercepted`
   - `not-ready`
   - `not-editable`
   - `unknown`
2. `FailureInsight` 优先展示：
   - 是否已经尝试恢复
   - 恢复失败发生在哪个动作类型
   - 建议用户补的不是“重新录制全部流程”，而是更具体的动作修复建议
3. `DiagnosticInspector` 在有 `runtimeCauseCategory` 时优先显示分类说明和恢复尝试信息。

## 5. 非目标

本轮明确不做：

1. AI 自愈选择器
2. 无限重试或自适应超时学习
3. 远端真实站点 smoke
4. 改 DSL schema
5. 大规模重写现有 `p7` 矩阵结构

## 6. 并行原则

本轮适合采用“三轨并行 + 主代理集成”：

1. **Runtime Action Resilience**
   - 只改 `packages/runtime/src/*`
2. **Benchmarks P8**
   - 只改 `examples/*`、`packages/runtime/src/*matrix*.test.ts`、`docs/guides/fixture-matrix.md`
3. **Studio Runtime Cause Insight**
   - 只改 `apps/studio/src/*shared*`、`DiagnosticInspector*`

主代理负责：

1. 先落设计与计划
2. 统一创建 worktree
3. 按 Node 20 回收并验证
4. 更新 `.codex` 留痕与验收报告

## 7. 风险与补救

### 风险 1：恢复范围过宽，反而掩盖真实错误

- 补救：
  - 只对白名单瞬态错误做一次恢复。
  - 超过一次仍失败，保持原始错误暴露。

### 风险 2：P8 继续挤压默认矩阵时长

- 补救：
  - 设计上保留 `p7` 兼容默认，`p8` 作为显式扩展档位。
  - 是否把 `p8` 纳入默认 CLI，等本轮稳定后再决定。

### 风险 3：Studio 与 runtime 字段演化不同步

- 补救：
  - 把 `runtimeCauseCategory` 放进共享类型并补测试。
  - 主代理统一在合并后做一次 Studio 共享逻辑回归。

## 8. 审批说明

当前会话已获得“自主规划任务、持续开发、无需指示”的明确授权，因此本设计直接作为下一阶段实施依据，并通过 `.codex` 留痕承担审批记录。
