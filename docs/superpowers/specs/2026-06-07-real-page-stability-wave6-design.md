# 真实页面稳定性 Wave 6 设计

生成时间：2026-06-07

## 1. 背景

截至当前 `codex/real-page-stability-program` 主线，FlowWeave 已具备：

1. Recorder / runtime / Studio / Benchmarks 的真实页面稳定执行底座。
2. `scopeText / scopeKind` 作用域线索与 runtime 多候选消解。
3. `p7` 真实页面矩阵，覆盖 `19` 个 fixture，`pnpm e2e:real-pages` 在 `Node v20.19.6` 下通过。
4. Studio 首屏失败摘要、页面快照摘要、目标歧义修复建议。

但当前仍有两类真实缺口：

- **执行前盲区**：`analyzeFlowFragility()` 只会对 `click / fill / wait` 给出结构化风险，`select / setChecked / upload / press(target)` 这类真实页面高频步骤仍缺一致体检。
- **执行后盲区**：runtime 只会为 Target 定位失败写结构化 `diagnostic.json`，而导航失败、`wait` 约束错误、上传文件错误等非定位类失败只能退回原始 `message`，Studio 无法在应用内首屏理解根因。

换句话说，上一阶段解决的是“跑到对的那个元素”，这一阶段要解决的是“失败时能更快判断为什么没跑成，以及哪些步骤在运行前就已经明显脆弱”。

## 2. 目标

### 2.1 核心目标

1. 把 fragility 体检从 `click / fill / wait` 扩展到全部 target-bearing 步骤。
2. 为 runtime 建立统一的步骤失败诊断 envelope，不再把诊断 JSON 限定为定位失败专用。
3. 让 Studio 同时消费“目标定位诊断”和“通用步骤失败诊断”，并保持现有歧义修复体验不退化。
4. 在 Node 20 下补齐 page-intelligence、runtime、studio 三层回归，确保新协议落地后仍能稳定执行 `p7` 矩阵。

### 2.2 成功标准

1. `analyzeFlowFragility()` 会对 `select / setChecked / upload / press(target)` 输出与 `click / fill` 一致的 `NO_STRATEGIES / CSS_ONLY / CSS_NTH_OF_TYPE / TEXT_ONLY` 风险。
2. runtime 在非定位类失败时也会落盘 `step-<n>-diagnostic.json`，且 JSON 至少包含：
   - `kind`
   - `stepId`
   - `stepIndex`
   - `stepType`
   - `message`
   - `errorCode`
   - 可用时的 `url / title`
3. Target 类诊断继续保留：
   - `strategyAttempts`
   - `targetHints`
4. Studio 能区分并渲染：
   - `kind = "target-resolution"`
   - `kind = "runtime-error"`
5. `Node v20.19.6` 下以下命令通过：
   - `pnpm --filter @flowweave/page-intelligence test -- fragility.test.ts`
   - `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
   - `pnpm --filter @flowweave/app-studio test -- src/shared/failure-insights.test.ts DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts`
   - `pnpm --filter @flowweave/app-studio typecheck`

## 3. 方案比较

### 方案 A：只扩展 fragility，不改 runtime / Studio 诊断

优点：

- 改动面最小。
- 能更早发现一部分脆弱步骤。

缺点：

- 运行时失败证据仍然不完整。
- 真实页面排障仍要在 Studio 外靠截图和原始 message 猜。

### 方案 B：只扩展 runtime 通用失败诊断，不改 fragility

优点：

- 执行后证据更完整。
- Studio 更容易解释失败。

缺点：

- 执行前仍然无法预警 `select / upload / press(target)` 这类步骤的高风险定位写法。

### 方案 C：统一推进 fragility 多步骤覆盖 + runtime 通用诊断 + Studio 消费

优点：

- 同时覆盖执行前预警与执行后排障。
- 可直接复用现有 `diagnosticPath / pageSnapshotPath / failure-insights` 链路。
- 不需要引入新持久化模型或新 Electron API。

缺点：

- 需要跨 `page-intelligence / runtime / studio` 协同。
- 必须先冻结统一诊断 envelope，防止协议漂移。

### 推荐方案

采用 **方案 C**。

理由：

- 它最贴近“真实页面执行稳定性”这一用户实际价值，而不是单点优化。
- 它不会推翻现有设计，只是在既有 `fragility` 与 `diagnostic` 两条链路上补齐覆盖面。
- 它也为后续更强的执行历史修复与自动建议打下统一数据基础。

## 4. 设计范围

### 4.1 Foundation：统一步骤诊断 Envelope

新增统一概念：

- `kind = "target-resolution"`
  - 适用于定位失败、等待目标失败、多候选歧义
- `kind = "runtime-error"`
  - 适用于非定位类步骤失败，例如：
    - `wait` 约束不完整
    - 导航失败
    - 上传文件错误
    - 其他 Playwright / runtime 级失败

推荐字段：

```ts
type BaseStepDiagnostic = {
  kind: "target-resolution" | "runtime-error";
  stepId: string;
  stepIndex: number;
  stepType: NormalizedStep["type"];
  message: string;
  errorCode?: string;
  cause?: string;
  url?: string;
  title?: string;
};
```

Target 失败扩展字段：

```ts
type TargetResolutionDiagnostic = BaseStepDiagnostic & {
  kind: "target-resolution";
  url: string;
  title: string;
  strategyAttempts: StrategyAttempt[];
  targetHints?: Target["hints"];
};
```

通用失败扩展字段：

```ts
type RuntimeErrorDiagnostic = BaseStepDiagnostic & {
  kind: "runtime-error";
};
```

约束：

- 不把完整 step 对象原样写入 JSON，避免协议过重与变量泄露。
- `url / title` 为可选字段；页面已关闭或尚未进入新页面时允许缺失。

### 4.2 Fragility：多步骤 target 风险覆盖

当前 `NO_STRATEGIES / CSS_ONLY / CSS_NTH_OF_TYPE / TEXT_ONLY` 的判断逻辑，本质上适用于所有带 `target` 的交互步骤，不该只限 `click / fill`。

本轮调整：

1. 抽出统一的 target-bearing step 识别：
   - `click`
   - `fill`
   - `select`
   - `setChecked`
   - `upload`
   - `press`（仅 `step.target` 存在时）
2. 复用现有检测规则，不新增新 fragility code。
3. 保持 `wait` 逻辑与 `MISSING_ENVIRONMENT / MISSING_VARIABLE` 不变。

### 4.3 Runtime：通用失败诊断落盘

当前 `runStep()` 在 catch 分支只会：

1. 截图
2. 写页面快照
3. 若错误可被 `getTargetDiagnosticContext()` 识别，再写 diagnostic JSON

本轮调整：

1. 把 `TargetDiagnosticContext` 升级为 discriminated union。
2. 原有 `buildTargetDiagnosticError()` 继续构建 `kind = "target-resolution"`。
3. 新增通用诊断构建函数：
   - 尝试读取当前 `page.url()` 与 `page.title()`
   - 记录当前 `stepType`、`message`、`errorCode`、`cause`
4. catch 分支无论是否为 target 错误，都尽量写 diagnostic JSON。

### 4.4 Studio：统一失败摘要与诊断工作台

本轮要求：

1. `StudioStepDiagnostic` 改为 discriminated union。
2. `readStepArtifacts()` 继续读取同一个 JSON 文件，但不再假设其中一定有 `strategyAttempts`。
3. `buildFailureInsight()`：
   - 对 `runtime-error` 直接给出“执行报错 / 参数约束 / 页面状态异常”等摘要
   - 保持 `target-resolution` 的现有分类和标题优先级
4. `DiagnosticInspector`：
   - `target-resolution` 继续展示策略尝试表格与 Target hints
   - `runtime-error` 展示步骤类型、错误码、消息、当前 URL/标题（如有）

### 4.5 非目标

本轮不做：

1. 新增更重的 `p8` fixture 档位
2. 自动修复 Flow
3. 把 diagnostic JSON 持久化为结构化数据库字段
4. 新增新的 Studio 后端 API
5. 更复杂的 selector 自愈或 AI 修复

## 5. 并行原则

适合采用 **3 轨并行 + 主代理集成**：

1. **Fragility Multi-Step Coverage**
   - 只改 `packages/page-intelligence`
2. **Runtime Generic Diagnostic Envelope**
   - 只改 `packages/runtime`
3. **Studio Unified Failure Insight**
   - 只改 `apps/studio`

主代理职责：

- 维护统一 envelope 契约
- 先并 runtime，再并 studio，避免 Studio 最终消费形状与 runtime 落盘不一致
- 统一完成 Node 20 验收与留痕

## 6. 为什么这是下一阶段

上一阶段已经证明 FlowWeave 更可能“点到正确元素”；Wave 6 的价值在于：

- **执行前**：更早看见高风险步骤
- **执行后**：失败时更快知道是定位问题、步骤约束问题，还是页面状态问题

这比继续机械加 fixture 更直接提升真实页面落地体验。
