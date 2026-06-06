# 真实页面稳定性 Wave 11：执行韧性扩展设计

生成时间：2026-06-07 07:45:00 CST

## 1. 当前基线

截至 `codex/real-page-stability-program@0429b4f`，主线已经完成：

1. runtime 对 `fill / select / setChecked` 的动作回弹恢复。
2. Benchmarks 文档与 recorded replay / real-page 口径单一真相收口。
3. Studio 对 `fill-value-reset / select-value-reset / checked-state-reset` 三类 cause 的可读洞察与修复建议。

但主线仍保留三类明显缺口：

1. `click / press / upload` 仍是一发式执行，对 detached / 遮挡 / 暂不可操作态没有恢复机会。
2. `packages/runtime/src/types.ts` 还没有 `runtimeCauseCategory`、`recoveryTried`、`recoveredAttemptCount` 这类结构化观测字段。
3. `examples/real-page-smoke.ts` 仍停留在 `p7`；更重的动作韧性场景还没有单独的 `p8` 分层。

## 2. 核心目标

1. 把动作恢复能力从 `fill / select / setChecked` 扩到更高频的 `click / press / upload`。
2. 让 runtime 对动作失败输出更稳定的结构化根因：
   - `detached`
   - `intercepted`
   - `not-ready`
   - `not-editable`
   - `unknown`
3. 建立 `p8` 真实页面矩阵，用来承载更重的动作韧性场景而不污染 `p7` 默认回归。
4. 让 Studio 在 `action-state-reset` 之外，也能解释上述更广的 runtime 动作失败根因与恢复尝试信息。

## 3. 方案比较

### 方案 A：只扩 runtime 恢复，不动 benchmarks / Studio

- 优点：实现最直接。
- 缺点：用户看不到“为什么恢复失败”，也无法通过独立矩阵衡量收益。

### 方案 B：runtime + P8 + Studio 三轨继续协同

- 优点：运行时能力、场景验证、诊断消费三者同步进化，收益最完整。
- 缺点：跨模块协调成本更高。

### 方案 C：先只做 P8 和 Studio 文案，runtime 留后

- 优点：风险低。
- 缺点：只能更稳定复现问题，不能实质减少真实失败。

### 推荐结论

继续采用 **方案 B**，但以当前主线为基线重开 `Wave 11`：

1. runtime 先产出结构化字段和更广的一次恢复。
2. benchmarks 再用 `p8` 和新 fixture 验证这些能力。
3. Studio 最后消费 `runtimeCauseCategory` 与恢复尝试信息。

## 4. 详细设计

### 4.1 Runtime：广义动作恢复

文件：

- `packages/runtime/src/playwright-runner.ts`
- `packages/runtime/src/types.ts`
- `packages/runtime/src/playwright-runner.test.ts`

设计要点：

1. 让 `click / press / upload` 与现有 `fill / select / setChecked` 共享“最多一次恢复”的统一封装。
2. 恢复白名单只覆盖：
   - `detached / not attached`
   - `intercepts pointer events / 被其他元素覆盖`
   - `not visible / not enabled / not editable`
3. `RuntimeErrorDiagnostic` 新增：
   - `runtimeCauseCategory`
   - `recoveryTried`
   - `recoveredAttemptCount`
4. 如果第一次失败命中白名单：
   - 尝试轻量预备动作（必要时重新等待、滚动、重新定位）
   - 最多重试一次
5. 如果二次仍失败：
   - 保留原始错误消息
   - 同时落结构化分类和恢复尝试信息

### 4.2 Benchmarks：P8 动作韧性矩阵

文件：

- `examples/fixtures/*`
- `examples/real-page-smoke.ts`
- `examples/run-real-page-smoke.ts`
- `examples/recorded-replay-smoke.ts`
- `packages/runtime/src/real-page-matrix.test.ts`
- `packages/runtime/src/recorded-replay-matrix.test.ts`
- `docs/guides/fixture-matrix.md`

设计要点：

1. 新增 `p8` profile，不改变 `p7` 默认兼容行为。
2. 首批新增至少两个 fixture：
   - `rerender-action-panel`
     - 强化 detached / rerender 后重新定位
   - `dialog-save-surface`
     - 强化遮挡、局部不可操作与弹层内动作
3. recorded replay baseline 至少补 `1-2` 条最贴近动作韧性的真实 fixture 家族，证明录制闭环也能受益。
4. 汇总结果在现有业务场景族之外，增加技术根因维度统计。

### 4.3 Studio：广义 runtimeCauseCategory 洞察

文件：

- `apps/studio/src/shared/studio-api-types.ts`
- `apps/studio/src/shared/failure-insights.ts`
- `apps/studio/src/shared/repair-suggestions.ts`
- `apps/studio/src/DiagnosticInspector.tsx`
- 对应测试

设计要点：

1. 保留已完成的 `action-state-reset`，在其外新增：
   - `detached`
   - `intercepted`
   - `not-ready`
   - `not-editable`
   - `unknown`
2. `DiagnosticInspector` 优先展示：
   - 当前根因分类
   - 是否已尝试恢复
   - 恢复尝试了几次
3. 修复建议优先落到“补等待 / 重新对准真实控件 / 清遮挡层 / 重新录制到最终节点”这类具体动作，而不是泛化为“全部重录”。

## 5. 非目标

本阶段仍不做：

1. AI 自愈选择器
2. 无限重试与自适应超时
3. 远端真实站点自动回归
4. Flow DSL schema 升级

## 6. 成功标准

1. runtime 至少新增两条 deterministic 红绿灯，覆盖 detached 与遮挡/暂不可操作。
2. `RuntimeErrorDiagnostic` 能输出 `runtimeCauseCategory`、`recoveryTried`、`recoveredAttemptCount`。
3. `p8` profile 建立完成，并有至少 `2` 个新 fixture。
4. Studio 能解释 `action-state-reset` 之外的至少 `3` 类动作根因。
5. Node 20 下以下命令通过：
   - `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
   - `pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts real-page-matrix.test.ts`
   - `pnpm --filter @flowweave/app-studio test`
   - `pnpm e2e:recorded-pages`
   - `pnpm e2e:real-pages`

## 7. 审批说明

当前会话已获得“后续全权交由你自主规划任务、持续开发、无需指示”的明确授权，因此本设计文档直接作为 Wave 11 下一阶段实施依据。
