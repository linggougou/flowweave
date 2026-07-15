# FlowWeave v1 macOS 发布打包计划

## 阶段目标

在不改变现有 Electron/Vite/Playwright/SQLite 技术栈的前提下，为 Studio 建立本机可重复的 macOS 应用打包与验收链路。

## 可验收交付物

- Studio `v1.0.0` 应用 manifest。
- Electron 打包配置与配置合同测试。
- 本地目录包命令和 DMG 命令。
- `.app`、DMG、native binding、启动与挂载验证证据。
- 更新后的发布文档和 `.codex` 验收记录。

## Definition of Done

- `pnpm --filter @flowweave/app-studio package:dir` 成功。
- `pnpm --filter @flowweave/app-studio package:mac` 成功。
- 生成的 `.app` 可启动并显示 Studio 窗口。
- DMG 可挂载，内部包含应用。
- 未配置证书时明确标记为未签名本地预览包。
- Node 24 本地门禁与远端 CI 通过。

## 执行步骤

1. 用测试锁定 appId、productName、版本、产物目录、文件白名单与 native binding 解包要求。
2. 引入 electron-builder v26 并添加 `package:dir`、`package:mac` 脚本。
3. 生成目录包，修复 workspace 依赖或 native addon 打包问题。
4. 生成 DMG，并执行 bundle、架构、启动、挂载检查。
5. 更新 `docs/releases/v1.0.0.md` 与贡献文档。
6. 提交、推送并等待 CI。

## 风险与回滚

- 风险：pnpm workspace 依赖未被正确收集。处理方式是以真实包内依赖检查为准，不通过则停止发布。
- 风险：`better-sqlite3` 被 asar 压缩后无法加载。配置 `asarUnpack` 并执行 Electron 真实数据库加载验证。
- 风险：无 Developer ID 导致 Gatekeeper 拦截。当前只交付本机预览包，并在文档中明确限制。
- 回滚：删除新增打包配置、脚本和依赖即可恢复当前源码构建链，不影响业务数据。

## 明确非目标

- Windows/Linux 安装器。
- 自动更新与 GitHub Release 自动发布。
- Apple Developer 证书采购、正式签名、公证和品牌图标定稿。
- 任何 P3/P4 功能。

## 完成状态

- 状态：已完成并通过本地预览包验收。
- 完成日期：2026-07-15。
- 证据：`.codex/verification-report.md` 的“v1 macOS 本地预览包验收”。
- 外部分发限制：Developer ID 签名、Apple 公证和正式 `.icns` 图标仍待后续发布阶段补齐。
