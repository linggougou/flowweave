# 织流 / FlowWeave

织流是一个通用网页流程自动化与页面智能分析平台。

它的目标不是简单录制网页点击，而是把网页项目逐步沉淀为可执行、可维护、可诊断、可优化的自动化资产。

## 技术栈（P0 已落地）

- **Monorepo**：pnpm workspaces + Turborepo
- **语言**：TypeScript（strict）
- **流程契约**：Zod Flow DSL（`@flowweave/flow-dsl`）
- **执行内核（P1）**：Playwright（`@flowweave/runtime`）
- **桌面端（P1）**：Electron + Vite + React（`apps/studio`）
- **扩展（P1）**：WXT（`apps/extension`）

## 仓库结构

```text
flowweave/
├── apps/
│   ├── extension/        # 浏览器扩展（WXT，P1）
│   ├── studio/           # 桌面工作台（Electron，P1）
│   └── web/              # Web 控制台（P2 加强）
├── packages/
│   ├── shared/           # 错误码、常量
│   ├── flow-dsl/         # Flow Schema（Zod）
│   ├── recorder/         # 录制引擎（P1）
│   ├── runtime/          # 执行引擎（P1）
│   ├── page-intelligence/
│   ├── network-intelligence/
│   ├── project-knowledge/  # SQLite（P2）
│   ├── ai-orchestrator/    # AI SDK（P4）
│   └── ui/
├── docs/
│   ├── architecture/overview.md
│   ├── adr/
│   └── domain/flow-dsl.md
├── AGENTS.md             # 项目 Agent 规范
├── CONTRIBUTING.md
└── .codex/
```

## 文档入口

| 文档 | 说明 |
|------|------|
| [架构总览](docs/architecture/overview.md) | 逻辑/物理架构、阶段规划 |
| [Flow DSL](docs/domain/flow-dsl.md) | 流程语言规范 |
| [ADR](docs/adr/README.md) | 架构决策记录 |
| [AGENTS.md](AGENTS.md) | AI / 开发者协作规范 |
| [产品设计](docs/superpowers/specs/2026-05-25-web-automation-platform-design.md) | 产品定义 |

## 本地开发

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

要求 Node.js ≥ 20（见 `.nvmrc`）。

## 交付阶段

| 阶段 | 目标 |
|------|------|
| **P0** | 工程基座、文档、包骨架 ← 当前 |
| **P1** | 扩展录制 + studio 回放 |
| **P2** | 项目知识库 + 执行日志 |
| **P3** | 页面 / 接口理解 |
| **P4** | AI 编排与体检 |
