# ADR-0009: vNext 输入节点与 Flow Schema v2

## 状态

提议冻结（2026-08-24，vNext-0 设计阶段；尚未实现）

## 背景

Flow v1 以顶层 `variables[]` 描述运行前变量，以线性 `steps[]` 描述浏览器动作。shared 和 Runtime 使用 `{{name}}` 做递归字符串插值，recorder 还会从步骤引用反推顶层变量。

vNext 需要在线性流程中显式表达“运行到此处收集字段”，并在 Studio、Runtime、Electron、版本和执行历史之间稳定识别输入节点与字段。若继续同时维护顶层变量与输入节点字段，会出现类型、默认值、敏感性和来源归属的双重真源；若仍按可变 name 绑定，重命名会漂移；若保持 schemaVersion 1，老 Runtime 可能误处理新节点。

## 决策

1. vNext 使用 `schemaVersion: 2`。
2. `steps[]` 增加 `type: "input"` 的线性输入节点。
3. 输入步骤的 `id` 是其稳定身份，会话协议中规范称为 `inputNodeId`；文档不重复保存第二个 `inputNodeId` 字段。
4. 输入字段定义只存在于 `input.fields[]`。字段包含稳定 `fieldId`、人类可读名称 `label`、仅作 UI 提示的可选 `placeholder`、类型、必填、默认值、显式敏感性与记忆策略。label 只要求在同一 input 节点内规范化唯一，不同 input 节点可重复，UI 始终以“节点名 / label”消歧。v2 不再保存字段 name；placeholder 不参与求值，不得从录制 DOM、历史输入或 default 推导。
5. v2 删除顶层 `variables[]`，strict schema 拒绝该字段，禁止双重定义。
6. 绑定保留双大括号外观，但只允许白名单槽位中的完整 `{{fieldId}}`；不按 name 绑定、不允许混合模板、不引入结构表达式。
7. `sensitive:true` 强制 string、`remember:never`、无 default，且第一版只允许消费到 `fill.value`。敏感值不进入 Flow、版本、导出、普通执行历史、最近值、错误、日志或未脱敏诊断产物。
8. `click` / 目标 `press` 可用 `selectionContext.searchStepId` 显式说明搜索后选择关系；它只增强可诊断性，不改变线性执行顺序。
9. v1 默认继续按 v1 读取和执行。v1→v2 采用“只读预览 + 用户确认 + revision/fingerprint 原子提交”，导入和 recorder 同步不隐式升级。
10. v1 迁移使用现有 `secret_*`、密码目标、上传和敏感 URL 启发式识别历史风险，但 v2 长期安全只相信显式 `sensitive`。
11. 老 Studio/Runtime 对 v2 在产生浏览器、运行目录或数据库写入前返回版本不支持；v2 不自动降级为 v1。
12. v2 保存、升级与恢复使用乐观 revision 和单一 SQLite immediate transaction，保证当前 Flow、版本快照、敏感历史清理与最近值清理全有或全无。跨层规范物理字段名为 `expectedRevision`；“期望基线版本”只作为产品文案。

完整 schema、兼容矩阵、迁移阻塞条件、错误分类和测试合同见 [`../design-docs/vnext-flow-schema-migration.md`](../design-docs/vnext-flow-schema-migration.md)。

## 选择理由

### 为什么不是“顶层 variables 唯一真源，input 只列 fieldId”

该方案能复用 v1，但输入节点所需的字段顺序、标签、说明和归属仍必须在别处表达，最终要么复制元数据，要么把输入节点退化成难读的 ID 列表。将定义放在实际生产字段的输入节点中，来源、顺序和安全策略天然一致。

### 为什么不是 name 引用

v1 variable name 是作者可理解、可能修改的语义名称，不适合作为长期身份。`fieldId` 可跨 label 重命名、版本 diff、会话提交和最近值存储保持稳定。v1 name 引用在显式迁移时一次性重写；v2 只保留 fieldId 与 label 两层。

### 为什么不是结构绑定对象

第一版只需要完整字段值替换。保留 `{{...}}` 能减少对现有字符串步骤和可读 JSON 的改动；通过“仅 fieldId、仅整值、仅白名单槽位”即可消除表达式与递归插值风险。未来若需要复合字符串，应另升 schema，而不是偷渡表达式。

### 为什么必须升版本

输入节点改变步骤联合类型；变量定义被移动并删除顶层字段；布尔槽位可能引用字段；引用和跨节点校验语义也改变。老 Runtime 无法安全忽略这些差异，使用 v1 会造成错误兼容承诺。

## 后果

### 正向

- 每个字段只有一个定义位置，Studio 来源选择、Runtime 请求和持久化策略一致。
- 展示名称调整不破坏绑定。
- 老版本明确拒绝 v2，不会部分执行。
- 敏感性成为 schema 级显式事实，可在保存前阻止危险默认值和最近值。
- v1 资产继续可运行，升级具备预览、冲突检测和回滚点。

### 成本

- flow-dsl 必须长期维护 v1/v2 分派和 v1 legacy 执行路径。
- migration 需要精确重写引用并对混合模板等歧义情况阻塞。
- project-knowledge 需要 revision、原子保存/恢复、安全历史清理和独立最近值存储。
- Studio 必须区分 v1 只读升级态与 v2 编辑态。
- v2 不能无损导出为 v1，旧应用只会给出版本不支持。

## 被否决方案

### 继续使用 schemaVersion 1

否决。老 Runtime 无法识别 input 节点，也无法理解敏感/remember 和 fieldId 引用，存在误执行风险。

### 同时保留 `variables[]` 与 `input.fields[]`

否决。会产生 type/default/required/sensitive 的双写与漂移，迁移、diff、导入导出和执行历史都无法确定相信哪一份。

### 顶层 `variables[]` 定义全部字段，input 只列引用

否决。来源归属、节点内顺序与字段呈现被拆散；输入节点退化为间接索引，产品和存储仍要额外维护关联。

### 使用 `{{name}}`

否决。name 重命名会要求全 Flow 重写，且旧 schema 已允许宽松名称和重复定义，不能作为跨会话稳定身份。

### 第一版改成结构表达式或通用 binding AST

否决。当前范围不需要运算、转换或混合模板；AST 会扩大 Runtime、Studio、迁移和错误面的复杂度，推动产品滑向通用编排器。

### v2 自动降级为 v1

否决。删除输入节点会丢失暂停时点；重建顶层变量会丢失字段来源和稳定身份，不能称为无损兼容。

## 安全与回滚说明

- 新 v2 文档从结构上禁止敏感 default/lastValue。
- 显式升级必须清除已识别敏感默认值和相关历史值；安全清理不可恢复，也不能清理用户控制的外部备份。
- Flow 结构回滚保存的是安全化 v1 快照，不复制已识别秘密。
- Runtime 的 `artifactSafety` 结构化声明（`policyVersion / flowHasSensitiveFields / sensitiveValueAccepted / harCaptured / sensitiveAcceptedAtStepIndex?`）只能供 knowledge 与会话状态、步骤时序和 artifact refs 交叉校验，不能证明产物内容无秘密；发布门禁必须另做 canary 内容扫描。完整类型见 [`vnext-runtime-input-session.md`](../design-docs/vnext-runtime-input-session.md#72-artifact-policy)。
- 实施时只要 v2 feature gate 未开启，v1 recorder、parser 与 Runtime 应保持原路径；已保存 v2 资产不能交给旧 Runtime 执行。

## 验收条件

1. v2 strict schema 与所有跨节点约束有红灯/绿灯测试。
2. v1 默认不升级；同一升级预览稳定；阻塞迁移零写入。
3. 老 Runtime 在任何副作用前拒绝 v2。
4. 保存、升级、恢复经故障注入证明原子。
5. artifact policy 声明交叉校验通过，且独立 canary 扫描证明哨兵敏感值不出现在 Flow、版本、导出、最近值、execution detail、日志、错误与诊断产物。
6. v1 单测、录制同步、导入导出和执行回归保持通过。
