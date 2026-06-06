## 项目上下文摘要（真实页面稳定录制与执行增强）

生成时间：2026-06-06 14:40:00 CST

### 1. 相似实现分析

- **实现 1**: `packages/flow-dsl/src/schema.ts`
  - 模式：以 Zod 维护 `FlowDocument` 与 `NormalizedStep` 的单一事实来源。
  - 可复用：`normalizedStepSchema`、`targetSchema`、`variableDefSchema`。
  - 需注意：当前实现仅支持 `navigate` / `click` / `fill` / `wait`，与文档声明不一致。

- **实现 2**: `packages/recorder/src/normalize.ts`
  - 模式：录制事件先归一化为标准步骤，再统一拼装为 `FlowDocument`。
  - 可复用：`buildTargetFromPayload`、`buildFlowFromEvents`、`ensureLeadingNavigate`。
  - 需注意：当前只支持三类交互步骤，`variables` 固定为空，语义覆盖不足。

- **实现 3**: `packages/recorder/src/target-from-dom.ts`
  - 模式：录制端预生成多策略定位链，执行端顺序回退。
  - 可复用：`buildInteractionPayload`、`resolveClickTarget`、`shouldRecordClick`、`shouldRecordFill`。
  - 需注意：CSS fallback 仍依赖 DOM 深度与 `nth-of-type`，缺少稳定性评分与上下文提示。

- **实现 4**: `packages/runtime/src/playwright-runner.ts`
  - 模式：按 `NormalizedStep` 类型分支执行，失败时回收截图与错误信息。
  - 可复用：`executeFlow`、`runStep`、`resolveTarget`、`waitForPageSettled`。
  - 需注意：`wait visible` 未实现，环境注入、变量替换与失败诊断都较薄。

- **实现 5**: `packages/project-knowledge/src/repository.ts`
  - 模式：以 `Project` 为聚合根保存环境、Flow、执行记录与快照。
  - 可复用：`ensureDefaultEnvironment`、`saveEnvironment`、`saveExecution`、`allocateRunDirectory`。
  - 需注意：环境数据已存储，但没有贯通到 runtime 执行配置。

- **实现 6**: `apps/extension/entrypoints/content.ts`
  - 模式：content script 捕获用户事件，发送到 background，再同步到知识库 / sidepanel。
  - 可复用：`recordNavigate`、`recordFillFromElement`、路由变化监听逻辑。
  - 需注意：当前仅覆盖 click / fill / navigate，缺失 select、checkbox、upload、press、iframe 等语义。

- **实现 7**: `apps/studio/electron/services.ts`
  - 模式：Studio 服务层负责把 project-knowledge 与 runtime 串起来。
  - 可复用：`resolveFlowForRun`、`runFlow`、`mapRuntimeSteps`。
  - 需注意：运行时仅传 `headless` / `executionId` / `artifactDir`，没有环境与变量注入。

### 2. 项目约定

- **命名约定**：
  - 包名统一 `@flowweave/<package>`。
  - 对外导出仅走 `src/index.ts`。
  - 运行时错误使用 `FlowWeaveError` 与共享错误码。
- **文件组织**：
  - `apps/*` 只依赖 `packages/*`，禁止 `apps` 互相依赖。
  - 扩展录制逻辑在 `apps/extension/entrypoints/`，执行与存储逻辑在 `packages/`。
  - Studio 的业务编排逻辑集中在 `apps/studio/electron/services.ts`。
- **导入顺序**：
  - 先标准库，再 workspace 包，再本地相对路径。
  - 类型导入优先 `import type`。
- **代码风格**：
  - TypeScript strict，ESM，简体中文注释，标识符英文。
  - 以小文件、单一职责为主，测试紧贴源码同目录。

### 3. 可复用组件清单

- `packages/recorder/src/target-from-dom.ts`：录制端目标提取、点击/输入语义判定。
- `packages/recorder/src/step-filter.ts`：基础去噪与连续 fill 合并。
- `packages/runtime/src/playwright-runner.ts`：Playwright 执行主循环与截图落盘。
- `packages/project-knowledge/src/repository.ts`：环境、Flow、执行记录、快照存储。
- `apps/studio/electron/services.ts`：Studio 执行服务编排与运行目录分配。
- `packages/page-intelligence/src/fragility.ts`：流程脆弱性分析入口。

### 4. 测试策略

- **测试框架**：Vitest。
- **测试模式**：
  - `packages/*` 以单元测试和轻集成为主。
  - runtime 使用 `examples/fixtures/*.html` 做真实 Playwright fixture 验证。
- **参考文件**：
  - `packages/recorder/src/normalize.test.ts`
  - `packages/runtime/src/playwright-runner.test.ts`
  - `packages/project-knowledge/src/repository.test.ts`
- **当前缺口**：
  - `apps/extension` 与 `apps/studio` 基本无有效测试。
  - runtime fixture 过于理想化，仅覆盖登录表单 happy path。

### 5. 依赖和集成点

- **外部依赖**：
  - Playwright：浏览器执行内核。
  - Zod：DSL Schema。
  - better-sqlite3 / Drizzle：本地知识库存储。
  - WXT：扩展构建。
  - Electron + Vite + React：Studio。
- **内部依赖链**：
  - extension → recorder → flow-dsl / shared
  - studio → runtime + project-knowledge
  - runtime → flow-dsl + page-intelligence
  - project-knowledge → flow-dsl + page-intelligence
- **关键集成点**：
  - `RecordedEvent` 协议
  - `FlowDocument` schema
  - `ExecutionOptions` 与 `ExecutionResult`
  - `ProjectEnvironment` 与 Studio 运行入口

### 6. 技术选型理由

- **为什么继续沿用现有架构**：
  - 仓库主链路已跑通，问题集中在能力不足而非架构错误。
  - 录制、执行、知识库三段式结构已经清晰，适合在原位增强。
- **优势**：
  - monorepo 便于共享 DSL 与类型。
  - Playwright 本身具备较强的定位与等待能力，当前主要是封装不够。
  - 本地 SQLite 结构已存在，扩展环境与诊断数据成本较低。
- **劣势和风险**：
  - schema 变更会影响 extension、runtime、studio、knowledge 四段联动。
  - worktree 并行开发若边界不清，容易在 `services.ts`、`schema.ts` 产生冲突。

### 7. 关键风险点

- **接口漂移**：DSL、录制 payload、runtime options 若同步不严，会导致编译通过但行为错位。
- **边界条件**：select、checkbox、radio、upload、异步路由、弹窗、延迟渲染都可能破坏当前 happy path。
- **性能瓶颈**：过度截图、过深 DOM 分析与 HAR 解析可能拖慢执行。
- **验证风险**：若仍只依赖 `login.html`，会继续高估稳定性。

### 8. 工具与替代流程

- 当前环境未提供 `sequential-thinking`，本轮使用结构化分解、CodeGraph、现有测试与分阶段留痕替代。
- 当前环境未提供 `desktop-commander`，本轮使用本地命令与 `apply_patch` 完成文件分析和编辑。
- 当前环境未提供 `context7` 与 `github.search_code`，本轮优先依据仓库现有实现、测试与官方运行命令做规划；若后续需要外部资料，再单独补充来源。
