# vNext Flow Schema、迁移与存储设计

状态：vNext-0 设计候选，尚未实现

适用里程碑：vNext-1A DSL v2、vNext-1B knowledge 原子保存

裁决日期：2026-08-24

## 1. 设计目标与边界

本设计只冻结“线性任务模板”的数据合同：在现有浏览器步骤序列中加入输入节点，让后续受控字段引用输入，并允许项目知识库安全保存、升级、导入、导出和回滚。

必须满足：

1. 输入字段定义只有一个规范真源。
2. 字段展示名称可修改，但既有绑定不漂移。
3. v1 Flow 默认保持 v1；升级必须由 Studio 显式触发并可回滚。
4. 老 Runtime 对 v2 必须在打开浏览器前拒绝，不能尝试降级执行。
5. 敏感字段可以持久化定义元数据，但敏感值不能进入 Flow、默认值、版本、导出、普通执行历史、最近值、错误或日志。
6. 第一版只支持线性步骤、整值绑定和受控绑定面，不引入表达式、条件、循环、子流程或通用节点图。

本文件是规范候选，不表示 `packages/*`、数据库、Local API 或 Studio 已实现下述能力。

## 2. 当前事实基线

| 边界 | 当前实现事实 | vNext 设计影响 |
| --- | --- | --- |
| Flow schema | `schemaVersion` 固定为 `1`；顶层 `variables[]`；步骤是浏览器动作与等待 | 加入输入节点并移除顶层变量属于破坏性变更 |
| 模板引用 | shared 使用 `{{token}}` 提取/插值；当前 token 可为点号、连字符或中文 | v2 可保留可读定界符，但不能继续按可变名称寻址 |
| recorder | 从步骤内引用反推 `variables[]`，变量默认是必填 string | recorder 不能同时再为 v2 生成第二份变量定义 |
| portability | v1 会按 `secret_*`、密码目标、上传路径和敏感 URL 启发式清理 | 这些规则只用于 v1 迁移/导出防护，不能代替 v2 的显式 `sensitive` |
| knowledge | `flows.document_json` 与 `flow_versions.document_json` 保存完整文档；保存前快照与当前更新尚未包在同一事务 | v2 保存、升级、恢复需要一个原子事务与并发修订号 |
| execution context | `variables_json` 当前原样持久化并被最近执行回填 | v2 不得复用该无策略序列化路径 |
| import | 先安全化，再用 SQLite immediate transaction 创建独立副本 | 保留“新副本、不覆盖”，增加版本分派与 v2 策略校验 |
| Local API | 录制同步 POST 会直接 parse/save；版本恢复无乐观并发参数 | v2 编辑保存与升级需要独立的 revision-aware 命令边界 |

## 3. 核心裁决

### 3.1 `schemaVersion` 升为 2

采用 `schemaVersion: 2`，不把输入节点伪装成 v1 可选字段。原因：

- `steps[]` 新增非浏览器节点，老 Runtime 不认识该联合类型；
- v2 删除顶层 `variables[]`，变量定义归属发生变化；
- `setChecked.checked` 等允许从字面量变为受控字段引用；
- v2 引用从可变变量名改为稳定 `fieldId`；
- v2 增加跨节点唯一性、先定义后消费、类型和敏感性约束。

保持 v1 会造成老 Runtime 忽略或误执行输入节点，风险高于一次显式升级。

### 3.2 输入字段是变量定义的唯一真源

v2 **移除顶层 `variables[]`**。每个变量只定义在一个 `input` 节点的 `fields[]` 中：

```text
FlowDocumentV2.steps[].type=input
└── fields[]                 ← 定义唯一真源
    ├── fieldId             ← 稳定机器身份
    ├── label               ← 输入节点内唯一的人类可读名称
    ├── type / required
    └── sensitive / remember / defaultValue

允许绑定槽位中的 {{fieldId}} ← 只引用，不复制字段定义
```

禁止以下双重真源：

- 同时保存 `variables[]` 与 `input.fields[]`；
- 在消费步骤上复制 `type`、`required` 或 `sensitive`；
- 单独持久化 `inputNodeId` 到字段定义。字段的归属由其所在输入节点决定；会话协议中的 `inputNodeId` 等于该输入步骤的 `id`。

### 3.3 绑定保留双大括号，但按 `fieldId` 寻址

规范引用是完整字符串 `{{<fieldId>}}`，例如 `{{field_018f5d92a7f44b5d}}`。

- 不再使用 `{{name}}`；`label` 重命名不会改绑定。
- 不引入 `{ kind: "field", fieldId: "..." }` 结构对象，避免第一版同时改写所有字符串步骤形态。
- 不允许 `"订单-{{field_x}}"`、`"/orders/{{field_x}}"` 等混合模板。
- v2 编译器只扫描白名单槽位，禁止继续对整个步骤对象递归插值。

双大括号只承担清晰的“字段引用”标记，不是表达式语言。

## 4. v2 规范结构

### 4.1 JSON 示例

```json
{
  "schemaVersion": 2,
  "id": "flow_create_hotel",
  "projectId": "project_demo",
  "name": "创建并打开酒店",
  "description": "演示线性输入节点与搜索选择关系",
  "steps": [
    {
      "id": "open_hotel_admin",
      "type": "navigate",
      "url": "https://admin.example.com/hotels/new"
    },
    {
      "id": "input_hotel_profile",
      "type": "input",
      "name": "本次酒店资料",
      "description": "这些信息只用于当前执行",
      "fields": [
        {
          "fieldId": "field_hotel_name_01",
          "label": "酒店名称",
          "description": "请输入后台中可搜索的完整名称",
          "placeholder": "例如：星海商务酒店",
          "type": "string",
          "required": true,
          "sensitive": false,
          "remember": "lastValue"
        },
        {
          "fieldId": "field_admin_password_01",
          "label": "管理员密码",
          "placeholder": "请输入本次运行使用的密码",
          "type": "string",
          "required": true,
          "sensitive": true,
          "remember": "never"
        }
      ]
    },
    {
      "id": "fill_hotel_name",
      "type": "fill",
      "target": {
        "strategies": [{ "kind": "role", "role": "textbox", "name": "酒店名称" }]
      },
      "value": "{{field_hotel_name_01}}"
    },
    {
      "id": "fill_admin_password",
      "type": "fill",
      "target": {
        "strategies": [{ "kind": "css", "selector": "input[type=password]" }],
        "hints": { "inputType": "password" }
      },
      "value": "{{field_admin_password_01}}"
    },
    {
      "id": "search_hotel",
      "type": "fill",
      "target": {
        "strategies": [{ "kind": "role", "role": "textbox", "name": "搜索酒店" }]
      },
      "value": "{{field_hotel_name_01}}"
    },
    {
      "id": "select_hotel_result",
      "type": "click",
      "target": {
        "strategies": [{ "kind": "role", "role": "link", "name": "{{field_hotel_name_01}}" }]
      },
      "selectionContext": { "searchStepId": "search_hotel" }
    }
  ],
  "meta": {
    "createdAt": "2026-08-24T00:00:00.000Z",
    "updatedAt": "2026-08-24T00:00:00.000Z",
    "source": "manual"
  }
}
```

示例中的密码值不会出现在 JSON；文档只保存其字段定义。

### 4.2 Zod 伪 schema

```typescript
// flowId、projectId 与既有浏览器 stepId 延续 v1 的 opaque 非空合同，
// v1→v2 不因格式偏好改写资产身份；全局 refine 仍要求 stepId 唯一。
const legacyOpaqueId = z.string().min(1);

// 只有 v2 新建的身份采用收紧格式。
const v2GeneratedId = z.string()
  .min(9)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/);

const inputNodeId = v2GeneratedId.regex(/^input_/);
const fieldId = v2GeneratedId.regex(/^field_/);
const scalar = z.union([z.string(), z.number().finite(), z.boolean()]);

const inputFieldV2Schema = z.object({
  fieldId,
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  placeholder: z.string().trim().min(1).max(200).optional(),
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean(),
  sensitive: z.boolean(),
  remember: z.enum(["never", "lastValue"]),
  defaultValue: scalar.optional(),
}).strict().superRefine(validateFieldPolicy);

const inputStepV2Schema = z.object({
  id: inputNodeId,
  type: z.literal("input"),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  fields: z.array(inputFieldV2Schema).min(1).max(50),
}).strict().superRefine(validateInputNodeLabelUniqueness);

const selectionContextSchema = z.object({
  searchStepId: legacyOpaqueId,
}).strict();

const flowDocumentV2Schema = z.object({
  schemaVersion: z.literal(2),
  id: legacyOpaqueId,
  projectId: legacyOpaqueId,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  steps: z.array(z.discriminatedUnion("type", [
    inputStepV2Schema,
    navigateV2Schema,
    clickV2Schema,
    fillV2Schema,
    selectV2Schema,
    setCheckedV2Schema,
    pressV2Schema,
    scrollV2Schema,
    uploadV2Schema,
    waitV2Schema,
  ])).min(1).max(1000),
  meta: flowMetaSchema,
}).strict().superRefine(validateFlowV2References);
```

实际实现应把结构校验与跨字段校验分开，以便错误能精确定位到 JSON path；不得把所有问题折叠成“Flow 格式无效”。

### 4.3 身份与名称规则

| 字段 | 规则 | 是否可修改 | 用途 |
| --- | --- | --- | --- |
| `Flow.id` / `projectId` | 延续 v1 的非空 opaque string；读写边界另做业务归属校验 | 升级时不改 | 资产与项目身份 |
| 既有浏览器 `steps[].id` | 延续 v1 的非空 opaque string，但 v2 Flow 内必须全局唯一 | 升级时不改 | 进度、日志、版本 diff |
| 输入步骤 `id` | 必须以 `input_` 开头；会话中称 `inputNodeId` | 创建后不可变 | 输入请求身份 |
| `fieldId` | Flow 内全局唯一，必须以 `field_` 开头 | 创建后不可变 | 绑定、提交、最近值键 |
| 输入节点 `name` | 1-80 字符的用户可见名称 | 可修改 | Studio 卡片与运行态标题 |
| 字段 `label` | 1-80 字符；按 `trim + Unicode NFKC + lowercase` 后在同一 input 节点内唯一，不同 input 节点可重复；不承担机器寻址 | 可修改 | 表单标签；UI 始终以“节点名 / 字段标签”展示来源并消歧 |
| 字段 `placeholder` | 可选，1-200 字符的作者提示 | 可修改 | 仅作输入 UI 提示，不参与求值 |

新建 v2 身份使用不可预测 UUID/ULID 后缀，例如 `input_<uuid>`、`field_<uuid>`。新建浏览器步骤也应使用安全生成器，但 parser 不用新的格式偏好拒绝历史 ID。迁移身份使用 `SHA-256(flowId + variableIndex + originalName)` 的前 20 个小写十六进制字符，确保重复预览得到同一候选；哈希仅用于稳定身份，不用于安全鉴权。

v1→v2 默认不改 `flowId`、`projectId` 或既有浏览器 `step.id`。历史 stepId 重复时，因为进度、版本 diff 与 `selectionContext` 无法唯一寻址，迁移预览返回阻塞项，由 Studio 提供显式逐项修复；不得静默重写。输入大小上限承担 opaque ID 的总体资源限制，后续可在不改变身份的前提下单独增加控制字符显示防护。

名称改变时不重写绑定；只有显式的“重新生成身份”危险操作才会改变 `fieldId`，第一版 UI 不提供该操作。

### 4.4 字段策略

1. `defaultValue` 的运行时类型必须与 `type` 完全一致；不做 `"1" → 1` 隐式转换。
2. `number` 必须是有限数；不接受 `NaN`、`Infinity` 或字符串数字。
3. `sensitive: true` 时：
   - `type` 第一版必须为 `string`；
   - `remember` 必须为 `never`；
   - `defaultValue` 必须缺失；
   - 只能绑定到 `fill.value`；
   - 导出、版本、执行历史与最近值只保留元数据，不保留值。
4. 新建字段的 `remember` 默认由 Studio 显式写成 `never`；schema 不用 `.default()` 隐式补值。
5. `required: false` 的字段若被消费，必须有 `defaultValue`；否则执行前编译失败。未消费的可选字段允许保存，但 Studio 给出“未被使用”警告。
6. `remember: lastValue` 只允许非敏感字段，表示项目知识库最多保存一份最近接受值，不表示保存每次执行的值。
7. `placeholder` 是可持久化的展示元数据，不是默认值、最近值或提交值；Runtime 不把它放入字段值映射。敏感字段可以有不含秘密的作者提示，但不得从录制 DOM、历史输入或 default 推导，也不得包含字段引用。Studio 必须把它标注为“提示文字”，不能预填到输入框 value。
8. `label` 的唯一性作用域仅是其所属 input 节点。比较键为 `label.trim().normalize("NFKC").toLowerCase()`；同节点碰撞拒绝保存，跨节点同名合法。任何来源选择器、错误反馈和绑定摘要都同时显示节点名与字段标签，不能只显示 label。

## 5. 绑定与搜索选择合同

### 5.1 白名单绑定面

| 消费槽位 | 允许字段类型 | 敏感字段 | 附加规则 |
| --- | --- | --- | --- |
| `fill.value` | string、number | 允许 | number 在执行边界显式格式化为十进制字符串 |
| `select.values[0]` | string | 禁止 | 有字段引用时 `values` 必须恰好一项 |
| `setChecked.checked` | boolean | 禁止 | schema 允许 boolean 字面量或完整字段引用 |
| `navigate.url` | string | 禁止 | 引用值必须是完整 URL 或现有 baseUrl 可解析的完整相对 URL |
| `wait.urlIncludes` | string | 禁止 | 仅在 `condition=urlIncludes` 时允许 |
| `target.strategies[kind=role].name` | string | 禁止 | `role` 本身不可绑定 |
| `target.strategies[kind=text].text` | string | 禁止 | `exact` 保持字面 boolean |

明确禁止绑定：CSS selector、XPath、testId、target hints、上传文件、`press.key`、滚动坐标、等待毫秒、步骤 ID、节点/字段名称和描述。

### 5.2 跨节点规则

解析一个引用时必须同时满足：

1. `fieldId` 恰好存在一次；
2. 其输入节点在消费步骤之前；
3. 槽位在白名单中；
4. 类型与敏感策略匹配；
5. 字符串中不含第二个引用或任何前后字面文本；
6. 可选字段具备默认值；
7. 输入节点与消费步骤均属于同一 Flow。

不允许未来节点引用、跨 Flow 引用、按 `name` 猜测、重复 `fieldId` 后取第一个或缺失值后保留占位符。

### 5.3 搜索后选择的显式关系

第一版不引入“智能实体选择”节点。允许 `click` 或带目标的 `press` 增加：

```json
"selectionContext": { "searchStepId": "search_hotel" }
```

它是可诊断的语义元数据，不改变线性执行顺序。校验要求：

- `searchStepId` 指向同一 Flow 中更早的 `fill` 或 `select`；
- 被指向步骤必须消费一个非敏感 string 字段；
- 当前选择步骤必须有 target；
- 一个选择步骤第一版只声明一个搜索来源；
- 删除或移动搜索步骤到选择步骤之后时，保存失败并定位该依赖。

Studio 因而能区分“搜索词已参数化”和“结果选择仍是静态目标”，不靠相邻步骤猜测关系。Runtime 仍按原步骤顺序执行。

## 6. v1 / v2 兼容矩阵

| 操作方 / 操作 | v1 | v2 |
| --- | --- | --- |
| v1 Studio / Runtime | 正常读取与执行 | 在打开浏览器和分配运行目录前以 `FLOW_SCHEMA_VERSION_UNSUPPORTED` 拒绝 |
| vNext 通用读取 | 版本分派读取 | 版本分派读取 |
| vNext Studio 编辑 | 只读；提示显式升级 | 可编辑 |
| vNext Runtime | 保留 legacy v1 执行路径 | 使用输入会话执行路径 |
| recorder 同步 | 继续生成/保存 v1 | 不直接生成 v2；由 Studio 升级 |
| 新版导入 | 按 v1 规则安全化后创建 v1 新副本 | 按 v2 显式敏感策略校验后创建 v2 新副本 |
| 新版导出 | 保持 v1 | 保持 v2；无运行值 |
| 导出为旧格式 | 原样 v1 | 不支持自动降级，返回 `FLOW_DOWNGRADE_UNSUPPORTED` |
| 版本恢复 | 恢复为 v1，编辑器回到只读升级态 | 恢复为 v2 |
| 未知 `schemaVersion > 2` | 不适用 | 全部入口只读拒绝，不猜测兼容 |

`parseFlowDocument` 必须改成版本分派器，分别返回 `FlowDocumentV1 | FlowDocumentV2`。任何写入口先分派再使用对应严格 schema；不得把 v2 丢给 v1 schema，也不得 strip 掉未知字段后继续。

## 7. v1 → v2 显式升级

### 7.1 两阶段命令

升级分为“预览”和“提交”，预览无写入：

1. Studio 请求迁移预览，携带 `flowId` 与当前 `revision`。
2. DSL 生成 v2 候选、字段/引用映射、警告、阻塞项和 `reportFingerprint`。
3. Studio 展示新增输入节点、字段敏感性、被移除默认值、无法迁移的位置与历史清理范围。
4. 只有 `blockingIssues=[]` 且用户确认后，提交同一 fingerprint 与 `expectedRevision`。
5. knowledge 在一个 immediate transaction 内复核 revision、重算 fingerprint、清理敏感历史、写入可回滚版本并替换当前文档。
6. 任一步失败整笔回滚；不能留下 v2 当前文档、v1 版本或清理一半的历史。

导入 v1、打开 v1 或 recorder 同步都不能自动触发并持久化升级。

### 7.2 确定性映射

- 在第一个浏览器步骤前插入一个 `input_<hash>` 节点，名称为“运行前输入”。
- 每个 v1 `variables[index]` 生成唯一 `field_<hash>`。
- v1 variable `name` 只用于生成稳定 fieldId、建立旧引用映射并初始化 `label`；label 去除首尾空白后最多保留 80 字符，截断时产生不含原值之外附加数据的结构化告警。截断或 Unicode 规范化若在迁移输入节点内造成 label 冲突，预览按原变量顺序追加 `（2）`、`（3）` 等确定性后缀并保持 80 字符上限，作者可在确认页修改。v2 不保存第二个字段 name。
- v1 没有规范 placeholder；迁移结果一律不从 target hints、DOM 样本、default 或历史输入推导 placeholder，作者可在确认页手动填写安全提示。
- 所有完整 `{{v1Name}}` 引用改写为对应 `{{fieldId}}`。
- 非敏感变量默认 `sensitive:false`；显式升级为了保持现有回填心智，将其 `remember` 设为 `lastValue`，Studio 必须展示这一策略，用户可改为 `never` 后再提交。
- v1 `secret_*`、密码目标引用、上传位置引用、敏感 URL 参数引用按现有 portability 规则标记为迁移敏感候选：最终写为 `sensitive:true`、`remember:never`，移除默认值。
- 命名启发式只用于 v1 迁移告警；v2 运行和持久化只相信字段的显式 `sensitive`。

### 7.3 阻塞而不是猜测

下列情况迁移预览必须返回阻塞项，不写任何内容：

- v1 变量名重复；
- 引用未声明变量；
- 混合模板、一个槽位多个模板或引用位于 v2 禁止槽位；
- 默认值类型与声明类型不一致；
- 敏感变量被用于非 `fill.value` 槽位；
- v1 文档、历史版本或执行上下文无法安全解析；
- 既有 stepId 重复，或生成后仍存在重复 ID、未来引用、搜索依赖断裂。

用户可以继续用 v1 执行，或先在受控编辑界面修复；不能用“尽力迁移”产出语义不明的 v2。

### 7.4 旧敏感数据清理

当前 v1 可能已在变量默认值、版本或 `executions.variables_json` 中保存敏感值。升级提交必须执行以下强制清理：

1. 不把已识别敏感默认值或密码字面量复制到 v2。
2. 写入回滚版本前先生成“安全化 v1 快照”；已识别敏感默认值被移除，因此回滚恢复的是可再次输入的 v1，而不是秘密副本。
3. 同一事务清除当前 Flow 对应历史版本和执行记录中已识别字段的值；只记录清理条数和字段身份，不记录原值。
4. 任一历史 JSON 无法安全重写时整次升级失败，不留下部分清理。
5. 应用无法清理用户自行复制的数据库备份或外部导出；确认界面必须明确这个边界。

这是显式升级的一部分，不是后台静默清理。安全清理不可恢复；Flow 结构仍可通过安全化 v1 快照回滚。

## 8. 保存、版本、导入导出与回滚

### 8.1 原子保存

v2 保存合同为：

```typescript
saveFlowRevision({
  projectId,
  flowId,
  document,
  expectedRevision,
  changeMessage,
}): { revision: number; updatedAt: string }
```

规范物理字段名是 `expectedRevision`，值为读取 Flow 时得到的整数 `revision`；产品界面可将它称为“期望基线版本”，但 IPC、Local API、repository 与测试 fixture 不得再引入 `expectedBaselineVersion` 等同义字段。

数据库为 `flows` 增加单调递增 `revision`。一个 immediate transaction 内：

1. 严格解析并执行全部跨节点校验；
2. 校验 path 中的 `projectId/flowId` 与文档身份一致；
3. 比较 `expectedRevision`，冲突时不覆盖；
4. 当前 JSON 有变化时，把当前安全文档写入 `flow_versions`；
5. 更新当前文档、schema version、revision 与时间；
6. 对已删除、改为敏感或改为 `remember:never` 的字段清除最近值；
7. 提交后再通知 renderer。

文档未变化时不建版本，但仍返回当前 revision。事务错误对外只返回稳定错误码与路径，不返回文档片段或字段值。

### 8.2 版本恢复

- 版本行必须记录文档内 schema version、来源 revision 与创建时间。
- 恢复前验证 version 同属 `projectId + flowId`。
- 恢复也要求 `expectedRevision`，并在同一事务先快照当前安全文档，再写目标版本。
- 恢复 v1 不自动升级；当前 Flow 回到 v1，vNext 编辑器只读。
- 恢复导致字段删除或敏感策略收紧时，同一事务清除对应最近值。
- 恢复失败时当前 Flow、版本序号与最近值全部不变。

### 8.3 导入

- 请求体大小上限继续在解析前执行。
- v1 使用 v1 portability 规则，创建 v1 独立副本；不隐式升级。
- v2 使用严格 v2 schema；因为敏感 default 从结构上非法，导入不能“带入再清理”。
- 每次导入生成新 flowId、revision=1、目标 projectId 和递增名称，不覆盖来源或同名资产。
- 不导入版本历史、最近值、执行历史、会话或本地路径资产。
- 整个导入在一个 immediate transaction 内，失败无 Flow、版本或最近值半成品。

### 8.4 导出

- 默认导出当前 Flow 的同版本安全副本。
- v2 导出只含字段元数据（包括安全的 `placeholder`）与 `{{fieldId}}` 引用，不含最近值或会话输入。版本快照同样只保存 placeholder 元数据；它从不承担输入值预填。
- export portability 仍处理绝对上传路径、URL userinfo 等本地/敏感字面量；但 v2 敏感判断以显式 `sensitive` 为准。
- v2 不提供自动 v1 降级。移除输入节点会改变暂停时点，按名称重建 `variables[]` 也会破坏稳定身份，不能伪装为无损导出。

### 8.5 Local API 边界候选

| 命令 | 作用 | 核心防护 |
| --- | --- | --- |
| 既有 `POST /projects/:id/flows` | recorder v1 同步 | 只接受 v1；维持兼容 |
| `PUT /projects/:id/flows/:flowId` | Studio v2 保存 | 规范字段 `expectedRevision`、严格身份匹配、原子版本 |
| `POST /projects/:id/flows/:flowId/upgrade-previews` | 生成迁移预览 | 只读、无副作用 |
| `POST /projects/:id/flows/:flowId/upgrades` | 提交升级 | revision + fingerprint + 用户确认 |
| `POST /projects/:id/flow-versions/:versionId/restore` | 恢复版本 | 增加 expectedRevision；原子快照/恢复 |
| 既有 `POST /projects/:id/flow-imports` | 导入独立副本 | 版本分派、大小上限、失败无写入 |

所有写命令只接受 JSON，校验 Origin 之外还需沿用 Electron/本地服务的既有可信调用边界；不得为了 v2 开放 renderer 任意数据库路径。

## 9. 最近值与执行历史

### 9.1 最近值存储

新增逻辑表 `flow_field_recent_values(flow_id, field_id, value_json, updated_at)`，主键为 `(flow_id, field_id)`：

- 只允许当前 Flow 中 `sensitive:false && remember:lastValue` 的字段；
- 每个字段最多一行，不保存历次值；
- 输入请求被当前会话接受后才可 upsert；重复、过期、取消或跨会话提交不得写入；
- 写入前按当前 revision 再校验字段策略，策略已收紧则删除旧值而不是写入；
- Flow 删除、字段删除、改敏感、改 `never`、版本恢复或安全迁移时受控清理；
- 读取结果仅供对应 Flow 的输入 UI，不能通过普通 execution detail 返回。

`value_json` 必须按字段类型 parse/serialize；不得存对象、数组、文件路径或任意 JSON。

### 9.2 普通执行历史

v2 的 `ExecutionRunContext` 不再保存原始输入映射。允许持久化：

- `flowRevision`；
- 使用过的 `inputNodeId` / `fieldId` 列表；
- 哪些字段已提供、来自 default 或最近值的非值状态；
- 已脱敏的环境名称与 baseUrl。

禁止持久化：

- 任意 `sensitive:true` 字段值；
- `remember:never` 字段值；
- renderer 输入草稿；
- IPC payload、运行时内存对象的 JSON dump；
- 含输入值的错误、步骤快照、DOM/HAR 诊断或日志。

Flow 只要声明任一敏感字段，Runtime 整个会话就必须关闭 HAR。首次敏感提交被原子接受后，会话进入不可逆敏感作用域，后续 screenshot、page snapshot 与 DOM 诊断全部关闭；错误与诊断始终不得携带 resolved step、locator、URL 或输入。Runtime 持久化结果必须附结构化 artifact policy 声明（attestation），其物理字段与枚举以 G3 Runtime 会话规范最终稿为准。knowledge 只能把该声明与会话敏感状态、步骤时序和 artifact refs 交叉校验：禁用期出现产物引用、声明缺失或状态矛盾时拒绝整条执行落盘。

artifact policy 声明只证明调用方声称执行了哪项策略，**不能证明文件内容中没有秘密**。因此安全验收还必须对数据库、运行目录、导出文件、错误和日志注入唯一 canary 敏感值并做独立扫描；策略声明校验与 canary 内容扫描任一失败都不得通过发布门禁。

## 10. 错误分类

| 错误码候选 | 时机 | 对外安全信息 |
| --- | --- | --- |
| `FLOW_SCHEMA_VERSION_UNSUPPORTED` | 版本分派 | 仅返回收到/支持的版本号 |
| `FLOW_V2_STRUCTURE_INVALID` | Zod 结构校验 | 返回 JSON path 与规则，不回显值 |
| `FLOW_DUPLICATE_ID` | 步骤或 fieldId 重复 | 返回冲突路径与 ID；不返回字段值 |
| `FLOW_DUPLICATE_LABEL` | 同一 input 节点内规范化 label 重复 | 返回节点与冲突字段路径；不同节点同名不报错 |
| `FLOW_FIELD_REFERENCE_UNKNOWN` | 引用不存在 | 返回消费路径与 fieldId |
| `FLOW_FIELD_REFERENCE_FUTURE` | 消费早于输入节点 | 返回消费步骤与 inputNodeId |
| `FLOW_BINDING_TARGET_FORBIDDEN` | 禁止槽位出现引用 | 返回槽位路径 |
| `FLOW_BINDING_MIXED_TEMPLATE_FORBIDDEN` | 混合或多个引用 | 返回槽位路径 |
| `FLOW_BINDING_TYPE_MISMATCH` | 类型不匹配 | 返回期望/实际类型与 fieldId |
| `FLOW_SENSITIVE_POLICY_INVALID` | sensitive/default/remember/消费冲突 | 返回规则与 fieldId，不回显值 |
| `FLOW_SELECTION_CONTEXT_INVALID` | 搜索选择依赖无效 | 返回选择步骤与 searchStepId |
| `FLOW_UPGRADE_BLOCKED` | 迁移存在阻塞项 | 返回结构化 issues 与报告 fingerprint |
| `FLOW_REVISION_CONFLICT` | 保存/恢复/升级竞态 | 返回 expected/current revision |
| `FLOW_DOWNGRADE_UNSUPPORTED` | 请求 v2→v1 | 说明不能无损降级 |
| `FLOW_PERSISTENCE_FAILED` | 原子事务失败 | 通用失败信息；内部日志也不得含值 |

错误对象禁止包含 Flow 全文、输入 payload、defaultValue 原值、SQLite SQL 文本或绝对数据库路径。

## 11. 测试合同

### 11.1 DSL 红灯测试

1. 最小 v2、多个输入节点、同字段多消费可 parse。
2. v2 顶层出现 `variables` 被 strict schema 拒绝。
3. inputNodeId、fieldId 和步骤 ID 重复分别拒绝。
4. 同一 input 节点的规范化 label 重复被拒绝；不同 input 节点同 label 通过，展示合同为“节点名 / label”。
5. 字段 label 改名后 `{{fieldId}}` 绑定保持不变。
6. 未知、未来、跨 Flow、按旧 name 引用分别拒绝。
7. 所有允许绑定面按类型通过；所有禁止面拒绝。
8. 混合模板、多个模板、缺失可选值拒绝进入可执行计划。
9. sensitive + default、sensitive + lastValue、sensitive 非 fill 消费拒绝。
10. `selectionContext.searchStepId` 的顺序、步骤类型和字段来源校验。
11. v1 与 v2 版本分派正确，未知版本不 strip、不降级。

### 11.2 迁移测试

1. 同一 v1 与 revision 重复预览生成相同 inputNodeId、fieldId、候选 JSON 和 fingerprint。
2. 合法 `{{name}}` 完整引用全部重写为 `{{fieldId}}`。
3. 重复名、未知引用、混合模板、禁止槽位、错误默认类型均阻塞且零写入。
4. `secret_*`、密码目标、上传与敏感 URL 启发式只影响迁移结果；v2 不再依赖命名。
5. 敏感 default/历史值被清理，报告仅含计数与身份。
6. v1 默认不升级；导入和 recorder 同步后仍是 v1。
7. 老 Runtime 在任何浏览器/目录副作用前拒绝 v2。

### 11.3 knowledge / API 测试

1. 保存“版本快照 + 当前更新 + revision + 最近值清理”原子成功。
2. 在每个 SQL 操作点故障注入，事务回滚后当前 JSON、版本数、revision、最近值均不变。
3. 两个 expectedRevision 并发保存只有一个成功，另一个返回冲突且不覆盖。
4. v1→v2 升级故障注入确保文档、历史清理和版本快照全有或全无。
5. 恢复 v1/v2 都先保存当前版本；恢复 v1 后不自动升级。
6. 导入 v1/v2 创建独立副本；无效版本、超限、非法敏感 default 无副作用。
7. v2 导出往返同构；最近值、执行输入和项目本地路径不在文件中。
8. sensitive 或 remember=never 的提交不产生最近值/variables_json；策略收紧立即清理旧值。
9. artifact policy 声明与会话敏感状态、步骤时序、artifact refs 一致；另以唯一 canary 扫描数据库、运行目录、导出、错误、日志和 HTTP 响应，二者独立通过。
10. Local API 路径身份、文档身份、version 归属和 revision 均做负向测试。

### 11.4 性质与模糊测试

- 任意合法 v2：`parse(JSON.parse(JSON.stringify(doc)))` 保持语义同构。
- 任意已成功迁移候选再次预览不生成不同 ID。
- 任意引用要么唯一解析到更早字段，要么明确失败；不存在“保留原占位符继续”。
- 任意事务故障点不会产生半版本或半清理。
- 以随机大括号、深层 JSON、超长 ID、Unicode 名称和重复键模糊测试 parser，限制文档大小和节点/字段数量。

## 12. 分阶段实施建议与回滚点

### vNext-1A：DSL v2、版本分派与纯迁移器

- 红灯：schema、引用矩阵、敏感策略、兼容矩阵、迁移确定性。
- 最小交付：只在 `flow-dsl/shared` 提供 v1/v2 联合解析、v2 编译校验、纯函数迁移预览；不写数据库。
- 回滚点：保留 v1 parser、v1 recorder 与 v1 Runtime 默认路径；关闭 v2 feature gate 即无持久化变化。
- 退出门禁：包测试/类型检查通过，迁移 fixture 全部确定，无关键 TODO。

### vNext-1B：knowledge 原子保存、安全历史与 Local API

- 红灯：事务故障注入、revision 冲突、敏感哨兵、导入导出、跨版本恢复。
- 最小交付：数据库 revision、原子 save/restore/upgrade、最近值单行存储、v2 安全 execution context、受控 API。
- 回滚点：迁移可回滚；若 feature gate 关闭，v1 读写继续；已生成的 v2 Flow 保持可读但不可由旧版执行。
- 退出门禁：所有写路径全有或全无，敏感值扫描为零，v1 回归通过。

### 后续 Runtime / Studio 接入

- Runtime 只能消费 vNext-1A 产出的可执行计划，不自行猜测字段或遍历 JSON 插值。
- Electron 提交只用 `inputNodeId + fieldId`；值在验证后进入会话内存。
- Studio 编辑只创建 input.fields 与白名单引用，不恢复顶层 variables。
- 纵向 E2E 通过前不得默认创建 v2，也不得移除 v1 执行路径。

## 13. 已裁决的非目标

- 不支持结构表达式、计算字段、混合字符串模板或字段转换管道。
- 不支持 input 字段从网页提取、跨 Flow、跨会话或云端共享。
- 不支持 v2 自动降级为 v1。
- 不支持敏感默认值、敏感最近值或秘密托管。
- 不支持自动把任意 CSS/XPath/testId 参数化。
- 不借本次 schema 变更引入条件、循环、子流程、批量或 AI 节点。
