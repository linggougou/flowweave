# ADR-0001: Monorepo 与 pnpm + Turborepo

## 状态

已采纳（2026-05-25）

## 背景

平台包含浏览器扩展、Electron 桌面端、Web 控制台与多个引擎包，需要共享类型与 Schema，并避免多仓库同步成本。

## 决策

- 使用 **pnpm workspaces** 管理依赖。
- 使用 **Turborepo** 编排 build / lint / typecheck / test，并启用任务缓存。
- 包命名统一为 `@flowweave/<name>`。

## 后果

### 正面

- 依赖去重、workspace 协议引用清晰。
- PR 可只构建受影响包。

### 负面

- 需统一 Node 版本与根级工具链配置。
- 新人需理解 monorepo 脚本入口。

## 备选方案

- npm workspaces：已在使用，pnpm 磁盘与隔离更优。
- Nx：能力更强，初期过重。
