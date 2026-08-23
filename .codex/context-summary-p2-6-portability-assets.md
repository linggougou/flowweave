# P2.6 Flow 可移植性与低风险资产维护上下文摘要

## 目标与授权

- 用户在 P2.5 完成交付、被告知下一阶段需更新路线后明确回复“继续”。
- 本轮将其解释为继续 post-v1 backlog 的 P2.6，不解释为解冻 P3/P4 或 vNext 产品模型。
- 当前分支：`codex/p2-6-portability-integration`，基线 `54cbfa1`。

## 生命周期与路线

- 生命周期：S4 → S5 → S6；功能与本地验证已完成，远端双矩阵会签后进入 S7。
- 当前里程碑：P2.6 本地 Flow 可移植性与低风险资产维护。
- 主闭环：统一安全导出 → Studio 导入新副本 → 补齐输入 → 运行；Web 重命名为独立低风险闭环。
- 真源：`PROJECT_ROUTE_LOCK.md`、`docs/exec-plans/active/post-v1-development-roadmap.md`、`docs/exec-plans/active/p2-6-portability-assets.md`。

## 已确认基线

- P2.5 已在 main `54cbfa1` 完成，Node 20/24 CI 双绿。
- 扩展现有导出：`MSG_EXPORT_FLOW` → `buildFlowFromEvents` → `JSON.stringify` → 浏览器下载。
- 密码录制已默认变量化，但没有通用可移植/安全导出函数。
- repository 的 `saveFlow` 是 upsert，同 ID 会覆盖并生成历史版本；不能直接作为导入语义。
- local-api 已支持保存、读取、版本和重命名，尚无 import-as-copy 合同。
- Studio 已有 Electron IPC/preload/service 模式，适合新增受控文件对话框。
- Web 已有重命名后端，只缺 API client 与前台交互。

## 复用路径与测试模式

- `packages/flow-dsl/src/schema.ts`：`flowDocumentSchema`、`parseFlowDocument`。
- `packages/project-knowledge/src/repository.ts`：真实 SQLite、Flow save/list/get/version 模式。
- `packages/local-api/src/index.ts`：项目级 JSON API 与错误返回模式。
- `apps/studio/electron/main.ts` / `preload.ts` / `services.ts`：IPC 与 renderer-safe 业务接口。
- `apps/extension/entrypoints/background.ts`：导出消息与下载 JSON 合同。
- `apps/web/src/App.tsx`：项目/任务选择、异步详情请求守卫。
- 测试：Vitest、临时 SQLite、真实回环 HTTP、happy-dom/createRoot、产品合同测试。

## 风险与边界

- Renderer 不得传任意文件路径给主进程。
- 导入文件限制 1 MiB；失败不得写库。
- 导入永远新 ID，避免误用 upsert 覆盖来源任务。
- 当前 Flow schema 不含 Cookie/Header/HAR/Storage State；只处理真实 schema 可识别风险，不宣称完全脱敏。
- 执行记录删除、路径安全迁移、版本 diff 延后到 P2.7；本阶段不新增 DELETE 或递归清理。
- P3/P4、vNext 输入节点与暂停继续继续冻结。

## 集成结果

- G1-G5 均按独立 worktree 交付并经独立 Reviewer 复审为 PASS，无剩余 P0/P1。
- G6 真实往返从含密码、URL 凭据和本机上传绝对路径的来源 Flow 导出，经空项目导入为新副本、补齐输入后运行 `10/10` 步骤成功；JSON 不含密码与原始路径。
- Web 真实浏览器重命名、刷新持久化和 `375×812` 无横向溢出均通过，验收后恢复原名称。
- Studio Electron、renderer、本地 API 与原生模块真实启动通过；macOS 锁屏阻止原生文件对话框的人机点击，未绕过锁屏，以 `167/167` 文件边界测试、真实临时文件服务、Electron 启动和签名/原生模块验证作为替代证据。
- Node 24 完整 smoke、recorded replay `25/25`、官方 registry 审计和 portability 往返通过；Node 20 无缓存 typecheck/test/build、登录 `4/4` 与 portability 往返通过；依赖已恢复到 Node 24 并再次通过 doctor 与往返。

## 工具与替代记录

- CodeGraph `.codegraph/` 存在且索引已是最新；CLI `status`/`sync`/`query`/`impact` 可用。
- 首次误用了不存在的 `codegraph context --max-files`，准确报错为 `unknown option '--max-files'`；按帮助改为 `--max-nodes` 后继续。
- 中文自然语言 `context` 召回质量有限，已用精确符号 query/impact、`rg` 与具体源码阅读补足。
- coverage provider 当前未配置；按既有项目策略不新增依赖，以边界测试、分层集成测试和全量 smoke 作为替代证据。
