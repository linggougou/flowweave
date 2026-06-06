## 项目上下文摘要（真实页面稳定性下一轮自主并行规划）

生成时间：2026-06-06 23:48:00 CST

### 1. 相似实现与现状证据

- **实现 1**: `docs/superpowers/plans/2026-06-06-real-page-stability-orchestration.md`
  - 模式：先冻结接口，再按 Recorder / Runtime / Environment / Diagnostics / Benchmarks 多轨 worktree 并行推进。
  - 可复用：轨道表、验收门槛、回收规则。
  - 需注意：上一轮编排板已经完成，需要在此基础上开新一轮，而不是覆盖历史记录。

- **实现 2**: `packages/recorder/src/normalize.ts`、`packages/runtime/src/playwright-runner.ts`
  - 模式：Recorder 负责把 `RecordedEvent` 收敛成 Flow，runtime 负责变量插值与步骤执行。
  - 可复用：`buildFlowFromEvents()`、`executeFlow()`、现有 `upload` / `press` / `wait` 回归。
  - 需注意：runtime、recorder、fragility 对变量占位符的字符集契约仍不完全一致。

- **实现 3**: `apps/studio/src/App.tsx`、`apps/studio/src/DiagnosticInspector.tsx`、`packages/project-knowledge/src/repository.ts`
  - 模式：Studio 运行表单直接消费 `flow.variables` 与环境字段，知识库已能持久化 `runContext` 与执行快照。
  - 可复用：现有环境选择、变量输入、执行历史恢复与诊断展示链路。
  - 需注意：运行前预填、最近一次输入复用、明确的“开跑前缺什么”提示仍然不足。

- **实现 4**: `docs/guides/fixture-matrix.md`、`examples/real-page-smoke.ts`
  - 模式：真实页面矩阵通过本地 fixture 持续扩容，当前已覆盖 11 个场景。
  - 可复用：`buildMatrixCases()`、`pnpm e2e:real-pages`、`pnpm smoke:full`。
  - 需注意：Tab、contenteditable、空结果重试等真实后台场景仍未覆盖。

- **实现 5**: `.github/workflows/ci.yml`
  - 模式：当前 CI 已是 Node 20 / 24 双矩阵，统一复用 `pnpm lint` + `pnpm smoke`。
  - 可复用：现有 matrix、Playwright 安装链路、`codex/**` 分支触发。
  - 需注意：远端 Actions 页面仍提示 `actions/checkout@v4`、`actions/setup-node@v4`、`pnpm/action-setup@v4` 的 Node.js 20 runtime 弃用警告。

### 2. 当前最值得推进的 5 个低耦合方向

- **Recorder Placeholder Contract**：
  - 收敛扩展侧 upload 占位符命名、录制 payload 到 Flow 的占位符保真规则。
  - 补 `fileNames` 丢失、upload token 碰撞、字面量 `{{...}}` 边界回归。

- **Runtime Replay Contract**：
  - 让 runtime 对占位符插值、未解析占位符保留、回放错误提示使用统一规则。
  - 建立“RecordedEvent -> Flow -> executeFlow”的多场景整链回归，而不只覆盖 upload。

- **Studio Experience**：
  - 修复 Studio 表单配置“看起来可填、实际只吃到 `showBrowser`”的执行断链。
  - 在运行前明确指出缺少环境、缺少变量、缺少登录态文件等阻塞项，并在运行后展示本次 `runContext` 与诊断摘要。

- **Benchmarks P5**：
  - 补 Tab、contenteditable、空结果重试、联动筛选等更贴近实际后台的 fixture。
  - 给矩阵增加更明确的耗时/成功统计输出。

- **CI Runtime Refresh**：
  - 去掉远端 GitHub Actions 的 deprecated runtime 警告。
  - 保持 Node 20 / 24 双基线与当前 smoke 链路不回退。

### 3. 项目约定

- 统一基线：`Node v20.19.6`
- 统一主门槛：`pnpm lint`、`pnpm smoke`
- Benchmarks 相关还需补：`pnpm e2e:real-pages` 或 `pnpm smoke:full`
- worktree 根目录继续使用：`.worktrees/`
- 分支前缀继续使用：`codex/`

### 4. 建议的独占写入边界

- **Foundation（主代理先行，不并行）**：
  - `packages/shared/src/index.ts`
  - `packages/shared/src/template-variables.ts`（新增）
  - `packages/page-intelligence/src/fragility.ts`
  - `packages/page-intelligence/src/fragility.test.ts`

- **Recorder Placeholder Contract 轨道**：
  - `apps/extension/entrypoints/content.ts`
  - `packages/shared/src/recording-protocol.ts`
  - `packages/recorder/src/normalize.ts`
  - `packages/recorder/src/normalize.test.ts`

- **Runtime Replay Contract 轨道**：
  - `packages/runtime/src/playwright-runner.ts`
  - `packages/runtime/src/types.ts`
  - `packages/runtime/src/playwright-runner.test.ts`

- **Studio Experience 轨道**：
  - `apps/studio/**`
  - `packages/project-knowledge/**`
  - 需要扩展修复建议时，可顺延至 `packages/page-intelligence/src/fragility.ts`，但优先由 Foundation 先统一协议，避免抢写。

- **Benchmarks P5 轨道**：
  - `examples/**`
  - `docs/guides/fixture-matrix.md`
  - `packages/runtime/src/real-page-matrix.test.ts`（新增专用测试文件）

- **CI Runtime Refresh 轨道**：
  - `.github/workflows/**`
  - `README.md`
  - `docs/guides/quickstart.md`

### 5. 风险点

- `apps/studio/electron/main.ts` 当前仍只透传 `showBrowser`，说明 Studio 体验轨道必须优先先修执行断链，再谈面板增强。
- `packages/runtime/src/playwright-runner.test.ts` 已很大，Benchmarks 新增矩阵测试应尽量落到新测试文件，避免与 Runtime Replay Contract 轨道抢写。
- 录制侧与 runtime 侧都需要消费同一占位符规则，因此必须先完成 Foundation，避免两条轨道分别复制正则。
- GitHub Actions 版本选择属于时效性信息，真正实施 CI 轨道时必须以官方最新 release / 文档为准。
