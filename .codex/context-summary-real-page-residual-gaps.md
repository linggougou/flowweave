# 真实页面稳定性残余缺口收口上下文摘要

## 任务目标

- 纠正此前把 Wave 13 误判为“Target Disambiguation 尚未实现”的计划偏差。
- 基于当前真实代码状态，重建一版只覆盖残余缺口的计划、编排板与并行轨道。
- 后续所有 subagent 只处理真正未完成的收口项，不重复开发主线已具备的能力。

## 当前路线与边界

- 项目根仍无物理 `PROJECT_ROUTE_LOCK.md`，当前按 `docs/superpowers/plans/2026-05-26-run-first-roadmap.md` 作为等效路线真源。
- 当前主线仍是“真实页面稳定录制与执行增强”。
- 不进入：
  - `P3` 深度 page / network intelligence 扩张
  - `P4 ai-orchestrator`
  - 与用户“页面真实录制与执行稳定性”无关的横向功能扩展

## 已确认完成的能力

1. 作用域线索协议已经存在。
   - `packages/flow-dsl/src/schema.ts`
   - `packages/recorder/src/target-from-dom.ts`
   - `packages/recorder/src/normalize.ts`
2. runtime 歧义消解主体已经存在。
   - `packages/runtime/src/playwright-runner.ts`
   - `packages/runtime/src/playwright-runner.test.ts`
3. Studio 已经具备基础歧义解释与作用域提示。
   - `apps/studio/src/DiagnosticInspector.tsx`
   - `apps/studio/src/shared/repair-suggestions.ts`
4. recorded replay 与 real-page 基线矩阵已经扩容。
   - `examples/recorded-replay-smoke.ts`
   - `packages/runtime/src/recorded-replay-matrix.test.ts`
   - `docs/guides/fixture-matrix.md`

## 当前真正剩余的缺口

### Gap 1：Electron bundle 完整性 / 签名残余风险

- `apps/studio/scripts/ensure-electron-dist.mjs` 已能在 framework symlink 缺失时修复 `dist`。
- 但 `codesign --verify --deep --strict .../Electron.app` 仍报：
  - `code has no resources but signature indicates they must be present`
- 该问题不阻塞当前 UI 修复验收，但会影响桌面壳“长期可稳定运行 / 成品可信度”。

### Gap 2：Studio 尚未完整展示 runtime 候选细节

- runtime 现已产出：
  - `selectedIndex`
  - `ambiguityReason`
  - `candidateSummaries`
- Studio 类型与 Inspector 仍未完整消费这些字段，用户看不到真正的候选并列细节。

### Gap 3：Studio 布局修复缺少自动化 contract

- 左侧可滚动、右侧无堆叠已经通过 DOM 量测与截图复验。
- 当前仍缺：
  - 自动化测试或稳定 contract，防止后续 CSS / 结构回归。

### Gap 4：recorded replay 文档统计口径过期

- `docs/guides/recorded-replay-matrix.md` 仍写 `13` 条场景。
- 实际主线当前是：
  - `23` 个真实 fixture
  - `2` 个 runtime-generated case
  - 总计 `25` 条 recorded replay case

## 建议并行拆分

1. `Electron Bundle Integrity`
   - 范围：`apps/studio/scripts/*`、必要时 `apps/studio/package.json`、相关 `.codex` 留痕
2. `Studio Ambiguity Detail Insight`
   - 范围：`apps/studio/src/DiagnosticInspector.tsx`、`apps/studio/src/shared/*`
3. `Studio Layout Contract`
   - 范围：`apps/studio/src/*.test.tsx` 或配套验证脚本
4. `Recorded Replay Guide Sync`
   - 范围：`docs/guides/recorded-replay-matrix.md`，必要时对齐 `fixture-matrix.md`

## Node 20 验收优先级

- 所有轨道统一以 `Node v20.19.6` 为首要本地验收基线。
- 每轮继续都需要：
  1. 更新 `.codex/operations-log.md`
  2. 跑相关 Node 20 验证
  3. 合并通过验收的轨道
  4. 连续三次遇到同一阻塞条件时，再明确记录为阻塞
