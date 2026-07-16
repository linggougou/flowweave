# FlowWeave post-v1 开发计划

## 1. 当前基线

- 生命周期：P2.5 post-v1 产品化 / 首次用户体验修复。
- 已完成：P0、P1、P2；M1-M4；真实页面 recorded replay `25/25`；Node 20/24 双基线；macOS 本地预览 `.app + DMG`。
- M5 已有最小能力：扩展清空录制、Flow JSON 导出、Studio Flow 重命名。
- 当前没有活跃 worktree 或并行轨道。
- P3 深度页面/网络理解与 P4 AI 编排继续冻结。

## 2. 执行顺序

### R0：v1 主线集成与发布收口

状态：已完成（2026-07-16）。

目标：把已验收的 macOS 打包分支安全并入 `main`，建立明确的内部预览与公开发布边界。

交付物：

1. `codex/v1-release-packaging` fast-forward 合入 `main`。
2. main Node 20/24 CI 双绿。
3. 本地 DMG 安装/启动复验与发布清单。
4. Developer ID、公证、正式 `.icns` 图标保持显式外部阻塞，不包装为已完成。

退出门禁：main CI 双绿，工作区洁净，`.codex/verification-report.md` 有 main 会签证据。

完成证据：`main` 已从 `0067363` fast-forward 到 `538da09`；GitHub Actions run `29484512985` 的 Node 20、Node 24 均成功。

### UX Foundation 1：敏感输入与同步连续性

状态：已完成（2026-07-16）。

目标：先关闭首次旅程中风险最高、且能独立验收的安全与信任缺口。

范围：

1. password 输入不进入录制 Flow 明文，统一转为必填变量占位符。
2. Studio 步骤摘要默认遮罩敏感变量，不在列表中回显原值。
3. Studio 窗口重新聚焦时刷新项目、Flow 与执行历史。
4. Studio 提供明确刷新按钮；发现新 Flow 后保持当前项目并自动选择新内容。
5. 补 recorder、extension、Studio 状态合同测试。

退出门禁：密码录制产物无明文；同步后无需重启 Studio 即可看到新 Flow；Node 24 定向测试、lint、typecheck 与 Node 20/24 CI 通过。

本地证据：recorder `54/54`、extension `21/21`、Studio `93/93`；Node 24 smoke 与 recorded replay `25/25`；Electron 实机验证自动恢复、刷新入口和旧 Flow 密码遮罩。远端 Node 20/24 CI 由分支推送后会签。

### UX Foundation 2：产品内首次启动

目标：打包 Studio 自动提供扩展所需的本地同步服务，并提供不依赖终端的扩展安装/连接引导。

实施前先冻结共享本地 API 边界，禁止 `apps/*` 直接互相依赖；优先抽取可被 Web 与 Studio 复用的本地 transport。

退出门禁：只启动 Studio 后扩展即可列出项目并同步 Flow；空项目页面不再展示 pnpm、端口或源码目录。

### UX Foundation 3：录制会话与命名

目标：建立开始、暂停、完成、预览、命名、确认同步的录制状态机。

退出门禁：暂停期间操作不进入 Flow；完成后可预览和命名；清空具备确认或短时撤销。

### UX Foundation 4：安全运行与可见进度

目标：运行前确认目标与影响，运行中展示进度、等待原因并允许取消。

退出门禁：用户可确认域名、环境、步骤数和高风险动作；可看到第 N/M 步并取消未完成执行。

### UX Foundation 5：业务视图与 Web 收口

目标：默认使用业务术语和任务结果，高级配置、选择器与原始日志进入专业详情。

退出门禁：首次用户无需理解 P2、Storage State、preflight、UUID 和 locator 即可完成主任务。

### Wave A：Flow 可移植性闭环（后移）

目标：让录制产物可安全导出、校验并重新导入本地知识库。

范围：

1. 定义脱敏导出合同，默认处理 Cookie、Header、HAR 路径和本地敏感变量。
2. Studio 提供 Flow JSON 导入入口，使用 `flowDocumentSchema` 结构化校验。
3. 明确冲突策略：新建副本，不静默覆盖同 ID Flow。
4. 导入/导出结果给出可诊断错误，不接受无提示失败。
5. 补 repository、Electron IPC、Studio UI 和往返 E2E 测试。

退出门禁：脱敏导出 -> 删除本地副本 -> 导入 -> Studio 运行通过；Node 24 smoke、recorded replay 与 Node 20/24 CI 通过。

### Wave B：录制暂停/继续闭环

目标：扩展录制过程中可暂停和继续，避免把无关操作写入会话。

范围：

1. Recorder session 增加明确的 recording/paused 状态合同。
2. 扩展侧栏使用状态按钮控制暂停/继续，清空继续保留为独立危险操作。
3. content/background 在 paused 状态不接收事件，恢复后沿用同一 session。
4. 页面刷新、侧栏重开和扩展 service worker 重启后状态一致。
5. 补 background contract、content contract 与浏览器手测。

退出门禁：录制 A -> 暂停并操作 B -> 继续录制 C，最终 Flow 只包含 A/C；扩展构建、测试与主线 CI 通过。

### Wave C：本地资产管理补齐

目标：补齐高频维护操作，不扩大为通用流程编排器。

候选范围按价值依次实施：

1. Web Flow 重命名 UI，与已有 API 对齐。
2. 执行记录删除，连同受控 runs 产物清理和确认流程。
3. Flow 版本 JSON diff，只读展示，不引入复杂编辑器。

每项独立提交和验收，不绑成一次大改。

## 3. vNext 设计门禁

现有《后台管理类网站交互式任务模板设计》只完成产品定义，尚未完成实现前置协议。进入编码前必须先冻结：

1. 输入节点的数据结构与 schema 迁移策略。
2. Studio 线性模板编辑模型与变量来源/消费关系。
3. Runtime / Electron 暂停继续会话协议、取消和异常恢复语义。

该阶段会改变 Flow 产品模型与 runtime 执行协议，必须先更新 `PROJECT_ROUTE_LOCK.md` 并获得用户确认。未经确认，不创建输入节点实现，不解冻 P3/P4。

## 4. 暂不开发

- AI/NL -> Flow、自愈选择器产品化。
- 深度 a11y 树、HAR 与步骤自动关联。
- 条件、循环、子流程、批量数据集。
- 云同步、多用户协作与权限体系。
- Windows/Linux 安装器与自动更新。

## 5. 推荐排期

1. R0：已完成。
2. UX Foundation 1：1-2 天，先关闭敏感输入与同步刷新缺口。
3. UX Foundation 2：2-4 天，完成产品内本地连接与首次启动。
4. UX Foundation 3：2-3 天，完成录制状态机、预览和命名。
5. UX Foundation 4：2-4 天，完成运行守卫、进度和取消。
6. UX Foundation 5：2-4 天，完成业务视图与 Web 结果收口。
7. Flow 可移植性与 vNext 协议设计在首次体验 P0/P1 收口后恢复。
