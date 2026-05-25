# Flow DSL 规范（草案 v0.1）

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

| type | 说明 | 关键字段 |
|------|------|----------|
| `navigate` | 打开 URL | `url`, `waitUntil` |
| `click` | 点击元素 | `target`, `button` |
| `fill` | 输入文本 | `target`, `value`, `clear` |
| `select` | 下拉选择 | `target`, `values` |
| `press` | 键盘 | `key` |
| `wait` | 等待 | `ms` 或 `condition` |
| `assert` | 断言 | `assertion` |
| `screenshot` | 截图 | `name` |
| `extract` | 抽取变量 | `target`, `variable` |
| `apiCall` | 接口步骤（P3+） | `requestTemplateId` |

## 4. 元素定位（Target）

定位策略按优先级数组排列，执行时自上而下尝试：

```typescript
interface Target {
  strategies: LocatorStrategy[];
}

type LocatorStrategy =
  | { kind: "role"; role: string; name?: string }
  | { kind: "testId"; testId: string }
  | { kind: "css"; selector: string }
  | { kind: "xpath"; expression: string }
  | { kind: "text"; text: string; exact?: boolean };
```

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
  "variables": [
    { "name": "username", "type": "string", "required": true }
  ],
  "steps": [
    {
      "id": "s1",
      "type": "navigate",
      "url": "https://example.com/login"
    },
    {
      "id": "s2",
      "type": "fill",
      "target": {
        "strategies": [
          { "kind": "role", "role": "textbox", "name": "用户名" }
        ]
      },
      "value": "{{username}}"
    }
  ],
  "meta": {
    "createdAt": "2026-05-25T00:00:00.000Z",
    "updatedAt": "2026-05-25T00:00:00.000Z",
    "source": "recorded"
  }
}
```

## 8. 相关 ADR

- [ADR-0006: Flow DSL 与 Zod 版本化](../adr/0006-flow-dsl-zod-versioning.md)
