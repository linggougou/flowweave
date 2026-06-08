# Studio 桌面端签名恢复上下文摘要

## 任务目标

- 在当前电脑上实际运行 `@flowweave/app-studio` 桌面应用，而不是只停留在构建成功。
- 延续上一轮排障结果，优先解决 Electron GUI 启动即崩溃的问题。

## 当前路线与边界

- 项目根未提供物理 `PROJECT_ROUTE_LOCK.md`，当前按项目 `AGENTS.md` 指向的
  `docs/superpowers/plans/2026-05-26-run-first-roadmap.md` 作为等效路线真源。
- 本轮任务属于“本地跑通 / 成品启动体验”边界，不扩展业务功能，不改三端产品路线。
- 允许修改范围：项目 `.codex/` 留痕、必要时修复 `node_modules` 运行时包体、必要的最小启动脚本。
- 禁止修改范围：Flow DSL、runtime、studio UI 业务逻辑、`.idea/`、路线锁内容本身。

## 已确认事实

1. `Node 20.19.6` 是当前仓库本地主验收基线。
2. `pnpm --filter @flowweave/app-studio build` 之前已经通过。
3. `better-sqlite3` 的 Electron ABI 已修复到 `electron 33.4.11 / modules 130`。
4. 用户提供的崩溃报告显示：
   - `Namespace CODESIGNING, Code 2, Invalid Page`
   - 崩溃栈发生在 `dyld -> dlopen -> node::binding::get_linked_module`
5. 新增证据表明根因进一步收敛：
   - `ELECTRON_RUN_AS_NODE=1 pnpm --filter @flowweave/app-studio exec electron -e "require('better-sqlite3')"` 可成功输出 `loaded`
   - 说明 `better-sqlite3` 原生模块本体与 Electron ABI 已匹配，可被 Electron 的 Node 运行时加载
   - `codesign --verify --deep --strict node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/Electron.app`
     返回 `code has no resources but signature indicates they must be present`
   - 说明真正损坏的是 `Electron.app` bundle 的签名资源索引，而不是业务代码或 SQLite 模块本体

## 当前假设

- 上一轮尝试重签 `Electron.app` 后，`node_modules/.pnpm/electron@33.4.11/.../dist/Electron.app`
  处于“可执行文件存在、bundle 资源签名不完整”的半损状态。
- GUI 模式下通过 `.app` 启动时会触发 bundle 校验并崩溃；`ELECTRON_RUN_AS_NODE=1` 直接走可执行文件，因此未触发同一崩溃路径。

## 下一步

1. 先补 `operations-log.md` 留痕。
2. 定向恢复 `electron@33.4.11` 的 `dist` 包体，不碰业务代码与锁文件。
3. 保留已修复的 `better-sqlite3` Electron ABI。
4. 用 `Node 20.19.6` 重新验证：
   - `pnpm --filter @flowweave/app-studio build`
   - `pnpm --filter @flowweave/app-studio exec electron .`
   - 进程 / 窗口检查
