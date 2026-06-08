## 项目上下文摘要（wave12-scroll-runtime-contract）

生成时间：2026-06-09 00:55:00 CST

### 1. 相似实现分析

- **实现 1**: [packages/runtime/src/playwright-runner.ts](/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-wave12-scroll-runtime-contract/packages/runtime/src/playwright-runner.ts:1634)
  - 模式：`runStep()` 以 `switch` 分发步骤类型，复杂交互统一复用 `performRecoveredLocatorAction()` 做恢复与重试。
  - 可复用：`waitForBrowserFrame()`、`waitForPageSettled()`、`performRecoveredLocatorAction()` 已经是 runtime 动作的标准挂载点。
  - 需注意：新增 `scroll` 时不能绕开恢复框架，否则容器级滚动无法享受既有的定位修复能力。

- **实现 2**: [packages/runtime/src/playwright-runner.test.ts](/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-wave12-scroll-runtime-contract/packages/runtime/src/playwright-runner.test.ts:1998)
  - 模式：runtime 单测使用临时 HTML fixture，直接验证步骤执行后续链路是否还能继续定位。
  - 可复用：页面级与容器级 fixture 都可以用“滚动状态元素 + 后续点击”来锁定 scroll 合同。
  - 需注意：单测通过只能说明执行器局部逻辑可用，不能替代 recorded replay 的矩阵回归。

- **实现 3**: [examples/recorded-replay-smoke.ts](/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-wave12-scroll-runtime-contract/examples/recorded-replay-smoke.ts:1740)
  - 模式：recorded replay 基线矩阵把真实 fixture case 与 runtime-only case 编排在同一目录和汇总结构下。
  - 可复用：`placeholder-disambiguation` 已经证明 runtime-only case 的接入方式，`scroll-runtime-contract` 应沿用同样目录、命名和汇总协议。
  - 需注意：这里的 HTML fixture 与目标坐标必须和浏览器实际可滚动高度一致，否则会出现“执行器没问题，但合同 fixture 自己不成立”的假失败。

- **实现 4**: [packages/runtime/src/recorded-replay-matrix.test.ts](/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-wave12-scroll-runtime-contract/packages/runtime/src/recorded-replay-matrix.test.ts:18)
  - 模式：矩阵测试锁定 case 数量、runtime-only 名单和最终成功数，避免新增回归入口后被漏跑。
  - 可复用：本轮需要同步维护 `caseCatalog` 长度与 `runtime-generated` 清单。
  - 需注意：如果 case 被加入目录但运行失败，矩阵测试会直接暴露总数与 successCount 偏差。

### 2. 项目约定

- Node 主验收基线仍是 `v20.19.6`。
- runtime 真实回放入口是根脚本 `pnpm e2e:recorded-pages`，不能只跑包级单测就宣称通过。
- 运行器核心改动集中在 `packages/runtime/src/playwright-runner.ts`，examples 仅承载合同 fixture 与矩阵入口。
- 文档与操作留痕统一写回项目根 `.codex/`。

### 3. 可复用组件清单

- [packages/runtime/src/playwright-runner.ts](/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-wave12-scroll-runtime-contract/packages/runtime/src/playwright-runner.ts:1366)
  - `performRecoveredLocatorAction()`
- [packages/runtime/src/playwright-runner.ts](/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-wave12-scroll-runtime-contract/packages/runtime/src/playwright-runner.ts:928)
  - `waitForBrowserFrame()`
- [examples/recorded-replay-smoke.ts](/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-wave12-scroll-runtime-contract/examples/recorded-replay-smoke.ts:1915)
  - `runRecordedReplayMatrix()`
- [packages/runtime/src/recorded-replay-matrix.test.ts](/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-wave12-scroll-runtime-contract/packages/runtime/src/recorded-replay-matrix.test.ts:18)
  - recorded replay 基线汇总断言

### 4. 测试策略

- 先跑 `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages` 复现 `scroll-runtime-contract` 失败现场。
- 修复后至少执行：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages`
- 并回主线后再执行：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
  - `CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`

### 5. 依赖和集成点

- `apps/extension` 与 `packages/recorder` 已经把 `scroll` 录制成 DSL 步骤；本轮只收 runtime 执行闭环。
- `examples/recorded-replay-smoke.ts` 通过 `buildFlowFromEvents()` 把录制事件编成 Flow，再调用 `executeFlow()`。
- `packages/runtime/src/recorded-replay-matrix.test.ts` 是 runtime-only case 是否真正纳入基线的守门测试。

### 6. 技术选型理由

- 优先怀疑 fixture 合同与目标坐标，而不是放宽 runtime 校验，是因为 runtime 单测与实现结构已经明确把校验限制在 scroll 结果是否真正达标。
- 页面级 scroll 使用 `window.scrollTo()` + 帧级稳定等待，容器级 scroll 继续复用 `performRecoveredLocatorAction()`，这样最符合当前 runtime 的动作模型。

### 7. 关键风险点

- 如果 fixture 页面的可滚动高度不足，`window.scrollTo(0, 480)` 会被浏览器自动夹到更小值，导致误判为 runtime 回归。
- `position: fixed` 的状态元素本身不会影响滚动，但页面内容高度、默认视口高度和 `body`/`html` 样式会直接影响最大可滚动距离。
- `packages/runtime/src/playwright-runner.ts` 是共享热点文件，必须在本条 worktree 内收口并一次性通过 Node 20 验收后再并回主线。
