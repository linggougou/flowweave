# 真实页面稳定录制与执行增强设计文档

生成时间：2026-06-06

## 1. 背景

FlowWeave 当前已经具备“扩展录制 -> 归一化 Flow -> Studio 回放 -> 本地知识库存档”的主链路，但实际体验仍停留在原型阶段。它能稳定跑通 `examples/fixtures/login.html` 这类理想页面，却难以覆盖真实业务站点常见的异步加载、复杂表单、登录态、定位漂移与失败诊断需求。

本轮工作的目标不是追加 AI 能力，而是把现有产品从“可演示”推进到“可用于真实网页的稳定执行底座”。

## 2. 现状诊断

### 2.1 录制语义过窄

- `apps/extension/entrypoints/content.ts` 当前仅覆盖 `navigate`、`click`、`fill` 三类主行为。
- `packages/recorder/src/normalize.ts` 也仅能归一化上述类型，导致 checkbox、radio、select、upload、快捷键等真实交互被错误折叠成 click 或直接丢失。

### 2.2 DSL 与文档不一致

- `docs/domain/flow-dsl.md` 声明了 `select`、`press`、`assert`、`extract` 等能力。
- `packages/flow-dsl/src/schema.ts` 实际只有 `navigate`、`click`、`fill`、`wait`。

这会直接带来三类问题：

1. 用户对产品能力有错误预期。
2. Studio / runtime 无法围绕统一模型演进。
3. 后续并行开发缺少单一事实来源。

### 2.3 定位策略不够稳

- `packages/recorder/src/target-from-dom.ts` 虽然会生成多策略数组，但强依赖 `css` fallback。
- 当前 `css` 生成逻辑大量使用 DOM 深度和 `nth-of-type`。
- `packages/runtime/src/playwright-runner.ts` 的 `resolveTarget` 只会顺序尝试 `locator.first().waitFor(visible)`，没有候选评分、命中数量诊断、上下文证据。

### 2.4 等待与页面稳定策略太薄

- `waitForPageSettled` 只识别少量 loading mask，并附加一次 `networkidle`。
- `wait visible` 仍未实现。
- 对 SPA 路由切换、局部异步渲染、按钮点击后的业务完成态没有系统建模。

### 2.5 环境与登录态没有贯通

- `packages/project-knowledge/src/repository.ts` 已经能存默认环境和 `baseUrl`。
- `packages/runtime/src/types.ts` 没有 `storageState`、`cookies`、`variables`、`baseUrl` 等执行配置。
- `apps/studio/electron/services.ts` 调用 runtime 时也没有注入环境信息。

### 2.6 诊断与验证不足

- `packages/page-intelligence/src/fragility.ts` 目前只报 `CSS_ONLY` 与 `NO_STRATEGIES`。
- runtime 失败时只有截图、页面摘要、HAR 路径，缺少“哪个策略失败、匹配到几个节点、页面当前 URL/标题/HTML 证据”等信息。
- 测试样本仍主要依赖 `login.html`，不足以验证真实稳定性。

## 3. 设计目标

### 3.1 核心目标

1. 让录制结果在真实表单页、异步页面和带登录态页面上更稳定地回放。
2. 统一 DSL、录制器、执行器、Studio、知识库的能力边界。
3. 补齐环境/变量/诊断，降低“录得到但跑不起来”的概率和排查成本。
4. 建立一套可持续回归的真实页面基准夹具。

### 3.2 成功标准

1. DSL、录制器和 runtime 至少统一支持以下步骤：`navigate`、`click`、`fill`、`select`、`setChecked`、`press`、`upload`、`wait`。
2. runtime 支持 `baseUrl`、变量替换、`storageStatePath` 注入与自定义 cookie 注入。
3. 失败步骤会落盘可读的诊断 JSON，包括策略尝试结果、当前 URL、页面标题、截图、快照与 HAR 路径。
4. Studio 能选择环境、填写变量、查看脆弱性体检与失败诊断入口。
5. 新增至少 4 组本地 fixture 覆盖复杂表单、异步等待、会话注入、失败诊断。

## 4. 非目标

本轮明确不做以下内容：

1. AI 自动修复选择器。
2. 云端同步、多人协作、账号体系。
3. 远程真实站点自动基准平台。
4. 完整的自然语言编排与 page/network 深度智能分析。

## 5. 方案对比

### 方案 A：继续微调现有 click/fill/wait

- 优点：改动小，短期可见。
- 缺点：核心语义缺失问题不解决，环境和诊断仍然断层。

### 方案 B：围绕“稳定执行底座”做分层增强

- 优点：能在不推翻架构的前提下统一模型、录制、执行、环境、诊断、回归。
- 缺点：需要同时协调多个包，实施成本高于局部补丁。

### 方案 C：直接引入 AI 自愈与高级页面理解

- 优点：理论上上限高。
- 缺点：会在底座尚不稳定时叠加复杂度，与当前阶段目标冲突。

### 推荐结论

采用**方案 B**。先把真实页面稳定执行底座做扎实，再为后续 AI 能力留下接口。

## 6. 详细设计

### 6.1 Flow DSL 与录制语义统一

#### 设计原则

1. 尽量采用**向前兼容的加字段方式**，避免当前 `schemaVersion` 立即升级。
2. 文档与 schema 必须同步收敛，不能再出现“文档超前、实现落后”。
3. 录制器只自动生成当前真正支持的步骤；未来能力保留在文档的“后续阶段”中说明。

#### 首批统一的步骤集合

- `navigate`
- `click`
- `fill`
- `select`
- `setChecked`
- `press`
- `upload`
- `wait`

#### Target 增强

在 `target` 上新增可选 `hints` 字段，用于承载执行稳定性与诊断所需的上下文：

```ts
type TargetHints = {
  tagName?: string;
  inputType?: string;
  nameAttr?: string;
  placeholder?: string;
  labelText?: string;
  textSample?: string;
};
```

`strategies` 仍是执行主入口，`hints` 不直接参与定位优先级，但会用于：

1. 诊断输出。
2. fragility 分析。
3. 后续自愈扩展点。

### 6.2 录制器增强

录制层拆成两件事：

1. **语义识别**：识别真实用户意图是什么步骤。
2. **目标提取**：为该步骤生成更稳的 `Target` 与 `hints`。

本轮增强内容：

- `content.ts` 新增对 `select`、checkbox、radio、file input、键盘确认等事件的录制。
- `target-from-dom.ts` 补充 `label` / `placeholder` / `name` / 输入类型信息提取。
- `step-filter.ts` 增加以下去噪规则：
  - checkbox/radio 前置 click 与 `setChecked` 合并。
  - select 打开菜单 click 与最终 change 合并。
  - 连续路由跳转去重。
  - 重复 input debounce 后的相同值去重。

### 6.3 Runtime 稳定执行层

runtime 增强分三层：

#### 1. 执行能力补全

- 新增 `select`
- 新增 `setChecked`
- 新增 `press`
- 新增 `upload`
- 扩展 `wait`，支持：
  - `networkidle`
  - `visible`
  - `hidden`
  - `attached`
  - `detached`
  - `urlIncludes`

#### 2. 定位策略增强

新增 `resolveTargetWithDiagnostics`：

1. 顺序尝试每种 strategy。
2. 记录每种 strategy 的匹配数量、是否可见、是否成功。
3. 匹配过多时，优先保留更稳定策略结果；必要时输出“命中多个候选”的诊断。

#### 3. 页面稳定策略增强

新增统一的 `waitForPageReady`：

1. 保留已有 loading mask 与 `networkidle`。
2. 增加对 `aria-busy="true"`、常见 `[data-loading]`、局部禁用态按钮的检测。
3. 导航和点击后统一进入“动作后稳定等待”。
4. 对 SPA hash / history 路由切换保留更明确的 URL 检查。

### 6.4 环境、会话与变量注入

#### ExecutionOptions 扩展

```ts
type ExecutionOptions = {
  headless?: boolean;
  timeoutMs?: number;
  executionId?: string;
  artifactDir?: string;
  recordHar?: boolean;
  baseUrl?: string;
  variables?: Record<string, string | number | boolean>;
  storageStatePath?: string;
  cookies?: BrowserContextCookies[];
  environmentName?: string;
};
```

#### 数据贯通

1. `project-knowledge` 环境模型新增 `storageStatePath`。
2. Studio 运行时读取项目默认环境，并允许显式覆盖。
3. `navigate` 支持相对路径与 `baseUrl` 拼接。
4. `fill` / `select` / `press` 等字符串字段支持 `{{variable}}` 插值。

### 6.5 诊断与体检增强

#### 失败诊断产物

每次失败至少落盘以下产物：

1. `step-<n>.png`
2. `page-<n>.json`
3. `step-<n>-diagnostic.json`
4. `network.har`（启用时）

`step-<n>-diagnostic.json` 结构至少包含：

```ts
type StepDiagnostic = {
  stepId: string;
  stepIndex: number;
  url: string;
  title: string;
  strategyAttempts: Array<{
    label: string;
    matchedCount: number;
    visibleCount?: number;
    success: boolean;
    error?: string;
  }>;
  targetHints?: TargetHints;
};
```

#### 脆弱性分析增强

在现有 `CSS_ONLY` / `NO_STRATEGIES` 基础上新增：

- `CSS_NTH_OF_TYPE`
- `TEXT_ONLY`
- `MISSING_ENVIRONMENT`
- `MISSING_VARIABLE`
- `WAIT_MAY_BE_UNSTABLE`

Studio 显示 warning / error 分组，并给出直接可执行的修复建议。

### 6.6 Studio 交互增强

Studio 不是本轮主要写入面，但需要承担“可运行、可诊断、可调试”职责：

1. 运行前选择环境。
2. 若 Flow 存在变量，展示变量输入面板。
3. 执行后展示脆弱性提示与诊断入口。
4. 失败步骤可直接打开截图和诊断 JSON 路径。

## 7. 交付拆分

为了适配 worktree + subagent 并行开发，本轮拆成五个子项目：

1. **Foundation**：冻结 DSL、环境、诊断接口与文档。
2. **Recorder**：录制语义与去噪增强。
3. **Runtime**：步骤执行、等待与定位增强。
4. **Environment**：环境/变量/会话注入贯通。
5. **Diagnostics & Benchmarks**：脆弱性、诊断产物、fixture 回归、Studio 调试入口。

其中 Foundation 先行，之后其余四轨道并行。

## 8. 风险与缓解

### 风险 1：多轨道同时改 DSL 容易冲突

- 缓解：先完成 Foundation，冻结类型与文档，再切并行 worktree。

### 风险 2：Studio 与 runtime 的接口变更互相阻塞

- 缓解：先扩展 `ExecutionOptions` 与服务层 DTO，再让 Studio 消费。

### 风险 3：真实站点无法稳定作为测试基准

- 缓解：本轮全部使用本地 fixture，确保回归可复现。

### 风险 4：诊断产物过重拖慢执行

- 缓解：仅在失败步骤强制输出详细诊断；成功步骤保留截图与轻量快照。

## 9. 结论

本轮不是继续给原型打补丁，而是建立一套“真实页面稳定执行底座”。只要按 Foundation -> 并行四轨道 -> 主代理集成的顺序推进，FlowWeave 就能从目前的演示级回放，升级到可在真实业务页面上持续迭代的自动化平台基础层。
