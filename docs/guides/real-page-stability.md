# 真实页面稳定性指南

本文档对应 2026-06-06 “真实页面稳定性增强”计划中的 **Task 0 / Foundation**，目标是在不改动 runtime 业务逻辑的前提下，先冻结跨包共享的数据契约，给后续 Recorder、Runtime、Environment、Diagnostics 轨道提供单一事实来源。

## 1. 本轮冻结的接口

### Flow DSL

当前 `schemaVersion: 1` 已统一支持以下步骤：

- `navigate`
- `click`
- `fill`
- `select`
- `setChecked`
- `press`
- `upload`
- `wait`

其中有三点需要特别注意：

1. `navigate.url` 允许绝对 URL，也允许依赖运行时 `baseUrl` 的相对路径。
2. `wait` 不再只限于毫秒等待，已经预留 `networkidle`、目标显隐/挂载、`urlIncludes` 等条件接口。
3. `Target` 新增 `hints` 字段，用于承载录制上下文和失败诊断证据。

### Runtime 执行参数

`packages/runtime/src/types.ts` 中的 `ExecutionOptions` 已冻结以下字段：

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
  cookies?: ExecutionCookie[];
  environmentName?: string;
};
```

约定说明：

- `baseUrl`：供相对路径 `navigate` 拼接。
- `variables`：供 `fill`、`select`、`press` 等字符串字段后续做 `{{variable}}` 插值。
- `storageStatePath`：供带登录态页面复用 Playwright storage state。
- `cookies`：供显式追加会话或环境 Cookie。
- `environmentName`：供执行记录、诊断报告和 Studio 展示使用。

### Project Environment

`packages/project-knowledge/src/types.ts` 中的 `ProjectEnvironment` 新增：

```ts
type ProjectEnvironment = {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  isDefault: boolean;
  storageStatePath?: string;
};
```

这意味着环境模型已经能表达“基础地址 + 登录态文件”的最小组合，后续 Environment 轨道只需要把仓储、Studio 表单和 runtime 注入打通。

## 2. Target hints 约定

`Target.hints` 当前支持以下字段：

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

使用原则：

- `strategies` 仍是唯一定位入口。
- `hints` 只用于诊断、脆弱性分析和后续自愈扩展，不参与当前优先级排序。
- 录制层应尽量补齐真实上下文，但不要求每个字段都存在。

## 3. wait 步骤约束

为避免后续运行时各自解释，Foundation 轨道先固定以下规则：

- `wait` 至少要提供 `ms` 或 `condition` 之一。
- `condition` 为 `visible`、`hidden`、`attached`、`detached` 时必须提供 `target`。
- `condition` 为 `urlIncludes` 时必须提供 `urlIncludes` 字段。

示例：

```json
{
  "id": "s3",
  "type": "wait",
  "condition": "visible",
  "target": {
    "strategies": [{ "kind": "text", "text": "保存成功" }]
  }
}
```

## 4. 对后续轨道的协作要求

- Recorder 轨道：只生成本轮 DSL 已支持的步骤，不要再把 `assert`、`extract` 等规划能力写进录制结果。
- Runtime 轨道：按这里冻结的字段实现 `baseUrl`、变量替换、`storageStatePath`、`cookies` 与增强版 `wait`。
- Environment 轨道：只在 `ProjectEnvironment.storageStatePath` 基础上做存取与 UI 贯通，不要另起新环境模型。
- Diagnostics 轨道：优先复用 `Target.hints` 和 `environmentName`，避免重复定义诊断上下文字段。

## 5. 当前非目标

以下能力仍未进入当前 schema 实现：

- `assert`
- `screenshot`
- `extract`
- `apiCall`

如果后续要引入这些步骤，必须先更新 `flow-dsl` schema、测试与本指南，再进入运行时实现。
