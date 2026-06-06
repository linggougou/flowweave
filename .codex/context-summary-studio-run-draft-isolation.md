## 项目上下文摘要（Studio 运行草稿隔离）

生成时间：2026-06-06 21:55:21 CST

### 1. 相似实现分析

- **实现 1**: [apps/studio/src/App.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/App.tsx:133)
  - 模式：渲染层使用 `useEffect` 串联 `selectedFlowId -> loadFlowDocument -> getFlowRunInput`。
  - 可复用：现有 `loadFlowDocument`、`refreshVersions`、运行前校验与运行提交流程。
  - 需注意：`selectedFlowId` 变化时，`currentFlow` 仍可能暂时保留旧文档，异步恢复最近一次运行输入会发生时序错位。
- **实现 2**: [apps/studio/src/shared/run-input-state.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/shared/run-input-state.ts:34)
  - 模式：将运行草稿的默认值、最近一次执行输入恢复、运行前校验拆到共享纯函数。
  - 可复用：`buildInitialVariableInputs`、`buildRunDraftState`、`collectRunPreflightIssues`。
  - 需注意：当前 `buildInitialVariableInputs(flow, previous)` 会按变量名复用旧值，若跨 Flow 直接复用，会把其他 Flow 的同名变量带过来。
- **实现 3**: [apps/studio/electron/services.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/services.ts:134)
  - 模式：服务层通过 `hasExplicitOption` 区分“未传值”和“显式清空”，再写入默认环境与执行记录。
  - 可复用：`resolveRunEnvironment`、`getFlowRunInput`、`runFlow` 的运行上下文合同。
  - 需注意：前后端合同已经支持显式清空和历史回填，剩余风险主要在前端状态恢复时序，而不是服务层数据结构。

### 2. 项目约定

- **命名约定**：React 组件使用驼峰函数名；共享状态助手函数以 `build*`、`collect*`、`parse*` 命名。
- **文件组织**：渲染层状态逻辑在 `apps/studio/src/App.tsx`，可复用纯逻辑放在 `apps/studio/src/shared/`。
- **导入顺序**：先第三方与 React，再工作区包，再本地模块。
- **代码风格**：TypeScript strict；字符串与注释简体中文；早返回分支优先。

### 3. 可复用组件清单

- [apps/studio/src/shared/run-input-state.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/shared/run-input-state.ts:34)：运行草稿构建、变量解析与运行前校验。
- [apps/studio/electron/services.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/services.ts:404)：Studio 到 Runtime 的运行上下文透传与落库。
- [apps/studio/electron/main.test.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/main.test.ts:1)：IPC 层运行选项完整透传测试模式。

### 4. 测试策略

- **测试框架**：Vitest。
- **测试模式**：优先补共享纯函数单元测试，必要时补服务层集成测试。
- **参考文件**：
  - [apps/studio/src/shared/run-input-state.test.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/shared/run-input-state.test.ts:1)
  - [apps/studio/electron/services.test.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/services.test.ts:1)
- **覆盖要求**：覆盖同 Flow 保留草稿、跨 Flow 不继承旧值、只有当前 Flow 文档就绪时才恢复最近一次运行输入。

### 5. 依赖和集成点

- **外部依赖**：React、Vitest。
- **内部依赖**：
  - `App.tsx` 依赖 `studio-client` 提供的 `getFlowRunInput` / `runFlow`
  - `run-input-state.ts` 依赖 `@flowweave/page-intelligence` 做 fragility 预检
- **集成方式**：渲染层从 preload API 拉取最近执行输入，构建运行草稿后回传到 Electron 服务层执行。
- **配置来源**：项目与环境信息来自 `project-knowledge`，历史执行 `runContext` 由 `services.ts` 落库。

### 6. 技术选型理由

- **为什么用共享纯函数承接修复**：这样能把“是否跨 Flow 复用旧草稿”和“何时允许恢复最近执行输入”变成可测试合同，避免只在 React effect 里堆条件分支。
- **优势**：更易单测，后续 Studio Web / Electron 共享逻辑时也能复用。
- **劣势和风险**：仍需在 `App.tsx` 保持 effect 依赖正确，否则共享函数虽然正确，异步时序仍会出错。

### 7. 关键风险点

- **并发问题**：快速切换 Flow 时，旧 `currentFlow` 与新 `selectedFlowId` 会短暂并存。
- **边界条件**：新 Flow 没有最近执行输入时，不能保留前一个 Flow 的同名变量值。
- **性能瓶颈**：本轮仅状态编排，无明显性能压力。
- **安全考虑**：本轮不新增安全控制，沿用项目现有本地文件路径校验。
