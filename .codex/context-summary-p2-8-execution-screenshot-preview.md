# P2.8 Studio 执行截图受控预览上下文摘要

## 1. 任务定位

- 日期：2026-08-24。
- 生命周期：S4 计划已冻结，准备进入 S5 分轨开发。
- 路线真源：`PROJECT_ROUTE_LOCK.md`。
- 里程碑真源：`docs/exec-plans/active/p2-8-execution-screenshot-preview.md`。
- 用户授权：P2.7 完成后要求继续开发；此前已要求自主 plan、worktree 并行、Sub-Agent 验收后回收。
- 主闭环：Studio 历史执行步骤截图通过固定业务 ID IPC 安全读取并在应用内只读展示。

## 2. 基线与代码事实

- 起点：main `b328ebacf1c5d3314c079f3995329f055e078878`，与 `origin/main` 一致，工作区 clean。
- Node `24.14.0`、pnpm `9.15.4`；CodeGraph 索引最新，113 files / 1273 nodes / 2669 edges。
- 开发前基线：`@flowweave/ui` `14/14`、`@flowweave/app-studio` `184/184`。
- runtime 已生成 `step-N.png`；SQLite 只存路径；Studio diagnostic / page snapshot 已结构化展示，截图仍经 `openPath(filePath)` 外部打开。
- `openPath` 仅校验非空便调用 `shell.openPath()`；renderer 可提交任意路径，与 P2.7 的固定业务能力边界不一致。
- 现有删除轨已经具备安全 ID、运行目录、symlink / 普通文件和 artifact 白名单，可作为只读 resolver 的审计参考，但不能直接假定 SQLite 路径可信。

## 3. 设计裁决

- 只支持 PNG 步骤截图；HAR、原始 diagnostic/page JSON、DOM、SVG/HTML/PDF 与外部 URL 均排除。
- renderer 只传 projectId、executionId、stepIndex；主进程从真实 execution 归属与受控 run root 推导文件。
- 安全读取检查 ID / index、execution / step 归属、目录和文件身份、symlink / hardlink、普通文件、`8 MiB`、PNG signature / IHDR / 像素上限与读取期间替换。
- 移除 renderer 通用 `openPath`；页面不展示 artifact 绝对路径。
- IPC 校验 main frame / 允许来源；Studio 壳启用 renderer sandbox、精确 CSP、导航与新窗口拒绝。Electron 大版本升级单独进入未来变更，不混入 P2.8。
- renderer 只用可回收 Blob URL；预览使用独立请求世代和完整上下文 guard，关闭、切换、删除、卸载时 revoke 并作废旧响应。

## 4. 分轨

- G1：`packages/project-knowledge/**`，受控截图 resolver 与故障注入。
- G2：Studio 纯 renderer 预览组件、测试与样式，不碰 `App.tsx` / IPC。
- G3：G1/G2 合入后完成 Electron 固定 IPC、App / 表格 / 诊断台接线和竞态保护。
- G4：独立 Judge、真实 Electron、全量验证、双 Node、远端会签与资源回收。

## 5. 工具与替代

- 已使用 CodeGraph `status` 与 `context` 审计调用链，索引为最新。
- `orchestration` skill 需要 Orca CLI，但本机 `command -v orca` 为空；按全局缺失工具协议改用 Codex 原生 Sub-Agent + Git worktree 等效编排，不跳过并行、隔离或验收。
- 使用 TDD、security-review、verification-loop 与 judge-harness；coverage provider 缺失时不为数字新增依赖，以关键故障分支和完整 smoke 替代。
