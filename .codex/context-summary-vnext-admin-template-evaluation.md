# vNext 后台管理类交互式流程模板评估上下文摘要

## 任务目标

评估基于当前 FlowWeave 代码库，是否适合在下一大版本支持“后台管理类网站交互式流程模板”：

- 先录制流程
- 在 Studio 编辑流程
- 显式加入弹窗节点收集运行时输入
- 后续步骤绑定这些变量
- 执行到节点时由 Studio 弹窗填写后继续执行

并结合补充约束：

1. 第一版必须是“任务模板”，不是通用编排器。
2. 不做条件分支、循环、批量执行、多人协作、自动抽变量。
3. Studio 第一版采用“步骤中心 + 显式输入节点 + 行内绑定”。
4. “搜索后选择实体”要把“搜索词绑定”和“选择动作依赖”分开表达。

## 路线锁与生命周期判断

- 当前项目路线锁仍处于 `P2 收口 / v1 先跑通版维护`，`P3` 深度能力与 `P4` AI 仍冻结。
- 本次任务不属于当前 P2 主线缺口，而是 **S9 后续版本 / 变更管理** 下的 vNext 架构评估。
- 结论可用于后续更新路线锁或撰写 vNext 设计文档，但本轮不进入实现。

## 本轮重点读取

- `PROJECT_ROUTE_LOCK.md`
- `docs/architecture/overview.md`
- `docs/domain/flow-dsl.md`
- `docs/superpowers/plans/2026-05-26-run-first-roadmap.md`
- `packages/flow-dsl/src/schema.ts`
- `packages/runtime/src/playwright-runner.ts`
- `packages/runtime/src/types.ts`
- `packages/shared/src/template-variables.ts`
- `packages/recorder/src/normalize.ts`
- `packages/recorder/src/target-from-dom.ts`
- `packages/page-intelligence/src/fragility.ts`
- `apps/studio/src/App.tsx`
- `apps/studio/src/shared/run-input-state.ts`
- `apps/studio/src/shared/studio-api-types.ts`
- `apps/studio/electron/main.ts`
- `apps/studio/electron/preload.ts`
- `apps/studio/electron/services.ts`
- `apps/web/server/app.ts`
- `packages/project-knowledge/src/repository.ts`

## 已确认的现有能力

### 1. 变量插值链路已存在

- Flow DSL 已有 `variables[]`，支持 `string | number | boolean`、`required`、`defaultValue`。
- runtime 会对整条步骤对象做递归字符串插值，而不是只替换 `fill.value`。
- shared 已有模板变量提取与 `{{var}}` 插值工具。

这意味着：**原始录制步骤上的变量绑定** 在引擎层已经成立，不必先发明复杂复合节点。

### 2. Studio 已有“运行前一次性收集变量”的窄闭环

- Studio 已有变量输入草稿状态、必填校验、类型解析、最近一次运行值回填。
- Electron `runFlow(...)` 会把 `baseUrl / storageState / variables` 传给 runtime。
- 执行完成后，运行上下文会随执行记录持久化，下一次可回填。

这意味着：把“执行前统一收集变量”升级为“执行中按输入节点分段收集变量”，不是从零开始。

### 3. 后台站点常见动态交互已有底层支撑

- recorder 会记录 `scopeText / scopeKind`，runtime 也会用它们做多命中消歧。
- runtime 已对 suggest / combobox 的 `fill -> ArrowDown -> Enter` 做稳定等待。
- repeated-row / repeated-button 这类后台表格场景已有测试覆盖。

这意味着：对于“搜索后选择实体”“同文案多行按钮”这类后台场景，当前底层并不空白。

### 4. Flow 持久化与版本化已存在

- 知识库已有 `saveFlow(...)`、版本快照、版本恢复。
- Web API 也已经暴露保存 Flow 的 POST 接口。

这意味着：vNext 若做 Studio 内部的模板编辑，**持久化底座可以复用**，主要缺的是 Studio 侧编辑能力与契约暴露。

## 已确认的核心缺口

### 1. DSL 没有“输入节点”

当前步骤类型只覆盖浏览器动作与等待，没有“收集运行时输入”的显式节点，无法表达：

- 何时弹窗
- 一次收集哪些字段
- 字段标题、说明、顺序
- 分段收集

### 2. Studio 没有 Flow 编辑器

当前 Studio：

- 能看步骤表
- 能看 JSON
- 能改名称、看版本、恢复版本
- 能在运行前统一填变量

但还不能：

- 插入节点
- 行内把某个步骤字段改绑到变量
- 保存修改后的 Flow

### 3. Runtime 仍是“一次跑完”的同步模型

当前 `executeFlow(...)` 是单次 Promise，内部 for-loop 顺序执行，主进程 `runFlow(...)` 也是等 runtime 结束后才返回。

因此目前没有：

- 运行中暂停
- 向 Studio 发起“需要输入”的请求
- Studio 回填后继续执行
- 运行取消 / 中断恢复 / 分段状态

### 4. 执行协议还是 request/response，不是 session/event

当前 Electron preload / IPC 只有 `ipcRenderer.invoke(...)` 式调用。它适合：

- 开始执行
- 结束后拿结果

不适合：

- 执行中多次弹出输入请求
- 逐步上报运行进度
- 用户取消当前模板运行

### 5. 变量模型过于“扁平”

当前 `variables[]` 只有基础类型，没有：

- label
- placeholder
- description
- secret / mask
- enum / datasource
- prompt 分组
- 是否允许回填最近值

也没有“搜索词”和“最终选择值”这类依赖关系的显式建模。

## 对补充产品边界的架构判断

### 1. “第一版必须是任务模板，不是通用编排器”是正确收边

这会显著降低复杂度，因为当前架构最成熟的是：

- 线性步骤列表
- 步骤内字符串插值
- 单条执行链路

而不是：

- 分支图
- 循环
- 批处理
- 并发会话
- 多人协作

### 2. “步骤中心 + 显式输入节点 + 行内绑定”非常契合现有架构

最契合的点：

- 当前 Flow 本来就是线性 `steps[]`
- 当前 runtime 本来就是逐步执行
- 当前变量插值本来就是绑在原始步骤字段上
- 当前 Studio 已有步骤表与运行前变量面板

因此把 vNext 做成“在线性步骤中插入一种非浏览器执行节点 + 给原有字段加变量绑定”比另起一套编排器自然得多。

### 3. “搜索后选择实体”拆成两段表达，也有助于降低技术风险

推荐显式分成：

- 搜索词变量：驱动 `fill`
- 选择动作：依赖后续 `press/click/wait`

这样更符合当前 runtime 已有的原子动作能力，也比“抽象成一个智能实体选择节点”更容易落地和测试。

## 即使收边界后仍然困难的点

1. 运行中暂停/继续协议仍然必须新增，无法靠现有 API 小修补出来。
2. Flow 编辑保存虽然底层已具备，但 Studio 侧的可用编辑模型还没有现成骨架。
3. 一旦允许绑定目标定位字段，变量与定位稳定性之间的张力仍然存在，需要产品限制可绑定范围。
4. 当前执行上下文会把变量原样持久化；若未来模板输入包含敏感数据，需要单独补安全策略。

## 倾向性结论

方向成立，但前提是把 vNext 第一版定义为：

- **Studio-only**
- **线性任务模板**
- **显式输入节点**
- **原始步骤行内绑定**
- **不进入通用编排器**

在这个边界下，复用率最高，新增复杂度也最低。
