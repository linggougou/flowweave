## 项目上下文摘要（执行上下文持久化）

生成时间：2026-06-06 17:24:00 CST

### 1. 相似实现分析

- **实现 1**: [apps/studio/electron/services.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/services.ts:320)
  - 模式：`runFlow -> toKnowledgeExecution -> apiSaveExecution` 负责把运行结果落入知识库。
  - 可复用：`resolveRunEnvironment()` 已统一产出 `environmentName`、`baseUrl`、`storageStatePath`。
  - 需注意：当前仅保存步骤日志，未把运行上下文一并持久化，导致历史重载缺少 fragility 分析上下文。
- **实现 2**: [apps/studio/electron/services.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/services.ts:421)
  - 模式：`fromKnowledgeExecution()` 负责把知识库执行记录转换为 `StudioExecution`。
  - 可复用：`buildFragilityIssues(flow, context)` 已是统一 fragility 分析入口。
  - 需注意：当前重载时调用 `buildFragilityIssues(flow)`，没有把 `baseUrl`、变量上下文传入。
- **实现 3**: [apps/studio/src/App.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/App.tsx:472)
  - 模式：Flow 预览页已把 `baseUrl` 和变量输入传给 `analyzeFlowFragility`。
  - 可复用：预览态与执行态都采用相同的 `FragilityAnalysisContext` 契约。
  - 需注意：历史执行详情也应遵循同一契约，否则 UI 预览与历史诊断会不一致。
- **实现 4**: [packages/project-knowledge/src/repository.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/src/repository.ts:407)
  - 模式：仓储层 `saveExecution / assembleExecution / getExecution / listExecutions` 统一读写 `executions` 与 `execution_steps`。
  - 可复用：已有列兼容模式 `ensureProjectEnvironmentStorageStateColumn()`、`ensureExecutionStepDiagnosticPathColumn()`。
  - 需注意：新增执行上下文字段时需要同时更新初始化 SQL、Drizzle schema 和旧库兼容补列逻辑。

### 2. 项目约定

- **命名约定**：类型名使用 `Studio*`、`*Result`、`*Summary`，运行上下文类字段优先使用 `baseUrl`、`storageStatePath`、`variables`。
- **文件组织**：Electron 进程在 `apps/studio/electron/`，渲染侧共享类型在 `apps/studio/src/shared/`，持久化能力集中在 `packages/project-knowledge/`。
- **导入顺序**：先第三方或 workspace 包，再本地模块；类型导入复用 `import type`。
- **代码风格**：TypeScript strict，优先小函数和显式类型；注释简洁说明意图。

### 3. 可复用组件清单

- [apps/studio/electron/services.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/services.ts:122): `resolveRunEnvironment()`，统一收敛环境上下文。
- [apps/studio/electron/services.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/services.ts:343): `buildFragilityIssues()`，统一 fragility 计算入口。
- [packages/page-intelligence/src/fragility.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/page-intelligence/src/fragility.ts:241): `analyzeFlowFragility()`，接受 `FragilityAnalysisContext`。
- [packages/project-knowledge/src/repository.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/src/repository.ts:40): 旧表补列函数模式，可直接复用到 executions 新字段迁移。

### 4. 测试策略

- **测试框架**：Vitest。
- **测试模式**：优先仓储层单元测试，采用临时目录创建真实 SQLite，再断言仓储读写结果。
- **参考文件**：`packages/project-knowledge/src/repository.test.ts`。
- **覆盖要求**：
  - 保存执行记录时能持久化 `environmentName / baseUrl / storageStatePath / variables`。
  - `listExecutions()` 可读回环境摘要。
  - `getExecution()` 可完整读回执行上下文，供历史 fragility 重建使用。

### 5. 依赖和集成点

- **外部依赖**：`better-sqlite3`、`drizzle-orm`、`@flowweave/page-intelligence`。
- **内部依赖**：
  - Studio Electron 通过 `knowledge-client` 读写 `project-knowledge` API。
  - 浏览器 fallback 直接读取 `ExecutionWithProject`，本地再映射为 `StudioExecution`。
- **集成方式**：执行时由 Electron 保存执行记录，历史详情与列表再从知识库读取。
- **配置来源**：默认环境来自 `project_environments`，运行时变量来自 `RunFlowOptions.variables`。

### 6. 技术选型理由

- **为什么用持久化执行上下文**：历史执行的 fragility 诊断要复原真实运行条件，仅靠 Flow 本体不够。
- **优势**：历史列表、详情页、HTTP fallback 可共享同一份上下文，不需要再猜测当时环境。
- **风险**：SQLite 旧表兼容、变量 JSON 反序列化，以及 UI 类型扩展后各端一致性。

### 7. 关键风险点

- **兼容问题**：旧 `executions` 表缺少新增列，必须补列而不能假设重建数据库。
- **边界条件**：`variables` 为空对象、`baseUrl` 为空字符串、`storageStatePath` 未设置时都要稳定落库/读回。
- **一致性问题**：Electron 与浏览器 fallback 必须使用同一上下文构造 fragility，否则同一执行会出现不同诊断。
- **验证重点**：先做仓储层红灯测试，再用 `typecheck` 和相关包测试验证跨包类型与行为未回退。
