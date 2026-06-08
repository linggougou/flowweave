# Wave 13 规划上下文摘要：Target Disambiguation 与 Studio 成品基线

## 任务目标

- 在 `codex/real-page-stability-program` 协调分支上，为下一轮自主并行开发制定完整计划。
- 在进入新一轮 worktree / subagent 并行前，先把当前已验证的 Studio 桌面壳恢复与布局修复整理成可派生基线。
- 以“真实页面能命中对的那个元素”为下一轮主攻方向，设计可并行落地的 Recorder / Runtime / Studio / Benchmarks 轨道。

## 当前路线与边界

- 项目根未提供物理 `PROJECT_ROUTE_LOCK.md`，当前仍按项目 `AGENTS.md` 指向的
  `docs/superpowers/plans/2026-05-26-run-first-roadmap.md` 作为等效路线真源。
- 当前主线仍是“真实页面稳定录制与执行增强”，不是 AI 阶段，不进入 `P3` 深度能力扩张，也不碰 `P4 ai-orchestrator` 冻结区。
- 允许推进范围：
  - Recorder / runtime / Studio / examples 在真实页面稳定性上的增量增强
  - Electron 本地桌面壳可运行性与 Studio 展示层回归修复
  - 与上述主线直接相关的文档、回归夹具、Node 20 验收与 `.codex` 留痕
- 禁止偏移范围：
  - AI 编排、云端协作、多用户体系
  - 大规模重构技术栈
  - 脱离真实页面稳定性主线的横向功能扩张

## 当前已确认事实

1. 当前工作区没有活跃 `.worktrees/*`，需要重新建立并行轨道。
2. 当前分支仍为 `codex/real-page-stability-program`，领先远端 `37` 个提交。
3. 当前工作区存在未收口但已验证的 Studio 改动：
   - `apps/studio/package.json`
   - `apps/studio/scripts/ensure-electron-dist.mjs`
   - `apps/studio/src/App.tsx`
   - `apps/studio/src/styles.css`
   - 以及相应 `.codex` 留痕与截图证据
4. 上述 Studio 改动已完成 Node 20 验证：
   - `pnpm --filter @flowweave/app-studio typecheck`
   - `pnpm --filter @flowweave/app-studio test`
   - `pnpm --filter @flowweave/app-studio build`
   - 页面级 DOM 量测确认左侧可滚动、右侧无面板重叠
   - Electron 当前机器上能起窗，但 `codesign --verify` 仍有独立残余风险
5. Wave 12 已完成并回主线：
   - `scroll` 录制 / DSL / runtime 闭环已通
   - `pnpm e2e:recorded-pages`
   - `pnpm smoke`
   - `pnpm e2e:real-pages`
   均已在 Node 20 基线下通过
6. 在“真实页面仍然不够稳”的剩余高价值缺口里，最贴近用户真实体验的，不再是步骤类型缺失，而是：
   - 同文案按钮、相似输入区、列表行操作列等重复元素场景下，runtime 往往只是 `locator.first()`，容易命中错误对象
   - Recorder 已能产出不少 `target hints`，但 runtime 成功路径消费不足
   - Studio 还缺少对“歧义命中 / 命中错误对象”这类问题的专门解释

## 推荐下一轮方向

### 第一优先：协调分支基线收口

- 先把当前 Studio 桌面壳恢复与布局修复收成干净可派生的协调头。
- 原因：
  - 后续若再开 Studio 相关轨道，必须基于已修复布局与 Electron dist 恢复脚本，否则并行分支会继承错误基线。

### 第二优先：Wave 13 Target Disambiguation

- 目标：从“能录能跑”推进到“更可能跑到对的元素”。
- 建议轨道：
  1. `Recorder Scope Hints`
  2. `Runtime Disambiguation`
  3. `Studio Ambiguity Insight`
  4. `Benchmarks Repeated Targets`

## 轨道拆分理由

1. `Recorder` 写入集中在 `apps/extension`、`packages/recorder`、`packages/flow-dsl`、`packages/shared`。
2. `Runtime` 主要写 `packages/runtime`，与 Recorder / Studio 可基本隔离。
3. `Studio` 主要写 `apps/studio/src/*`，与当前 Electron 壳恢复脚本基线需要顺序依赖，但与 Runtime 算法本身可并行。
4. `Benchmarks` 主要写 `examples/*`、矩阵 smoke、文档，适合作为后置并行轨道。

## 建议统一验收门槛

- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`
- `CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`
