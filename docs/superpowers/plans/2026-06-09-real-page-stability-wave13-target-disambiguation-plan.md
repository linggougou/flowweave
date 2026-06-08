# 真实页面稳定性 Wave 13：Target Disambiguation 与 Studio 基线收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先把当前已验证的 Studio 桌面壳恢复与布局修复收成干净协调基线，再并行补齐真实页面“重复元素 / 相似文案 / 列表行操作”下的歧义目标消解能力，让 FlowWeave 从“能跑”提升到“更可能命中对的元素”。

**Architecture:** 本轮采用“Baseline 先行 + 4 条主轨并行 + 主代理统一回收”的结构。主工作区先吸收当前 Studio shell 与布局修复，确保后续 worktree 基于稳定桌面基线派生；随后分为 `Recorder Scope Hints`、`Runtime Disambiguation`、`Studio Ambiguity Insight`、`Benchmarks Repeated Targets` 四条低耦合轨道并行推进，最后由主代理统一执行 Node 20 验收、回收分支和补齐 `.codex`。

**Tech Stack:** TypeScript strict、Vitest、Playwright、pnpm workspace、Turborepo、Electron、Vite、Node 20

---

## 轨道总览

| 轨道 | 分支 | Worktree | 主要写入 |
|------|------|----------|----------|
| Baseline Absorption | `codex/real-page-stability-program` | 主工作区 | `apps/studio/package.json`、`apps/studio/scripts/ensure-electron-dist.mjs`、`apps/studio/src/App.tsx`、`apps/studio/src/styles.css`、`.codex/*` |
| Recorder Scope Hints | `codex/real-page-wave13-recorder-scope-hints` | `.worktrees/codex-real-page-wave13-recorder-scope-hints` | `packages/shared`、`packages/flow-dsl`、`apps/extension`、`packages/recorder` |
| Runtime Disambiguation | `codex/real-page-wave13-runtime-disambiguation` | `.worktrees/codex-real-page-wave13-runtime-disambiguation` | `packages/runtime` |
| Studio Ambiguity Insight | `codex/real-page-wave13-studio-ambiguity-insight` | `.worktrees/codex-real-page-wave13-studio-ambiguity-insight` | `apps/studio/src/*` |
| Benchmarks Repeated Targets | `codex/real-page-wave13-benchmarks-repeated-targets` | `.worktrees/codex-real-page-wave13-benchmarks-repeated-targets` | `examples/*`、矩阵测试、`docs/guides/fixture-matrix.md` |

## 全局门槛

- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages`
- [ ] `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`
- [ ] `CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`

### Task 1: Baseline Absorption

**Files:**
- Modify: `apps/studio/package.json`
- Create: `apps/studio/scripts/ensure-electron-dist.mjs`
- Modify: `apps/studio/src/App.tsx`
- Modify: `apps/studio/src/styles.css`
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`
- Create: `.codex/context-summary-studio-layout-regression.md`
- Create: `.codex/context-summary-studio-signing-recovery.md`

- [ ] **Step 1: 核对当前主工作区只保留本轮已验证的 Studio 基线改动**
  - 关注点：
    - Electron dist 自动修复脚本
    - `app-studio` 直接依赖声明
    - 侧栏滚动与右侧面板堆叠修复
    - `.codex` 中对签名恢复和布局回归的证据

- [ ] **Step 2: 固化 Electron bundle 恢复基线**
  - 要求：
    - `apps/studio/scripts/ensure-electron-dist.mjs` 仅在 macOS 执行
    - 缺失 framework symlink 时，通过 Electron 官方缓存 zip + `ditto` 重新恢复 `dist`
    - `apps/studio/package.json` 的 `postinstall`、`build`、`dev` 均会先执行该恢复逻辑

- [ ] **Step 3: 固化 Studio 布局修复基线**
  - 要求：
    - 左侧“项目”区块位于 `.sidebar-scroll` 内
    - `.main > *` 与 `.flow-content-panel` 不再允许纵向压缩导致卡片重叠
    - 标题 / meta 段落默认 `margin` 已收紧，不再出现“变量注入 / 运行前检查”文字叠层

- [ ] **Step 4: 用 Node 20 跑 Studio 基线验收**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build
```

Expected:

- typecheck 通过
- `65/65` 测试通过
- 生产构建通过

- [ ] **Step 5: 记录页面级与桌面壳证据并提交基线**

```bash
git add apps/studio/package.json apps/studio/scripts/ensure-electron-dist.mjs apps/studio/src/App.tsx apps/studio/src/styles.css .codex/context-summary-studio-layout-regression.md .codex/context-summary-studio-signing-recovery.md .codex/operations-log.md .codex/verification-report.md
git commit -m "fix: 收紧 studio 桌面基线与布局回归"
```

### Task 2: Recorder Scope Hints

**Files:**
- Modify: `packages/shared/src/*`
- Modify: `packages/flow-dsl/src/schema.ts`
- Modify: `apps/extension/entrypoints/content.ts`
- Modify: `packages/recorder/src/target-from-dom.ts`
- Modify: `packages/recorder/src/normalize.ts`
- Modify: `packages/recorder/src/*.test.ts`

- [ ] **Step 1: 先写红灯测试，锁定作用域线索仍未保真到 Flow**
  - 覆盖至少这些场景：
    - 重复按钮所在行能提取短 `scopeText`
    - `scopeKind` 会根据 `row / listitem / dialog / tabpanel / section / card` 正确分类
    - `normalize` 与 `buildFlowFromEvents()` 不会把新增 hint 静默丢弃

- [ ] **Step 2: 冻结最小作用域 hint 协议**
  - 建议字段：
    - `scopeText?: string`
    - `scopeKind?: "row" | "listitem" | "dialog" | "tabpanel" | "section" | "card"`
  - 要求：
    - 继续与现有 `nameAttr / placeholder / labelText / textSample` 并存
    - 不引入第二套嵌套上下文对象

- [ ] **Step 3: 在扩展侧与 recorder 侧打通采集和保真**
  - 要求：
    - 优先从 `tr`、`[role=row]`、`li`、`[role=listitem]`、`[role=dialog]`、`[role=tabpanel]`、`section/article` 采集最短有效上下文
    - 避免把与元素本体重复的长文本整段写进 Flow
    - 对列表操作按钮、upload、contenteditable 场景都能采集

- [ ] **Step 4: 用 Node 20 跑 Recorder 局部验证**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- target-from-dom.test.ts normalize.test.ts step-filter.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl typecheck
```

Expected:

- Recorder 相关测试通过
- DSL 类型检查通过

- [ ] **Step 5: 提交轨道分支**

```bash
git add packages/shared packages/flow-dsl apps/extension packages/recorder
git commit -m "feat: 为真实页面补作用域线索"
```

### Task 3: Runtime Disambiguation

**Files:**
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Optional Modify: `packages/runtime/src/recorded-replay-matrix.test.ts`

- [ ] **Step 1: 先写红灯测试，锁定“多命中时默认 first()”的误命中合同**
  - 覆盖至少这些场景：
    - 多个同文案按钮存在时，能根据 `scopeText / scopeKind` 命中目标行
    - 候选分数并列或信息不足时，明确抛出歧义失败，而不是静默点击第一个
    - 单命中快路径保持不退化

- [ ] **Step 2: 在 runtime 中实现候选打分与歧义失败**
  - 要求：
    - `matchedCount === 1` 继续走快路径
    - `matchedCount > 1` 时先过滤不可见候选，再结合 `nameAttr / placeholder / labelText / textSample / scopeText / scopeKind` 打分
    - 唯一最高分才放行，否则产出结构化歧义诊断

- [ ] **Step 3: 扩展诊断产物**
  - 要求：
    - 记录候选数量
    - 记录前几名候选摘要
    - 记录哪些 hints 没能帮助收窄
    - 保持现有 `strategyAttempts`、`diagnosticPath` 结构兼容

- [ ] **Step 4: 用 Node 20 跑 Runtime 局部验证**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts
```

Expected:

- runtime 相关测试通过
- 新增歧义命中 / 歧义失败回归通过

- [ ] **Step 5: 提交轨道分支**

```bash
git add packages/runtime
git commit -m "feat: 为重复目标增加 runtime 歧义消解"
```

### Task 4: Studio Ambiguity Insight

**Files:**
- Modify: `apps/studio/src/DiagnosticInspector.tsx`
- Modify: `apps/studio/src/shared/studio-api-types.ts`
- Modify: `apps/studio/src/shared/failure-insights.ts`
- Modify: `apps/studio/src/shared/repair-suggestions.ts`
- Modify: `apps/studio/src/*.test.tsx`

- [ ] **Step 1: 先写红灯测试，锁定 Studio 仍把歧义目标问题当成泛化失败**
  - 覆盖至少这些场景：
    - 歧义失败会显示独立类别与标题
    - 候选数量、scope 提示和修复动作在 Inspector 中可见
    - 现有 runtime cause / action-state-reset 解释不被破坏

- [ ] **Step 2: 为 Studio 增加歧义诊断消费**
  - 要求：
    - 新增“歧义定位 / 多命中未能唯一确认”类别
    - 展示候选数、主要候选摘要、scope 缺口
    - 修复建议明确指向“重新录制到包含行标题的目标”“补 testId / aria-label / 更强上下文”

- [ ] **Step 3: 保持运行与历史执行兼容**
  - 要求：
    - 历史记录里不存在新字段时，Studio 不崩溃
    - 新类型优先走增强解释，旧类型行为保持不变

- [ ] **Step 4: 用 Node 20 跑 Studio 局部验证**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/failure-insights.test.ts src/shared/repair-suggestions.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

Expected:

- Studio 相关测试通过
- typecheck 通过

- [ ] **Step 5: 提交轨道分支**

```bash
git add apps/studio/src
git commit -m "feat: 增强 studio 歧义定位排障提示"
```

### Task 5: Benchmarks Repeated Targets

**Files:**
- Modify: `examples/fixtures/repeated-row-actions.html`
- Optional Create: `examples/fixtures/duplicate-save-surfaces.html`
- Modify: `examples/recorded-replay-smoke.ts`
- Modify: `examples/real-page-smoke.ts`
- Modify: `packages/runtime/src/real-page-matrix.test.ts`
- Modify: `packages/runtime/src/recorded-replay-matrix.test.ts`
- Modify: `docs/guides/fixture-matrix.md`

- [ ] **Step 1: 先写红灯矩阵回归，锁定重复目标场景尚未证明 recorded replay 稳定**
  - 覆盖至少两类场景：
    - 列表 / 表格行里多个同文案“编辑”按钮
    - 如果节奏允许，再补主区与弹层同时存在“保存”按钮的重复 CTA 场景

- [ ] **Step 2: 补充真实页面 fixture 与 recorded replay case**
  - 要求：
    - 目标行被命中后，结果区必须写出独有摘要，防止“点错但看不出来”
    - recorded replay 与 hand-written matrix 至少各有一条回归入口

- [ ] **Step 3: 同步矩阵文档和统计口径**
  - 要求：
    - `fixture-matrix.md`
    - `real-page-smoke.ts`
    - `recorded-replay-smoke.ts`
    - `real-page-matrix.test.ts`
    之间的场景数和命名保持一致

- [ ] **Step 4: 用 Node 20 跑 Benchmarks 局部验证**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected:

- recorded replay 基线通过
- 真实页面矩阵通过
- 场景统计与文档口径一致

- [ ] **Step 5: 提交轨道分支**

```bash
git add examples packages/runtime/src docs/guides/fixture-matrix.md
git commit -m "test: 扩展重复目标真实页面回归"
```

### Task 6: 主线集成与统一验收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`

- [ ] **Step 1: 依次并回 4 条主轨**
  - 顺序：
    1. Baseline Absorption
    2. Recorder Scope Hints
    3. Runtime Disambiguation
    4. Studio Ambiguity Insight
    5. Benchmarks Repeated Targets

- [ ] **Step 2: 在主线用 Node 20 跑统一验收**

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
```

Expected:

- Studio、Recorder、Runtime、recorded replay、real-pages 与 smoke 全部通过

- [ ] **Step 3: 更新 `.codex` 留痕与验收结论**
  - 记录：
    - 每条轨道的根因、变更范围、Node 20 验收命令、是否已回收
    - 若仍有残余风险，明确标注为后续独立问题，不包装成“全部完成”

