# FlowWeave post-v1 开发计划

## 1. 当前基线

- 生命周期：P2 收口 / v1 先跑通版维护。
- 已完成：P0、P1、P2；M1-M4；真实页面 recorded replay `25/25`；Node 20/24 双基线；macOS 本地预览 `.app + DMG`。
- M5 已有最小能力：扩展清空录制、Flow JSON 导出、Studio Flow 重命名。
- 当前没有活跃 worktree 或并行轨道。
- P3 深度页面/网络理解与 P4 AI 编排继续冻结。

## 2. 执行顺序

### R0：v1 主线集成与发布收口

目标：把已验收的 macOS 打包分支安全并入 `main`，建立明确的内部预览与公开发布边界。

交付物：

1. `codex/v1-release-packaging` fast-forward 合入 `main`。
2. main Node 20/24 CI 双绿。
3. 本地 DMG 安装/启动复验与发布清单。
4. Developer ID、公证、正式 `.icns` 图标保持显式外部阻塞，不包装为已完成。

退出门禁：main CI 双绿，工作区洁净，`.codex/verification-report.md` 有 main 会签证据。

### Wave A：Flow 可移植性闭环

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

1. R0：0.5 天，完成 main 集成和复验。
2. Wave A：2-4 天，优先形成可移植性闭环。
3. Wave B：1-2 天，补齐暂停/继续录制。
4. Wave C：按单项 1-2 天拆分实施。
5. vNext 协议设计：2-3 天；用户确认路线后再制定实现编排板。
