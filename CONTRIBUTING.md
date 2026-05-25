# 贡献指南

## 环境要求

- Node.js **≥ 20**
- pnpm **≥ 9**（`corepack enable` 后使用仓库声明的版本）

## 本地启动

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

## 分支与提交

- 默认分支：`main`
- 功能分支：`feat/<scope>-<short-desc>`
- 修复分支：`fix/<scope>-<short-desc>`
- 提交信息： [Conventional Commits](https://www.conventionalcommits.org/)，示例：
  - `feat(runtime): 支持步骤级重试`
  - `docs(adr): 补充 Electron 决策记录`

## Pull Request

1. 说明变更范围与动机。
2. 列出本地验证命令及结果。
3. 若修改 Flow DSL（`schemaVersion`、Zod Schema），须在 PR 中说明迁移策略。
4. 禁止提交 `.env`、密钥、含真实 Cookie 的录制产物。

## 包边界

- 禁止 `apps/*` 互相依赖。
- 禁止从其他包 deep import（如 `@flowweave/runtime/src/internal/...`）。
- 公共 API 仅通过各包 `src/index.ts` 导出。

## 文档

- 架构变更：更新 `docs/architecture/overview.md` 并新增 ADR。
- 重大选型：在 `docs/adr/` 追加记录。

## Agent / AI 协作

- 人类与 AI 开发前阅读根目录 [AGENTS.md](./AGENTS.md)。
- 任务过程记录可写入 `.codex/`（不提交敏感数据）。
