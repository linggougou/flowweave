# v1 macOS 发布打包上下文摘要

## 任务目标

- 将已通过 P2 门禁的 Studio 从“源码可运行”推进到“本机可安装的 macOS `.app` 与 `.dmg`”。
- 统一 `v1.0.0` 发布文档与应用 manifest 版本。
- 建立可重复的本地打包、产物校验与后续签名/公证入口。

## 路线与生命周期

- 路线锁：`PROJECT_ROUTE_LOCK.md` 的 P2 收口、M4 工程质量与发布准备。
- 生命周期阶段：S7 验收 / 发布判断，实施中暂时回到 S5-S6 完成缺失发布交付物。
- 里程碑真源：`PROJECT_ROUTE_LOCK.md`、`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`、`docs/releases/v1.0.0.md`。
- 阶段出口：Studio 可在当前 Mac 生成并校验可启动的 `.app` 与 `.dmg`。
- 最小闭环：发布配置合同 -> 未签名目录包 -> DMG -> bundle/native binding/启动验证 -> 文档与 CI。

## 已确认事实

- 稳定分支已 fast-forward 到 `main`，无历史重写。
- 当前所有 workspace manifest 版本仍为 `0.1.0`，而发布文档已使用 `v1.0.0`。
- Studio 没有 `package` / `dist` 脚本，也没有 Electron 打包依赖。
- 当前 `build` 只生成 `dist/` 与 `dist-electron/`，不是可分发应用。
- 本机没有有效代码签名身份，不能宣称 Developer ID 签名或 Apple 公证完成。
- 仓库没有正式品牌 `.icns` 图标，首个本地安装包只能使用默认图标并记录发布阻塞。

## 技术选择

- 采用 `electron-builder` v26 稳定线，不替换 Electron/Vite 技术栈。
- 第一阶段生成未签名 `dir` 与 `dmg`，关闭自动签名发现，避免误用本机证书。
- 正式签名与公证通过环境凭据启用，未提供凭据时不伪装成功。
- 保留现有 Electron 专用 `better-sqlite3` binding 生成与校验，不绕过原生模块门禁。

## 工具替代

- Context7 不可用：改用 electron-builder 官方站点、官方 GitHub README 与 npm registry 元数据。
- 本机无 Docker：macOS 交付只使用本机实际 artifact 验证，不推断 Windows/Linux 安装包状态。

## 明确非目标

- 不开发 Windows/Linux 安装包。
- 不新增自动更新、发布服务器或 GitHub Release 上传。
- 不伪造 Developer ID 签名、Apple 公证或正式品牌图标。
- 不解冻 P3/P4，不修改业务主链路。

## 验收标准

- 发布配置合同测试通过。
- Node 24 下 Studio build、目录包和 DMG 生成成功。
- `.app` bundle 结构、架构、原生 SQLite binding 与 GUI 启动通过。
- DMG 可挂载并包含应用。
- `pnpm lint`、相关测试与 CI 通过。
