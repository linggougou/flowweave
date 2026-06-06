# 真实页面稳定性下一轮自主并行设计

生成时间：2026-06-06

## 1. 背景

当前协调分支已经完成真实页面稳定性底座的两轮增强：

1. DSL、Recorder、runtime、Environment、Diagnostics、Benchmarks 主链路已打通。
2. 真实页面矩阵已扩展到 11 个本地 fixture。
3. 历史执行上下文、Flow 快照、诊断面板、Node 24 双基线 CI 都已并回主线。
4. 最新一轮又补上了“录制事件 -> 导出 Flow -> runtime 回放”的最小整链回归。

但从真实使用视角看，仍有 5 类高价值缺口：

1. 录制侧 upload 占位符、`fileNames` 保真和变量提取仍不够统一。
2. runtime 对占位符插值与错误提示的规则，和 recorder / fragility 仍不是同一事实来源。
3. Studio 运行表单里 `environmentName / baseUrl / storageStatePath / variables` 现在大多“可填不可用”，执行链路仍主要只吃到了 `showBrowser`。
4. 本地 fixture 虽然已覆盖 11 个场景，但 Tab、contenteditable、空结果重试等典型后台页面仍没有稳定基准。
5. 远端 GitHub Actions 已跑通，但 workflow 仍带 deprecated runtime 警告，后续会逐渐变成维护风险。

## 2. 本轮目标

### 2.1 核心目标

1. 先由 Foundation 把 recorder / runtime / fragility 的占位符协议收敛成同一事实来源。
2. 分别补齐 Recorder 占位符合同与 Runtime 回放合同，避免继续把两端耦在同一轨道上。
3. 让 Studio 对“最近一次成功输入、当前缺少什么、这次到底用了什么上下文、如何修复”给出更直接的运行前后反馈。
4. 继续扩展真实页面矩阵，让它更接近真实后台站点常见结构。
5. 消除远端 CI 的 deprecated runtime 警告，保持 Node 20 / 24 双基线稳定。

### 2.2 成功标准

1. `{{变量}}` 在 recorder、runtime、fragility 三端的字符集与解析规则一致，并有共享实现承载。
2. Recorder 侧至少补上 1 组 upload / 非 upload 的占位符保真回归。
3. Runtime 侧至少补上 1 组“RecordedEvent -> Flow -> executeFlow”多场景自动回归入口。
4. Studio 能真正把 `environmentName / baseUrl / storageStatePath / variables` 送进执行链路，自动回填最近一次运行输入，并在运行前明确指出缺少环境、缺少变量或缺少登录态文件。
5. Benchmarks 新增至少 3 个 fixture，覆盖当前矩阵未覆盖的高价值后台场景。
6. GitHub Actions 不再出现当前的 deprecated Node.js 20 actions runtime 警告。

## 3. 设计范围

### 3.1 Foundation（主代理先行）

- 抽取共享变量占位符解析工具，避免 recorder / runtime / fragility 各写一套正则。
- 先把 `packages/page-intelligence/src/fragility.ts` 切到共享协议，给后续 Recorder / Runtime 两轨提供稳定基线。
- 这一层只做协议与测试，不顺手扩大 UI 或执行功能范围。

### 3.2 Recorder Placeholder Contract 轨道

- 修正扩展侧 upload token 生成与 recorder normalize 的契约保真。
- 补 `fileNames`、upload token 碰撞、字面量 `{{...}}` 边界回归。
- 必要时补 `apps/extension` 的 payload 级单测，但不在本轮新增复杂浏览器级扩展 E2E。

### 3.3 Runtime Replay Contract 轨道

- 让 runtime 消费 Foundation 提供的共享占位符工具。
- 补“RecordedEvent -> Flow -> executeFlow”多场景整链回归，而不是只保留 upload 单场景。
- 改善未解析占位符、文件上传变量与回放错误提示的一致性。

### 3.4 Studio Experience 轨道

- 在知识库中持久化最近一次运行输入配置，范围至少包括：
  - `environmentName`
  - `baseUrl`
  - `storageStatePath`
  - `variables`
- 修复 Electron IPC / main / services 的运行参数透传，让这些字段真正进入 `executeFlow()`。
- Studio 打开 Flow 时优先回填最近一次输入，减少重复填写。
- 运行前新增 preflight 区块，明确：
  - 缺少 `baseUrl`
  - 缺少必填变量
  - `storageStatePath` 指向文件不存在
- 执行后要能看到本次 `runContext`、关键诊断摘要与修复建议，而不仅是原始 JSON 展示。

### 3.5 Benchmarks P5 轨道

优先补以下场景：

1. **Tab 切换页**：同页内容切换、激活态、局部 loading。
2. **contenteditable 编辑器**：富文本或审批意见类录入。
3. **空结果重试页**：第一次筛选/刷新失败，重试后恢复。
4. **联动筛选**：上游下拉驱动下游可选项重算。

同时增强矩阵汇总输出，形成更稳定的场景耗时视图。

### 3.6 CI Runtime Refresh 轨道

- 按官方最新 release / 文档升级 `actions/checkout`、`actions/setup-node`、`pnpm/action-setup`。
- 保持当前双 Node matrix 与 Playwright 安装链路不退化。
- 文档同步说明当前稳定基线与远端验证口径。

## 4. 非目标

本轮仍然不做：

1. AI 自愈选择器。
2. 远端真实站点自动 smoke。
3. 多人协作、云端同步或账号体系。
4. 浏览器扩展的全浏览器端 E2E 自动化平台。

## 5. 并行原则

为了降低冲突，本轮采用“Foundation 先行 + 5 条低耦合轨道并行”的方式：

1. **Foundation**：主代理串行完成共享占位符协议，不派并行子代理。
2. **Recorder Placeholder Contract**
3. **Runtime Replay Contract**
4. **Studio Experience**
5. **Benchmarks P5**
6. **CI Runtime Refresh**

其中 `Studio Experience` 会同时吸收环境体验与诊断建议层，避免多个子代理并发争抢 `apps/studio/src/App.tsx`；Recorder 与 Runtime 则通过 Foundation 解耦后再并行。

## 6. 验收口径

- Foundation：
  - `pnpm --filter @flowweave/shared build`
  - `pnpm --filter @flowweave/page-intelligence test`
- Recorder Placeholder Contract：
  - `pnpm --filter @flowweave/recorder test`
- Runtime Replay Contract：
  - `pnpm --filter @flowweave/runtime test`
- Studio Experience：
  - `pnpm --filter @flowweave/project-knowledge test`
  - `pnpm --filter @flowweave/app-studio test`
  - `pnpm --filter @flowweave/app-studio typecheck`
- Benchmarks P5：
  - `pnpm e2e:real-pages`
  - 若新增 runtime 矩阵测试：`pnpm --filter @flowweave/runtime test`
- CI Runtime Refresh：
  - `pnpm lint`
  - 必要时本地等效 `pnpm smoke`
- 主代理统一门槛：
  - `pnpm lint`
  - `pnpm smoke`
  - 如果 Benchmarks 修改了矩阵主入口，再额外执行 `pnpm smoke:full`
