# FlowWeave 项目 Agent 规范

> 本文件为 **项目级** 约定。全局规范见 `~/.codex/AGENTS.md`；冲突时以本文件为准。

## 项目概览

- **名称**：织流 / FlowWeave
- **定位**：通用网页流程自动化与页面智能分析平台
- **仓库**：monorepo，`apps/` + `packages/`

## 必读文档（编码前）

1. [架构总览](./docs/architecture/overview.md)
2. [Flow DSL](./docs/domain/flow-dsl.md)
3. [ADR 索引](./docs/adr/README.md)
4. [产品设计](./docs/superpowers/specs/2026-05-25-web-automation-platform-design.md)

## 包依赖（强制）

```text
apps/*  →  packages/*  （禁止 apps 互依赖）

shared ← flow-dsl ← recorder
              ↑
shared ← flow-dsl ← runtime → page-intelligence
              ↑                    ↓
         project-knowledge ← network-intelligence
              ↑
         ai-orchestrator（不直接操作浏览器，经 runtime）
```

## 技术栈（已采纳，勿随意替换）

| 领域 | 选型 |
|------|------|
| 语言 | TypeScript strict |
| Monorepo | pnpm + Turborepo |
| 执行内核 | Playwright（`@flowweave/runtime`） |
| 流程 Schema | Zod（`@flowweave/flow-dsl`） |
| 本地存储 | SQLite + Drizzle（`project-knowledge`） |
| 桌面端 | Electron + Vite + React（`apps/studio`） |
| 扩展 | WXT（`apps/extension`） |
| Web | Vite + React（`apps/web`，Phase 2 加强） |
| AI | Vercel AI SDK（`ai-orchestrator`，P4） |

## 分阶段约束

- **P0**：工具链、文档、包骨架 — 当前阶段
- **P1**：extension 录制 → studio 回放（不上 AI）
- **P2**：project-knowledge + 执行日志
- **P3**：page / network intelligence
- **P4**：ai-orchestrator

未达阶段的包不得引入重量级依赖阻塞 P1。

## 代码规范

- 包名：`@flowweave/<package>`
- 对外导出：仅 `src/index.ts`
- 错误：使用 `@flowweave/shared` 的 `FlowWeaveError` 与错误码
- 日志：结构化，执行链路带 `executionId`、`stepIndex`
- 语言：注释与文档简体中文；标识符英文
- 测试：引擎包单元测试优先 Vitest；覆盖率目标 ≥80%（packages 层）

## 安全（本项目覆盖全局 AGENTS 的宽松安全条款）

- 禁止将 API Key、Cookie、HAR 提交进 Git
- 录制产物默认存本地 `~/.flowweave/`
- 导出流程时提供脱敏选项

## 验证命令

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## 过程文件

任务上下文、操作日志、验证报告写入 **本仓库** `.codex/`：

- `context-summary-<任务>.md`
- `operations-log.md`
- `verification-report.md`
