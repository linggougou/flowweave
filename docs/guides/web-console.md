# Web 控制台

本地浏览器工作台，读取 `~/.flowweave/projects` 下的 SQLite 知识库（与 Studio 共用数据）。

## 启动

```bash
# 需 Node 20
pnpm dev:web
```

- 前端：<http://127.0.0.1:5174>（Vite，代理 `/api`）
- API：<http://127.0.0.1:3847>（`FLOWWEAVE_WEB_PORT` 可改）

生产构建后单进程提供静态页 + API：

```bash
pnpm --filter @flowweave/app-web build
pnpm --filter @flowweave/app-web start
```

## 功能

| 模块 | 说明 |
|------|------|
| 项目 | 列出本地项目与默认环境 `baseUrl` |
| Flow | 按项目列出 Flow，查看当前步骤数 |
| Flow 版本 | `saveFlow` 更新前自动写入 `flow_versions`；可预览 JSON、一键恢复 |
| 执行历史 | 只读展示 `listExecutions` / 步骤日志 |
| 扩展同步 | `POST /api/projects/:id/flows` 接收浏览器扩展写入的 Flow |

## 扩展录制同步

1. 终端运行 `pnpm dev:web`（API `127.0.0.1:3847`）。
2. Chrome 加载 `apps/extension` 构建产物（`pnpm --filter @flowweave/app-extension dev`）。
3. 侧栏选择目标项目，点击 **同步到知识库**。
4. 在 Studio / Web 控制台即可看到同一 Flow 并运行。

## Flow 版本规则

- 首次 `saveFlow` 不产生历史行。
- 再次保存且 `document_json` 变化时，将**旧文档**快照为 `version` 递增记录。
- `restoreFlowVersion` 会把当前文档再快照一次后写回目标版本。
