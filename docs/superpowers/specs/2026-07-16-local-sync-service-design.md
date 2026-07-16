# FlowWeave 本地同步服务设计

## 目标

在不启动 Web 开发服务器的情况下，由 Studio 自动向浏览器扩展提供本地知识库 API，使首次使用不需要理解 pnpm、端口或源码目录。

## 边界

- 新增 `@flowweave/local-api`，只承载 `/api/*` HTTP 路由、JSON 请求响应和 CORS。
- `apps/web` 复用共享 API handler，继续自行提供 SPA 静态资源。
- `apps/studio` 复用共享 API server，并使用 Studio 已持有的 `ProjectKnowledgeRepository`。
- `apps/*` 不直接互相依赖；SQLite 数据模型与默认数据目录保持不变。
- 服务仅监听 `127.0.0.1:3847`，不暴露到局域网。
- API 拒绝非本机网页来源，只允许 Chrome 扩展、本机 Web 与无 Origin 的本地工具请求。

## 生命周期

1. Electron ready 后先启动本地 API，再创建主窗口。
2. 若 `3847` 可用，Studio 持有 server，并在退出前关闭。
3. 若端口已被兼容 FlowWeave API 占用，检查 `/api/health` 后复用，不重复监听。
4. 若端口被非兼容进程占用，记录明确错误并继续打开 Studio，避免桌面端整体不可用。

## 验收合同

- 共享 server 支持 health、项目列表/创建与 Flow 同步。
- Web 原有 API 测试保持通过。
- Studio 可启动、关闭自持有的服务；兼容服务占用端口时返回 reused。
- 只启动 Studio 后，`http://127.0.0.1:3847/api/health` 可用。
- Studio 退出后，自持有端口释放。
- Studio 空状态与扩展离线提示不出现开发命令、端口和源码目录。
