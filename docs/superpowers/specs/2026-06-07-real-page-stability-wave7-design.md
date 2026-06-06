# 真实页面稳定性 Wave 7 设计

生成时间：2026-06-07

## 1. 背景

截至当前 `codex/real-page-stability-program` 主线，FlowWeave 已经具备：

1. Recorder / runtime / Studio / Benchmarks 的真实页面稳定执行底座。
2. `scopeText / scopeKind` 作用域线索、多候选消解、通用失败诊断与 `p7` 手写真实页面矩阵。
3. `Node v20.19.6` 下 `pnpm e2e:real-pages` 通过，`p7` 共 `19` 个场景全部成功。

但如果把焦点拉回用户最初的真实痛点，“记录出来的页面内容能不能直接稳定执行”，当前仍有 3 个明显缺口：

1. **覆盖错位**：`p7` 的 `19` 个真实页面场景大多是手写 `FlowDocument`，而不是由 recorded events 构建出来的 Flow。
2. **整链断点**：扩展真实使用路径是 `content -> background session -> buildFlowFromEvents -> knowledge / runtime`，但 `background.ts` 当前没有消息处理链测试。
3. **验收缺入口**：当前 recorded replay 证据分散在 `playwright-runner.test.ts` 的 `7` 条用例里，没有独立 smoke 命令来回答“录制回放链路今天是否稳定”。

换句话说，上一阶段解决的是“手写 Flow 更稳定、更可诊断”，这一阶段要解决的是“真实录出来的内容也要更有把握跑成”。

## 2. 目标

### 2.1 核心目标

1. 把 recorded replay 整链覆盖从当前 `7` 条扩到更贴近 `p7` 用户场景的关键流程。
2. 为扩展 background 的 session/export/sync 链路补自动化合同测试。
3. 新增独立的 recorded replay smoke runner，让 Node 20 下可以单独验收“真实录制回放闭环”。

### 2.2 成功标准

1. `packages/runtime/src/playwright-runner.test.ts` 至少新增 `4` 条高价值 recorded replay 整链用例，并全部通过：
   - `repeated-row-actions`
   - `linked-filters`
   - `session-dashboard`
   - `drawer-double-save`
2. `apps/extension` 新增 background 合同测试，覆盖：
   - `MSG_RECORD_EVENT`
   - `MSG_EXPORT_FLOW`
   - `MSG_SYNC_KNOWLEDGE`
3. 新增 Node 20 recorded replay smoke 命令，并可跑通一个明确的 recorded 场景矩阵。
4. 既有基线不退化：
   - `pnpm --filter @flowweave/app-extension test`
   - `pnpm --filter @flowweave/recorder test`
   - `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
   - `pnpm e2e:recorded-pages`

## 3. 方案比较

### 方案 A：只继续给 runtime 补更多 recorded replay 测试

优点：

- 改动面最小。
- 能快速增加一部分 recorded replay 证据。

缺点：

- 只能证明“手写出来的 recorded events 可跑”，不能证明扩展 background 导出链路没偏。
- 仍然没有独立 smoke 入口，难以作为持续回归基线。

### 方案 B：只做 background 合同测试，不扩 recorded replay 场景

优点：

- 能补齐扩展使用路径里最明显的未测点。

缺点：

- 不能直接提升 recorded replay 真实稳定性证据。
- 仍然无法回答“复杂真实页面 recorded replay 是否稳定”。

### 方案 C：统一推进 background 合同测试 + recorded replay 覆盖扩张 + recorded smoke runner

优点：

- 同时覆盖真实录制导出、真实 recorded replay 场景、独立验收命令三层证据。
- 复用现有 fixture 与 `buildFlowFromEvents()`，不引入第二套录制协议。
- 最贴近用户真实使用路径。

缺点：

- 横跨 `apps/extension`、`packages/runtime`、`examples` 三层，需要严格保持写入边界互斥。

### 推荐方案

采用 **方案 C**。

理由：

- 这不是继续“横向加功能”，而是把用户最在意的 recorded replay 链路做厚。
- 它能把“代码看起来支持录制回放”升级为“有整链证据证明录制回放更稳”。
- 它不推翻现有设计，只是在既有 fixture、runtime、扩展导出链路上补足回归基线。

## 4. 设计范围

### 4.1 轨道一：Extension Session Export Contract

目标：

- 为 `apps/extension/entrypoints/background.ts` 的消息处理链建立自动化合同测试。

覆盖点：

1. `MSG_RECORD_EVENT`
   - session 能累积事件
   - `eventCount` 正确返回
2. `MSG_EXPORT_FLOW`
   - 调用 `buildFlowFromEvents()`
   - 导出文件名与 `json` 结构稳定
3. `MSG_SYNC_KNOWLEDGE`
   - 把当前 session 构建成 Flow
   - 传入正确 `projectId / apiBase / changeMessage`

设计约束：

- 优先通过测试与最小辅助抽取实现，不重写 background 架构。
- 不新增第二套 session 存储模型。

### 4.2 轨道二：Recorded Replay Coverage Expansion

目标：

- 把 recorded replay 证据从当前 `7` 条扩展到更贴近 `p7` 用户场景的关键流程。

本轮新增场景：

1. `repeated-row-actions`
   - 证明 recorded replay 会保留并消费 `scopeText / scopeKind`
2. `linked-filters`
   - 证明 `select -> 异步联动 -> 再次 select / click` 的 recorded replay 稳定
3. `session-dashboard`
   - 证明 recorded replay 也能稳定消费 `storageStatePath`
4. `drawer-double-save`
   - 证明 recorded replay 对“首次失败 -> 修正 -> 二次提交”这类链路仍可执行

设计约束：

- 优先复用现有 fixture，不新增远端站点依赖。
- 如果新增场景暴露 `normalize.ts / step-filter.ts` 的 wait 推断或去噪缺口，只在 recorder 边界内做最小修复。
- 不为了追求全量覆盖而强行把全部 `19` 个 `p7` 场景一次搬成 recorded replay。

### 4.3 轨道三：Recorded Replay Smoke Runner

目标：

- 为 recorded replay 提供独立的 Node 20 烟测入口，而不是把证据散落在单测里。

设计建议：

1. 新增 `examples/recorded-replay-smoke.ts`
   - 复用本地 fixture server 与 runtime assets 模式
   - 输出 recorded replay case 结果汇总
2. 新增对应测试文件
   - 锁定 smoke summary 结构
3. 根脚本新增：
   - `pnpm e2e:recorded-pages`

矩阵范围：

- 采用 curated profile，而不是复制一整份 `p7` 手写矩阵。
- 首轮推荐至少覆盖：
  - `upload`
  - `filterable-list`
  - `contenteditable-editor`
  - `session-expired-retry`
  - `bulk-cross-page-selection`
  - 本轮新增 `4` 条 recorded replay

### 4.4 非目标

本轮不做：

1. 真实浏览器里的扩展端到端 UI 自动化。
2. 把全部 `p7` `19` 个场景一次性全部迁成 recorded replay。
3. 新增 AI 自愈、自动重录或 selector 自动修补。
4. 新增远端网页依赖或账号体系。

## 5. 并行原则

本轮适合采用 **3 轨并行 + 主代理集成**：

1. **Extension Session Export Contract**
   - 只改 `apps/extension/**`
2. **Recorded Replay Coverage Expansion**
   - 主写 `packages/runtime/src/playwright-runner.test.ts`
   - 如被红灯逼出最小 recorder 修补，仅限 `packages/recorder/**`
3. **Recorded Replay Smoke Runner**
   - 只改 `examples/**`、必要脚本与文档

主代理职责：

- 先冻结 Wave 7 主题、文档与编排板。
- 统一用 Node 20 验收。
- 合并通过轨道后补 `.codex` 留痕并回收资源。

## 6. 为什么这是下一阶段

当前主线已经能比较稳地执行“我们手工写出来的正确 Flow”，但用户真正感受到的质量，取决于“录出来的 Flow 能不能也稳定执行”。

Wave 7 的价值就在于把 recorded replay 从“局部看起来可用”推进到“有独立 smoke 基线、有扩展导出合同、有关键场景整链证明”。这比继续单纯扩手写矩阵，更直接对应真实使用体验。
