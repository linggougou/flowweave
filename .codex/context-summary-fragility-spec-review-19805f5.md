## 项目上下文摘要（Fragility 规格审查 19805f5）

生成时间：2026-06-06 17:00:00 CST

### 1. 审查目标

- worktree：`/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-fragility-context`
- 提交：`19805f5c4e046e5d3a3ffbc2893dae3d9bb3c87a`
- 任务类型：只读“规格符合性审查”
- 验收标准：
  - 相对 `navigate` 且缺少 `baseUrl` 时报 `MISSING_ENVIRONMENT`
  - 显式提供 `context.variables` 时，扫描步骤中的 `{{variable}}` 引用，对缺失输入报 `MISSING_VARIABLE`
  - `analyzeFlowFragility(flow)` 旧调用继续可用
  - 不破坏既有 5 类 fragility code 与既有测试语义

### 2. 相似实现与依赖证据

- **实现 1**：`packages/page-intelligence/src/fragility.ts`
  - 既有 5 类 code 的主实现入口。
  - 本次提交新增 `FragilityAnalysisContext`、`MISSING_ENVIRONMENT`、`MISSING_VARIABLE`。
- **实现 2**：`packages/runtime/src/playwright-runner.ts`
  - 运行时真实使用的变量插值与相对地址解析逻辑。
  - 关键点：也是用 `/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g` 解析变量，占位符契约与 fragility 新逻辑一致。
- **实现 3**：`packages/flow-dsl/src/schema.ts`
  - `FlowDocument` / `NormalizedStep` / `variableDefSchema` 定义来源。
  - 关键点：变量名当前仅要求 `z.string().min(1)`，比运行时/fragility 正则宽。
- **实现 4**：`apps/studio/src/App.tsx` 与 `apps/studio/electron/services.ts`
  - 现有旧调用点仍使用 `analyzeFlowFragility(flow)`，证明兼容旧签名的重要性。

### 3. 规格来源

- `docs/superpowers/specs/2026-06-06-real-page-stability-design.md`
  - 要求新增 `MISSING_ENVIRONMENT`、`MISSING_VARIABLE`
- `docs/superpowers/plans/2026-06-06-real-page-stability-next-wave-plan.md`
  - Fragility 轨道文件边界只含 `packages/page-intelligence/**` 与相关文档
  - 目标测试样例直接给出两个新增断言

### 4. 测试与验证方式

- `pnpm --filter @flowweave/page-intelligence test`
- `pnpm --filter @flowweave/page-intelligence typecheck`
- `pnpm --filter @flowweave/page-intelligence build`

### 5. 关键观察

- `MISSING_ENVIRONMENT` 逻辑只在 `navigate` 且 `context.baseUrl` 缺失时触发，并会先做变量插值与绝对地址判断。
- `MISSING_VARIABLE` 只在显式传入 `context.variables` 时触发，符合“兼容旧调用”的约束。
- 旧的 5 类 fragility 检查函数 `inspectStep()` 未改动，原测试全部保留并继续通过。
- 潜在规格偏差在变量命名契约：
  - DSL 允许任意非空变量名；
  - runtime / fragility 仅识别字母、数字、下划线组成的占位符名。

### 6. 初步结论

- 验收标准 1、3、4 有直接代码与测试证据支持。
- 验收标准 2 对常见 `{{username}}` 场景成立，但对 DSL 当前允许的更宽变量命名范围并不完整，存在漏报风险。
