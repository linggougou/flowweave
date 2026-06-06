## 项目上下文摘要（执行历史映射回归）

生成时间：2026-06-06 19:50:51 CST

### 1. 相似实现分析

- **实现 1**: [apps/studio/electron/services.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/services.ts:401)
  - 模式：Electron 侧在 `runFlow()` 生成实时 `StudioExecution`，并在 `getExecution()` 中从缓存或知识库重建历史执行。
  - 可复用：`fromKnowledgeExecution()` 已具备“Flow 快照优先 + 历史 fragility 重建”的完整语义。
  - 需注意：当前映射逻辑与 HTTP fallback 各自实现，容易再次出现字段透传分叉。
- **实现 2**: [apps/studio/src/studio-client.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/studio-client.ts:54)
  - 模式：HTTP fallback 读取 `ExecutionWithProject` 后，在前端侧组装 `StudioExecution`。
  - 可复用：步骤标签、`flowSnapshot` / `runContext`、`fragilityIssues` 的计算规则与 Electron 侧基本同构。
  - 需注意：该文件只补充 API 侧额外返回的 `diagnostic` / `pageSnapshot` 数据，不应再次复制另一套历史执行规则。
- **实现 3**: [apps/studio/src/shared/execution-fragility.test.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/shared/execution-fragility.test.ts:49)
  - 模式：共享纯函数通过 Vitest 做高密度回归，专门保护历史执行与上下文相关 fragility。
  - 可复用：这类“输入一份执行记录，断言标签 / warning / fragility”的模式适合承接执行历史映射回归。
  - 需注意：现有测试还没直接守住 Electron 缓存命中条件和 HTTP fallback DTO 透传。
- **实现 4**: [packages/project-knowledge/src/repository.test.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/src/repository.test.ts:118)
  - 模式：知识库测试通过最小 `ExecutionResult` / `ExecutionWithProject` 夹具覆盖持久化契约。
  - 可复用：可以沿用同样的最小执行记录夹具，构造 `flowSnapshot`、`runContext` 与步骤日志样本。
  - 需注意：这里验证的是存储契约，不是 Studio 展示契约，不能替代前端 / Electron 层回归。

### 2. 项目约定

- **命名约定**：Studio 共享纯函数放在 `apps/studio/src/shared/`，测试优先就近放在同目录 `*.test.ts`。
- **文件组织**：Electron / HTTP fallback 各保留 IO 逻辑，真正的历史执行重建规则应收敛到 shared 层。
- **导入顺序**：workspace 包与第三方包在前，本地共享 helper 在后；类型优先 `import type`。
- **代码风格**：以纯函数和最小 DTO 夹具为主，不引入额外测试框架或复杂 mock 基建。

### 3. 可复用组件清单

- [apps/studio/src/shared/execution-fragility.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/shared/execution-fragility.ts): 已集中保存历史执行上下文与 fragility 规则。
- [apps/studio/src/shared/studio-api-types.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/shared/studio-api-types.ts): `StudioExecution`、`ExecutionStepLog` 与运行上下文类型。
- [packages/project-knowledge/src/types.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/src/types.ts): `ExecutionWithProject` 是两条读取链路共同的底层输入契约。
- [packages/project-knowledge/src/repository.test.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/src/repository.test.ts): 最小执行记录夹具模式。

### 4. 测试策略

- **测试框架**：Vitest。
- **测试模式**：先补共享纯函数红灯测试，再做最小重构；避免引入 Electron 集成测试重负载。
- **参考文件**：
  - `apps/studio/src/shared/execution-fragility.test.ts`
  - `packages/project-knowledge/src/repository.test.ts`
- **覆盖要求**：
  - Flow 快照优先决定步骤标签与 fragility。
  - 不完整缓存不允许直接命中；上下文充分的缓存允许复用。
  - HTTP / Electron 两条链路使用同一份历史执行映射规则。

### 5. 依赖和集成点

- **外部依赖**：Vitest、React 类型、workspace 包。
- **内部依赖**：
  - `studio-client.ts` 依赖 HTTP 返回的 `ExecutionWithProject`
  - `electron/services.ts` 依赖知识库 API 与本地 artifact 读取
  - `execution-fragility.ts` 提供上下文与兼容判断
- **集成方式**：共享映射 helper 只接收 `ExecutionWithProject` 与可选 fallback Flow / step extra mapper，不直接做 IO。
- **配置来源**：无新增运行配置；统一继续在 Node 20 基线下验证。

### 6. 技术选型理由

- **为什么抽共享纯函数**：当前 Electron 与 HTTP fallback 的差异只应停留在“额外补哪些 artifact 字段”，不该继续复制历史执行核心规则。
- **优势**：一处修规则，两条链路同时受益；测试也能直接守住 future regression。
- **风险**：若 helper 设计过重，会把各自特有逻辑强行耦合，因此只抽公共映射层，不抽 IO。

### 7. 关键风险点

- **回归风险**：后续若再次漏传 `flowSnapshot` / `runContext`，没有共享测试就很难第一时间发现。
- **职责边界**：Electron 侧有 `readStepArtifacts()`，HTTP fallback 有 `diagnostic` / `pageSnapshot` 直传，shared helper 不能吞掉这些差异。
- **性能风险**：共享 helper 内的 fragility 计算会在历史执行页频繁触发，需保持纯函数和轻量逻辑。
