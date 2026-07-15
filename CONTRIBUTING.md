# 贡献指南

## 环境要求

- Node.js **≥ 20**
- pnpm **≥ 9**（`corepack enable` 后使用仓库声明的版本）

## 本地启动

```bash
corepack enable
pnpm install
pnpm doctor              # 环境自检
SKIP_E2E=1 pnpm smoke    # 或 pnpm smoke:full
```

完整跑通见 [docs/guides/quickstart.md](./docs/guides/quickstart.md)。

### 构建与加载应用

| 应用      | 开发                 | 生产构建                                                                                     |
| --------- | -------------------- | -------------------------------------------------------------------------------------------- |
| Web + API | `pnpm dev:web`       | `pnpm --filter @flowweave/app-web build && pnpm --filter @flowweave/app-web start`           |
| Studio    | `pnpm dev:studio`    | `pnpm --filter @flowweave/app-studio build` 后 `electron .`（在 `apps/studio`）              |
| 扩展      | `pnpm dev:extension` | `pnpm --filter @flowweave/app-extension build`，Chrome 加载 `apps/extension/dist/chrome-mv3` |

扩展同步知识库前需先启动 Web API（`dev:web`）。

### macOS 本地预览包

```bash
# 生成可直接启动的 .app 目录包
pnpm --filter @flowweave/app-studio package:dir

# 生成包含 Playwright Chromium 的 arm64 DMG
pnpm --filter @flowweave/app-studio package:mac
```

产物位于 `apps/studio/release/`。未配置 `CSC_LINK` / `CSC_NAME` 时，构建会执行 ad-hoc 深度签名与严格 bundle 校验，只适合本机预览和内部验证。公开分发前仍需 Developer ID Application 签名、Apple 公证和正式 `.icns` 图标。

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
