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

## Flow 版本规则

- 首次 `saveFlow` 不产生历史行。
- 再次保存且 `document_json` 变化时，将**旧文档**快照为 `version` 递增记录。
- `restoreFlowVersion` 会把当前文档再快照一次后写回目标版本。
