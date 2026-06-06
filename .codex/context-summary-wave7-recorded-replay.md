## 项目上下文摘要（Wave 7 Recorded Replay Coverage Expansion）

生成时间：2026-06-07 02:40:27 CST

### 1. 相似实现分析

- **实现 1**: `packages/runtime/src/playwright-runner.test.ts:511`
  - 模式：在 runtime 测试里直接构造 recorded events，经 `parseRecordedEvent()` 和 `buildFlowFromEvents()` 生成 Flow，再调用 `executeFlow()` 做整链回放。
  - 可复用：`buildRecordedFlowMeta()`、`fixturesBaseUrl`、变量注入写法。
  - 需注意：回放断言同时覆盖 `flow.variables` 和 `result.steps.map(step => step.type)`，避免只验证执行成功。
- **实现 2**: `packages/runtime/src/playwright-runner.test.ts:838`
  - 模式：针对需要 `storageStatePath` 的真实页面，先用 `startStaticServer()` 提供固定 origin，再写入 storage state 文件并执行 recorded replay。
  - 可复用：`startStaticServer()`、`cleanupServers`/`cleanupPaths`、`storageStatePath` 生成模式。
  - 需注意：`storageStatePath` 必须与 `baseUrl` 的 origin 一致，否则页面初始化不会消费登录态。
- **实现 3**: `packages/runtime/src/playwright-runner.test.ts:1238`
  - 模式：手写 Flow 验证作用域提示 `scopeText / scopeKind` 能在重复按钮场景命中正确行。
  - 可复用：`buildRepeatedRowActionsHtml()` 的断言目标、`target.hints.scopeText/scopeKind` 的写法。
  - 需注意：如果 recorded event 带了唯一 selector，就无法证明 scope hints 真正参与定位，因此需要保留多命中策略。
- **实现 4**: `packages/recorder/src/normalize.test.ts:903`
  - 模式：通过事件时间差与目标切换，验证 `buildFlowFromEvents()` 是否自动插入最小 `wait`。
  - 可复用：红灯后若出现联动刷新缺口，可在 recorder 层用最小用例锁定 `visible`/`urlIncludes` 推断规则。
  - 需注意：只有 runtime 红灯明确指向 normalize 边界时，才允许最小修改 `packages/recorder/**`。

### 2. 项目约定

- **命名约定**: runtime 回归测试名称使用“支持将录制事件构建出的 X Flow 直接回放”风格；辅助函数使用 `buildXxx` / `startXxx`。
- **文件组织**: recorded replay 用例集中写在 `packages/runtime/src/playwright-runner.test.ts` 的 `executeFlow` 测试组内；recorder 归一化回归集中写在 `packages/recorder/src/normalize.test.ts`。
- **导入顺序**: Node 内置模块在前，第三方与 monorepo 包其后，本地相对导入最后。
- **代码风格**: TypeScript strict；测试里大量复用 `expect(result.steps.map(...))` 与 `expect(flow.variables)`；字符串与注释使用简体中文。

### 3. 可复用组件清单

- `packages/runtime/src/playwright-runner.test.ts:78` `buildRecordedFlowMeta()`：统一 recorded replay 的 meta 生成。
- `packages/runtime/src/playwright-runner.test.ts:229` `startStaticServer()`：为需要稳定 origin 的 fixture 提供本地 HTTP 服务。
- `packages/runtime/src/playwright-runner.test.ts:34` `fixturesBaseUrl`：将 fixture 名称变量映射到本地 `examples/fixtures`。
- `packages/recorder/src/normalize.ts:598` `buildFlowFromEvents()`：录制事件归一化与 Flow 生成入口。
- `packages/shared/src/recording-protocol.ts:95` `parseRecordedEvent()`：recorded event Schema 校验入口。

### 4. 测试策略

- **测试框架**: Vitest。
- **测试模式**: 以 runtime 整链回归为主；如确有 recorder 缺口，再补 normalize 单测。
- **参考文件**:
  - `packages/runtime/src/playwright-runner.test.ts:511`
  - `packages/runtime/src/playwright-runner.test.ts:657`
  - `packages/runtime/src/playwright-runner.test.ts:838`
  - `packages/recorder/src/normalize.test.ts:903`
- **覆盖要求**:
  - 四条新增场景都必须走 `parseRecordedEvent() -> buildFlowFromEvents() -> executeFlow()`。
  - `session-dashboard` 需要验证 `storageStatePath` 注入。
  - `repeated-row-actions` 需要验证 `scopeText / scopeKind`。
  - 如新增红灯指向等待推断缺口，再以 recorder 单测固定。

### 5. 依赖和集成点

- **外部依赖**: Playwright 由 runtime 执行；Vitest 负责断言。
- **内部依赖**:
  - `@flowweave/shared` 提供 `parseRecordedEvent()` 和 schema 常量。
  - `@flowweave/recorder` 提供 `buildFlowFromEvents()`。
  - `@flowweave/runtime` 提供 `executeFlow()`。
- **集成方式**: recorded event 先经 schema 解析，再在 recorder 中归一化为 `FlowDocument`，最终由 runtime 回放。
- **配置来源**:
  - fixture 路径：`examples/fixtures/**`
  - Node 版本与验收命令：用户任务说明与 `docs/superpowers/plans/2026-06-07-real-page-stability-wave7-orchestration.md`

### 6. 技术选型理由

- **为什么用这个方案**: 仓库当前已经用 runtime 测试承载 recorded replay 回归，直接扩这个基线最符合现有证据链和任务边界。
- **优势**: 不引入第二套回放入口；能同时验证解析、归一化和执行三层闭环。
- **劣势和风险**: 某些异步场景可能依赖 recorder 的最小等待推断，若事件构造不贴近真实录制，容易得到“假绿”或“假红”。

### 7. 关键风险点

- **并发问题**: 当前 worktree 内可能有其他未提交改动，必须只追加本任务最小变更，不回退他人内容。
- **边界条件**:
  - `linked-filters` 和 `drawer-double-save` 都有异步 UI 状态切换；
  - `session-dashboard` 依赖 localStorage 注入；
  - `repeated-row-actions` 依赖重复候选消歧。
- **性能瓶颈**: runtime 测试需要真实启动浏览器并执行页面脚本，定向运行而非全量测试更稳妥。
- **验证风险**: 当前环境无 `sequential-thinking`、`desktop-commander`、`context7`、`github.search_code`，需在操作日志记录后以 CodeGraph、本地命令和现有测试替代。
