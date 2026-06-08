## 项目上下文摘要（project-state-audit）

生成时间：2026-06-08 23:12:00 CST

### 1. 相似实现分析

- **实现 1**: [docs/superpowers/plans/2026-05-26-run-first-roadmap.md](/Users/ling/codeHome/A_Mine/flowweave/docs/superpowers/plans/2026-05-26-run-first-roadmap.md:1)
  - 模式：以 M1-M5 划分“先跑通版”的验收范围，并明确 P3 深度与 P4 AI 冻结。
  - 可复用：项目状态应优先按这份主线计划判断，而不是按早期大而全产品设计判断。
  - 需注意：文档宣称 M1-M4 已完成，但 M5 仅最小，智能阶段仍冻结。

- **实现 2**: [apps/studio/src/App.tsx](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/src/App.tsx:83)
  - 模式：Studio 是当前最完整的主工作台，覆盖项目选择、Flow 列表、运行、执行历史、版本、诊断与运行上下文。
  - 可复用：判断“P2 是否闭环”时，应以 Studio 能否驱动 `runtime + project-knowledge` 为主。
  - 需注意：Studio 通过 Electron 服务直连本地能力，不能代表 Web / HTTP fallback 一定等价可用。

- **实现 3**: [apps/web/server/index.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/web/server/index.ts:39)
  - 模式：Web API 作为轻量本地 HTTP 层，负责项目、Flow、版本、执行记录与快照的读取/写入。
  - 可复用：判断 Web 端是否“完成”时，要同时看前端页面和服务端路由。
  - 需注意：现有 `api.test.ts` 只验证仓储，不验证真实 HTTP 路由。

- **实现 4**: [packages/runtime/src/playwright-runner.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/runtime/src/playwright-runner.ts:1893)
  - 模式：runtime 是执行闭环核心，当前已支持 artifact、HAR、页面快照、storage state、真实页面矩阵与动作恢复诊断。
  - 可复用：判断“真实页面稳定录制与执行增强”是否落地时，优先看 runtime 与例子矩阵。
  - 需注意：执行能力强于 DSL/录制能力，不代表所有产品设计能力都已暴露到用户界面。

### 2. 项目约定

- 主线产品口径：v1 是“录制、入库、回放、可查”，不是完整 AI 自动化平台。
- 本地稳定基线：Node 20；Node 24 作为 CI 双基线兼容面。
- 审查优先级：先区分“当前主线已交付范围”与“未来冻结能力”，再判断半成品与缺口。

### 3. 可复用组件清单

- [packages/project-knowledge/src/repository.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/src/repository.ts:199)
- [packages/recorder/src/normalize.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/recorder/src/normalize.ts:598)
- [packages/runtime/src/playwright-runner.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/runtime/src/playwright-runner.ts:1893)
- [packages/page-intelligence/src/fragility.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/page-intelligence/src/fragility.ts:342)
- [apps/extension/entrypoints/background.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/extension/entrypoints/background.ts:90)
- [apps/studio/electron/services.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/electron/services.ts:502)
- [apps/web/server/index.ts](/Users/ling/codeHome/A_Mine/flowweave/apps/web/server/index.ts:39)

### 4. 测试策略观察

- 当前成熟度最高的测试集中在：
  - `runtime`：执行、真实页面矩阵、recorded replay
  - `recorder`：归一化、去噪、target 生成
  - `project-knowledge`：SQLite 仓储
  - `studio`：诊断消费与 Electron 服务
- `app-web` 当前只有 2 条测试，且只校验仓储侧行为，不覆盖 HTTP 路由。
- `ai-orchestrator` 当前只有 1 条启发式测试，说明它仍是占位能力而非产品能力。

### 5. 初步风险点

- Web API 的 Flow 版本恢复路由存在实现与预期路径不一致风险。
- 协议声明了 `scroll` RecordedEvent，但录制脚本、归一化器与 DSL 没有形成完整闭环。
- `ai-orchestrator`、`network-intelligence`、`page-intelligence` 的深度能力与产品设计差距仍大，需明确按“冻结 / 未开发”而非“已完成”管理预期。
