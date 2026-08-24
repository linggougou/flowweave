# Flow DSL 规范（草案 v0.2）

> 实现包：`@flowweave/flow-dsl` · `schemaVersion` 当前为 **1**

## 1. 设计目标

1. 人类可读、机器可校验。
2. 录制、执行、AI 生成共用同一套 **NormalizedStep**。
3. 与 npm 包版本解耦，通过 `schemaVersion` 独立演进。

## 2. 文档结构

```typescript
// 概念模型（实现见 packages/flow-dsl）

interface FlowDocument {
  schemaVersion: 1;
  id: string;
  projectId: string;
  name: string;
  description?: string;
  variables: VariableDef[];
  steps: NormalizedStep[];
  meta: {
    createdAt: string;
    updatedAt: string;
    source: "recorded" | "manual" | "ai";
  };
}
```

## 3. 步骤类型（NormalizedStep）

| type         | 说明                                     | 关键字段                   |
| ------------ | ---------------------------------------- | -------------------------- |
| `navigate`   | 打开绝对 URL 或基于 `baseUrl` 的相对路径 | `url`, `waitUntil`         |
| `click`      | 点击元素                                 | `target`, `button`         |
| `fill`       | 输入文本                                 | `target`, `value`, `clear` |
| `select`     | 下拉选择                                 | `target`, `values`         |
| `setChecked` | 设置 checkbox / radio 勾选状态           | `target`, `checked`        |
| `press`      | 键盘操作                                 | `key`, `target?`           |
| `upload`     | 文件上传                                 | `target`, `files`          |
| `wait`       | 显式等待                                 | `ms` 或 `condition`        |

### `wait` 条件

| condition     | 用途                  | 附加字段      |
| ------------- | --------------------- | ------------- |
| `networkidle` | 等待网络空闲          | 无            |
| `visible`     | 等待目标可见          | `target`      |
| `hidden`      | 等待目标隐藏          | `target`      |
| `attached`    | 等待目标挂载到 DOM    | `target`      |
| `detached`    | 等待目标从 DOM 移除   | `target`      |
| `urlIncludes` | 等待 URL 包含指定片段 | `urlIncludes` |

## 4. 元素定位（Target）

定位策略按优先级数组排列，执行时自上而下尝试：

```typescript
interface Target {
  strategies: LocatorStrategy[];
  hints?: TargetHints;
}

type LocatorStrategy =
  | { kind: "role"; role: string; name?: string }
  | { kind: "testId"; testId: string }
  | { kind: "css"; selector: string }
  | { kind: "xpath"; expression: string }
  | { kind: "text"; text: string; exact?: boolean };

type TargetHints = {
  tagName?: string;
  inputType?: string;
  nameAttr?: string;
  placeholder?: string;
  labelText?: string;
  textSample?: string;
};
```

`strategies` 是执行主入口，`hints` 用于稳定性分析、失败诊断和后续自愈扩展，不直接参与当前定位优先级。

## 5. 执行计划（ExecutablePlan）

由 runtime 在运行前从 `FlowDocument` 编译生成，包含：

- 解析后的变量绑定
- 每步超时、重试次数
- 定位策略链快照（可选冻结）

ExecutablePlan **不**作为用户手改格式长期存储；可缓存于执行实例目录。

## 6. 版本迁移

- 新增字段：尽量可选，保持 `schemaVersion` 不变。
- 破坏性变更：`schemaVersion++`，在 `flow-dsl` 提供 `migrateFlow(from, to)`。
- 每个迁移函数必须有 Vitest 覆盖。

## 7. 示例（简化 JSON）

```json
{
  "schemaVersion": 1,
  "id": "flow_demo_001",
  "projectId": "proj_demo",
  "name": "登录并打开首页",
  "variables": [{ "name": "username", "type": "string", "required": true }],
  "steps": [
    {
      "id": "s1",
      "type": "navigate",
      "url": "/login"
    },
    {
      "id": "s2",
      "type": "fill",
      "target": {
        "strategies": [{ "kind": "role", "role": "textbox", "name": "用户名" }],
        "hints": {
          "tagName": "input",
          "nameAttr": "username",
          "placeholder": "请输入用户名"
        }
      },
      "value": "{{username}}"
    },
    {
      "id": "s3",
      "type": "wait",
      "condition": "urlIncludes",
      "urlIncludes": "/dashboard"
    }
  ],
  "meta": {
    "createdAt": "2026-05-25T00:00:00.000Z",
    "updatedAt": "2026-05-25T00:00:00.000Z",
    "source": "recorded"
  }
}
```

## 8. 当前边界

- 上表中的 8 类步骤是 `schemaVersion: 1` 当前真实支持的 DSL 范围。
- `press` 的 `target` 为可选；未提供时，后续 runtime 可按页面级键盘操作解释。
- `upload.files` 当前约定为本地文件路径数组，后续由 runtime 负责映射到 Playwright `setInputFiles`。
- 变量插值、`baseUrl` 拼接、登录态注入与诊断落盘由 runtime / environment 轨道承接，本文件只冻结数据契约。

## 9. 后续阶段候选能力

以下能力仍处于规划中，**不属于当前 schema 实现范围**：

- `assert`
- `screenshot`
- `extract`
- `apiCall`

## 10. 相关 ADR

- [ADR-0006: Flow DSL 与 Zod 版本化](../adr/0006-flow-dsl-zod-versioning.md)

## 11. vNext-0 设计状态（尚未实现）

当前生产真源仍是本文件上文定义的 `schemaVersion: 1`。vNext-0 设计门禁已提出 `schemaVersion: 2` 候选，但在后续实施、测试和路线锁再次解冻前，任何 recorder、runtime、Studio、导入导出或知识库入口都不得把该候选当作已支持能力。

冻结候选的关键差异：

1. `steps[]` 新增线性 `type: "input"` 节点。
2. v2 删除顶层 `variables[]`，以 `input.fields[]` 作为字段定义唯一真源。
3. 输入步骤的 `id` 在会话协议中称 `inputNodeId`；字段用不可变 `fieldId`。
4. 绑定只允许白名单槽位中的完整 `{{fieldId}}`，不再递归插值整个 step，不允许混合字符串或表达式。
5. v1 默认继续按 v1 读取和执行；升级必须预览、确认、携带 `expectedRevision` 并原子保存，不能静默升级。
6. 老 Runtime 必须在浏览器、运行目录或数据库副作用前拒绝 v2。

设计真源：

- [Flow Schema、迁移与存储设计](../design-docs/vnext-flow-schema-migration.md)
- [ADR-0009：vNext 输入节点与 Flow Schema v2](../adr/0009-vnext-input-node-and-schema-versioning.md)
- [Runtime 输入会话设计](../design-docs/vnext-runtime-input-session.md)

该节只标记未来设计边界，不改变当前 `FLOW_SCHEMA_VERSION = 1`。
