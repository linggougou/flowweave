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
| **[快速启动](docs/guides/quickstart.md)** | **本地跑通（推荐首读）** |
| [v1.0.0 发行说明](docs/releases/v1.0.0.md) | 第一版能力范围 |
| [v1 手测清单](docs/guides/manual-qa.md) | 验收录制→回放闭环 |
| [先跑通开发计划](docs/superpowers/plans/2026-05-26-run-first-roadmap.md) | 当前里程碑（AI 冻结） |
| [架构总览](docs/architecture/overview.md) | 逻辑/物理架构、阶段规划 |
| [Flow DSL](docs/domain/flow-dsl.md) | 流程语言规范 |
| [ADR](docs/adr/README.md) | 架构决策记录 |
| [AGENTS.md](AGENTS.md) | AI / 开发者协作规范 |
| [产品设计](docs/superpowers/specs/2026-05-25-web-automation-platform-design.md) | 产品定义 |

## 本地开发

```bash
corepack enable
pnpm install
pnpm exec playwright install chromium   # 首次
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm e2e:login
```

**三端开发**：

```bash
pnpm dev:web         # Web + API（扩展同步依赖）
pnpm dev:studio      # Studio 桌面端
pnpm dev:extension   # 浏览器扩展（WXT 热更新）
```

详见 [快速启动](docs/guides/quickstart.md)、[P1 端到端](docs/guides/p1-e2e.md)。

要求 Node.js ≥ 20（仓库默认基线仍是 `.nvmrc` 的 Node 20）。

如需在 Node 20 / 24 之间切换，请在切换主版本后执行一次 `pnpm install --force`，让 `better-sqlite3` 等原生模块按当前 Node ABI 重新落盘。

GitHub Actions 当前保持 `Node 20 / 24` 双基线矩阵；本地开发、排障和交付前自验仍以 `.nvmrc` 的 Node 20 作为稳定口径。

## 交付阶段

| 阶段 | 目标 |
|------|------|
| **P0** | 工程基座、文档、包骨架 ✅ |
| **P1** | 扩展录制 + Studio 回放 + `pnpm e2e:login` ✅ |
| **P2** | 知识库 + 执行历史 + 版本 ✅ 主体完成 |
| **v1.0** | **先跑通版** ✅（见 [发行说明](docs/releases/v1.0.0.md)） |
| **P3 深度 / P4 AI** | ⏸ 冻结，跑通稳定后再做 |
