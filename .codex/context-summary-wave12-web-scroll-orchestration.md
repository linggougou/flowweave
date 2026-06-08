## 项目上下文摘要（wave12-web-scroll-orchestration）

生成时间：2026-06-08 23:42:00 CST

### 1. 相似实现分析

- **实现 1**: [docs/superpowers/plans/2026-06-06-real-page-stability-autonomous-wave-plan.md](/Users/ling/codeHome/A_Mine/flowweave/docs/superpowers/plans/2026-06-06-real-page-stability-autonomous-wave-plan.md:1)
  - 模式：先做 Foundation，再按互斥写入范围拆 worktree 轨道。
  - 可复用：本轮继续使用“主代理先串行收口共享基线，再并行派发子轨道”的节奏。
  - 需注意：共享协议或共享基线未先并回时，后续轨道容易重复造轮子。

- **实现 2**: [docs/superpowers/plans/2026-06-07-real-page-stability-wave11-execution-resilience-plan.md](/Users/ling/codeHome/A_Mine/flowweave/docs/superpowers/plans/2026-06-07-real-page-stability-wave11-execution-resilience-plan.md:1)
  - 模式：把一轮自主开发拆成“轨道总览 + 全局门槛 + 任务 + 集成验收”。
  - 可复用：本轮计划继续沿用 `Node 20` 命令门槛和 worktree 命名规则。
  - 需注意：依赖链明显的轨道应分阶段启动，避免并行改同一核心文件。

- **实现 3**: [apps/web/server/index.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/web/server/index.ts:38)
  - 模式：Web API 当前把路由处理集中在 `handleApi()`，并在模块顶层直接 `createServer().listen()`。
  - 可复用：真实 HTTP 测试最适合围绕 `handleApi()` 或抽出的 server factory 建立，而不是继续只测仓储。
  - 需注意：现状不利于路由级测试，恢复路由存在 `segments.length` 与路径不一致的问题。

- **实现 4**: [packages/recorder/src/normalize.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/recorder/src/normalize.ts:279)
  - 模式：`RecordedEvent -> NormalizedStep` 已覆盖 `navigate / click / fill / select / keypress`，再经 `buildFlowFromEvents()` 生成 Flow。
  - 可复用：scroll 闭环应沿用现有“共享协议 -> normalize -> DSL -> runtime”的单链路设计，不额外引入平行模型。
  - 需注意：当前 `scroll` 只在协议层声明，`normalizeRecordedEvent()` 默认直接丢弃。

- **实现 5**: [packages/page-intelligence/src/fragility.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/page-intelligence/src/fragility.ts:139)
  - 模式：fragility 通过启发式规则给出 `CSS_ONLY`、`TEXT_ONLY` 等诊断，是当前真实页面稳定性主线的前置守门。
  - 可复用：当前工作树里已经有“稳定 CSS 锚点不误报”的增强，可作为本轮 Foundation 一部分先吸收。
  - 需注意：这类共享基线应先并回，否则 scroll / Web 轨道后续统一验收会混入无关噪声。

### 2. 项目约定

- 本地主验收口径仍以 `Node 20.19.6` 为准，`Node 24` 只做兼容性回归。
- 计划文档与编排板均落在 `docs/superpowers/plans/`。
- 开发留痕写入项目内 `.codex/`，本轮需新增上下文摘要并实时追加 `operations-log.md`。
- 并行开发目录优先使用已存在且已被 `.gitignore` 忽略的 `.worktrees/`。
- 现有产品主线仍是“录制 -> 入库 -> 回放 -> 可查”，不碰冻结的 AI 深度能力。

### 3. 可复用组件清单

- [scripts/doctor.mjs](/Users/ling/codeHome/A_Mine/flowweave/scripts/doctor.mjs:1)：本地环境与 smoke 前置检查入口。
- [packages/shared/src/recording-protocol.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/shared/src/recording-protocol.ts:1)：`RecordedEvent` 协议事实来源。
- [packages/recorder/src/normalize.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/recorder/src/normalize.ts:20)：录制事件归一化与 Flow 构建主链。
- [packages/flow-dsl/src/schema.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/flow-dsl/src/schema.ts:35)：DSL 步骤 schema 与类型事实来源。
- [packages/runtime/src/playwright-runner.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/runtime/src/playwright-runner.ts:1460)：步骤执行与真实页面矩阵核心。
- [apps/web/server/index.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/web/server/index.ts:38)：HTTP 路由主入口。
- [packages/project-knowledge/src/repository.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/src/repository.ts:199)：Flow 版本与恢复仓储。

### 4. 测试策略

- `app-web` 当前只跑 `vitest`，但测试偏仓储，需要补真实 HTTP 路由覆盖。
- `recorder` 已有 `normalizeRecordedEvent()` 与 `buildFlowFromEvents()` 的单元测试，适合直接扩 scroll 闭环用例。
- `runtime` 已具备 `playwright-runner.test.ts`、`recorded-replay-matrix.test.ts`、`real-page-matrix.test.ts`，适合承接 scroll 执行验证。
- `page-intelligence` 现有 `fragility.test.ts` 已覆盖当前 WIP 改动，可作为 Foundation 验收的一部分。
- 全局门槛仍采用：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:prepare`
  - `CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`

### 5. 依赖和集成点

- Web 轨道依赖：`app-web server -> project-knowledge repository -> flow versions`。
- Scroll 轨道依赖：
  - 捕获链：`apps/extension -> packages/shared -> packages/recorder -> packages/flow-dsl`
  - 执行链：`packages/flow-dsl -> packages/runtime -> examples/runtime tests`
- Foundation 轨道依赖：
  - `page-intelligence` fragility 规则
  - `runtime` TS 兼容修正
  - `doctor` / `smoke` / 包清单一致性

### 6. 技术选型理由

- Web 路由问题优先通过真实 HTTP 测试补洞，而不是继续加强仓储测试，因为问题出在路由分发层。
- Scroll 不新增第二套事件模型，继续复用 `RecordedEvent -> NormalizedStep -> executeFlow()` 单链路，维护面最小。
- Foundation 先吸收当前工作树已验证改动，可以减少后续并行轨道的回归噪声，并为 worktree 提供更干净的基线。

### 7. 关键风险点

- `packages/runtime/src/playwright-runner.ts` 是高冲突文件，因此 runtime 只允许一条 scroll 执行轨道独占修改。
- `packages/shared/src/recording-protocol.ts` 会被 scroll 捕获轨道修改，其他轨道禁止顺手改共享协议。
- `apps/web/server/index.ts` 顶层直接监听端口，若不先抽测试入口，HTTP 测试可能互相抢占端口。
- 当前工作区是脏的，必须先把 Foundation 收口，否则新 worktree 会从未清理状态继续分叉。
