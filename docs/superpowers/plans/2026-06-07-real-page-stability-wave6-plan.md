# 真实页面稳定性 Wave 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `p7` 真实页面稳定执行主线上，补齐“多步骤脆弱性预警 + 通用失败诊断 + Studio 统一消费”三件套。

**Architecture:** 复用现有 `fragility` 与 `diagnosticPath` 两条链路，不新增持久化模型。先扩展静态分析覆盖面，再为 runtime 建立统一失败诊断 envelope，最后让 Studio 同时消费目标类和通用类诊断。

**Tech Stack:** TypeScript strict、Vitest、Playwright、Electron、pnpm、Node v20.19.6

---

## 文件结构

- `packages/page-intelligence/src/fragility.ts`
  - 扩展 target-bearing step 的脆弱性体检范围。
- `packages/page-intelligence/src/fragility.test.ts`
  - 为 `select / setChecked / upload / press(target)` 补红绿回归。
- `packages/runtime/src/playwright-runner.ts`
  - 统一步骤失败诊断 envelope，并让非定位类失败也落盘诊断 JSON。
- `packages/runtime/src/types.ts`
  - 若需要导出统一诊断类型，在这里冻结 runtime 侧契约。
- `packages/runtime/src/index.ts`
  - 如导出新类型，则同步导出。
- `packages/runtime/src/playwright-runner.test.ts`
  - 为非定位类 diagnostic JSON 补红绿回归。
- `apps/studio/src/shared/studio-api-types.ts`
  - 将 `StudioStepDiagnostic` 升级为 discriminated union。
- `apps/studio/electron/services.ts`
  - 继续读取 diagnostic JSON，但不再假定总有 `strategyAttempts`。
- `apps/studio/src/shared/failure-insights.ts`
  - 让 `runtime-error` 也有可读的首屏摘要。
- `apps/studio/src/DiagnosticInspector.tsx`
  - 区分目标类和通用类诊断的渲染。
- `apps/studio/src/DiagnosticInspector.test.tsx`
  - 覆盖通用失败诊断渲染。
- `apps/studio/src/shared/failure-insights.test.ts`
  - 覆盖 `runtime-error` 的 insight 分类。

### Task 1: Fragility Multi-Step Coverage

**Files:**
- Modify: `packages/page-intelligence/src/fragility.ts`
- Test: `packages/page-intelligence/src/fragility.test.ts`

- [ ] **Step 1: 写失败测试，证明当前 `select / setChecked / upload / press(target)` 不会产出 `CSS_ONLY / TEXT_ONLY / CSS_NTH_OF_TYPE / NO_STRATEGIES`**

目标测试：

- `select` 仅 CSS 时应报 `CSS_ONLY`
- `setChecked` 含 `nth-of-type` 时应报 `CSS_NTH_OF_TYPE`
- `upload` 仅文本策略时应报 `TEXT_ONLY`
- `press` 带 target 且策略为空时应报 `NO_STRATEGIES`

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test -- fragility.test.ts
```

Expected: 新增用例失败，暴露当前只覆盖 `click / fill`。

- [ ] **Step 3: 最小实现**

实现方向：

- 抽出“带 target 的步骤”统一辅助函数。
- 把 `inspectStep()` 中的 target 风险扫描从 `click / fill` 扩到：
  - `click`
  - `fill`
  - `select`
  - `setChecked`
  - `upload`
  - `press`（仅有 `target` 时）
- 保持 `wait` 与 contextual checks 原逻辑不变。

- [ ] **Step 4: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test -- fragility.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/page-intelligence/src/fragility.ts packages/page-intelligence/src/fragility.test.ts
git commit -m "feat: 扩展 fragility 多步骤覆盖"
```

### Task 2: Runtime Generic Diagnostic Envelope

**Files:**
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `packages/runtime/src/playwright-runner.test.ts`

- [ ] **Step 1: 写失败测试，证明非定位类失败目前不会生成统一 diagnostic JSON**

推荐红灯用例：

- `wait` 步骤 `condition="visible"` 但缺少 `target`
- 期望：
  - `result.status === "failed"`
  - `step-<n>-diagnostic.json` 存在
  - JSON `kind === "runtime-error"`
  - 含 `stepType/message/errorCode`

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected: 新增 diagnostic JSON 断言失败。

- [ ] **Step 3: 实现统一 envelope**

实现方向：

- 在 runtime 侧定义统一步骤诊断类型：
  - `kind = "target-resolution"`
  - `kind = "runtime-error"`
- `buildTargetDiagnosticError()` 继续返回 target-resolution 形状。
- 新增通用失败诊断构建函数，从 catch 分支兜底生成 runtime-error 形状。
- `writeStepDiagnostic()` 改为写 union，而不是写死 `strategyAttempts / targetHints`。

- [ ] **Step 4: 保持既有 target 诊断回归不退化**

补充断言：

- 现有“目标歧义”“定位失败 message 更清晰”测试继续通过。
- target-resolution JSON 仍保留 `strategyAttempts / targetHints`。

- [ ] **Step 5: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add packages/runtime/src/playwright-runner.ts packages/runtime/src/types.ts packages/runtime/src/index.ts packages/runtime/src/playwright-runner.test.ts
git commit -m "feat: 统一 runtime 步骤失败诊断"
```

### Task 3: Studio Unified Failure Insight

**Files:**
- Modify: `apps/studio/src/shared/studio-api-types.ts`
- Modify: `apps/studio/electron/services.ts`
- Modify: `apps/studio/src/shared/failure-insights.ts`
- Modify: `apps/studio/src/DiagnosticInspector.tsx`
- Test: `apps/studio/src/shared/failure-insights.test.ts`
- Test: `apps/studio/src/DiagnosticInspector.test.tsx`

- [ ] **Step 1: 写失败测试，证明 Studio 当前无法优雅消费 `runtime-error` 诊断**

推荐红灯用例：

- `buildFailureInsight()` 接到 `kind = "runtime-error"` 诊断时，应输出：
  - `category = "execution-error"`
  - 可读标题
  - 推荐先核对 message / errorCode / page snapshot
- `DiagnosticInspector` 接到 `runtime-error` 诊断时，应显示：
  - 步骤类型
  - 错误码
  - 诊断消息
  - URL / 标题（如有）

- [ ] **Step 2: 运行红灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- src/shared/failure-insights.test.ts DiagnosticInspector.test.tsx
```

Expected: 新增用例失败。

- [ ] **Step 3: 最小实现**

实现方向：

- `StudioStepDiagnostic` 升级为 discriminated union。
- `readStepArtifacts()` 读取 JSON 后直接保留 `kind` 字段，不默认读取 `strategyAttempts.length`。
- `buildFailureInsight()`：
  - `target-resolution` 保持现有逻辑
  - `runtime-error` 走通用执行失败摘要
- `DiagnosticInspector`：
  - 仅在 `target-resolution` 下展示策略表格和 Target hints
  - `runtime-error` 下展示通用诊断元信息

- [ ] **Step 4: 运行绿灯**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- src/shared/failure-insights.test.ts DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/studio/src/shared/studio-api-types.ts apps/studio/electron/services.ts apps/studio/src/shared/failure-insights.ts apps/studio/src/DiagnosticInspector.tsx apps/studio/src/shared/failure-insights.test.ts apps/studio/src/DiagnosticInspector.test.tsx
git commit -m "feat: 统一 studio 步骤失败诊断消费"
```

### Task 4: 主代理集成与统一验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 合并通过轨道，处理协议对齐**

顺序：

1. `Fragility Multi-Step Coverage`
2. `Runtime Generic Diagnostic Envelope`
3. `Studio Unified Failure Insight`

- [ ] **Step 2: 运行 Node 20 分层验收**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test -- fragility.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- src/shared/failure-insights.test.ts DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

Expected: 全通过

- [ ] **Step 3: 补留痕**

需要写明：

- fragility 新覆盖的步骤类型
- runtime 通用 diagnostic JSON 新结构
- Studio 如何消费 `runtime-error`
- 统一 Node 20 验收结果

- [ ] **Step 4: 视情况补仓库级冒烟**

如改动影响面扩大，再补：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

- [ ] **Step 5: 合并 / 推送 / 回收**

```bash
git push origin codex/real-page-stability-program
```

删除：

- 对应 worktree
- 对应 `codex/real-page-wave6-*` 分支
- 已完成子代理

## 自检

- 规格覆盖：
  - 执行前预警：Task 1
  - 执行后通用诊断：Task 2
  - Studio 统一消费：Task 3
  - Node 20 验收与留痕：Task 4
- 无占位符：
  - 已列出明确文件、命令、目标测试与合并顺序。
- 类型一致性：
  - 统一围绕 `kind = "target-resolution" | "runtime-error"` 展开，避免 runtime / studio 各自命名。
