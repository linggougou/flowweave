# 架构决策记录（ADR）

本目录记录 FlowWeave 的重大技术选型与边界决策。格式遵循 [Michael Nygard ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)。

| ID                                                       | 标题                                | 状态                 |
| -------------------------------------------------------- | ----------------------------------- | -------------------- |
| [0001](./0001-monorepo-pnpm-turborepo.md)                | Monorepo 与 pnpm + Turborepo        | 已采纳               |
| [0002](./0002-typescript-strict.md)                      | 全栈 TypeScript strict              | 已采纳               |
| [0003](./0003-playwright-runtime-kernel.md)              | Playwright 作为执行内核             | 已采纳               |
| [0004](./0004-electron-studio.md)                        | Electron 桌面工作台                 | 已采纳               |
| [0005](./0005-sqlite-project-knowledge.md)               | SQLite 本地项目知识库               | 已采纳               |
| [0006](./0006-flow-dsl-zod-versioning.md)                | Flow DSL 与 Zod 版本化              | 已采纳               |
| [0007](./0007-wxt-browser-extension.md)                  | WXT 浏览器扩展                      | 已采纳               |
| [0008](./0008-ai-sdk-orchestrator.md)                    | Vercel AI SDK 编排层                | 已采纳               |
| [0009](./0009-vnext-input-node-and-schema-versioning.md) | vNext 输入节点与 Flow Schema v2     | 提议冻结（尚未实现） |
| [0010](./0010-vnext-runtime-input-session.md)            | 主进程持有的可暂停 Runtime 输入会话 | 提议采纳（尚未实现） |
