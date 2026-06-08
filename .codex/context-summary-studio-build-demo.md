## 项目上下文摘要（Studio 成品编译与展示）

生成时间：2026-06-07 19:25:00 CST

### 1. 相似实现分析

- **实现 1**: `package.json`
  - 模式：仓库统一通过 `pnpm` + `turbo` 管理构建入口，应用级任务由 `pnpm --filter` 下钻执行。
  - 可复用：根脚本 `build`、`dev:studio`、`smoke`。
  - 需注意：仓库引擎要求 `node >= 20`，当前验证基线沿用 `Node v20.19.6`。
- **实现 2**: `apps/studio/package.json`
  - 模式：Studio 构建拆为 Electron 主进程构建和 Vite 前端构建两段。
  - 可复用：`pnpm --filter @flowweave/app-studio build`、`build:electron`、`dev`。
  - 需注意：当前没有 `package`、`dist:mac`、`electron-builder` 等安装器打包脚本。
- **实现 3**: `apps/studio/electron/main.ts`
  - 模式：生产模式下 Electron 通过 `loadFile(dist/index.html)` 加载前端静态产物。
  - 可复用：直接用 Electron CLI 在 `apps/studio` 目录运行当前目录应用。
  - 需注意：预加载脚本路径固定为 `dist-electron/preload.cjs`，构建产物需完整存在。
- **实现 4**: `apps/studio/scripts/build-electron.mjs`
  - 模式：使用 `esbuild` 输出 `dist-electron/main.mjs` 与 `dist-electron/preload.cjs`。
  - 可复用：无需额外打包器即可得到可运行主进程产物。
  - 需注意：`electron`、`playwright`、`@flowweave/runtime` 被 external 掉，运行时依赖必须已安装。
- **实现 5**: `apps/studio/vite.config.ts`
  - 模式：前端产物输出到 `dist`，并通过 `base: "./"` 支持本地文件加载。
  - 可复用：生产模式静态资源相对路径可直接被 Electron `loadFile` 消费。
  - 需注意：若要做安装器，还需要额外处理应用资源打包与 Electron 分发层。

### 2. 项目约定

- **命名约定**：应用包名使用 `@flowweave/app-*`，工作区命令优先用 `pnpm --filter`。
- **文件组织**：Electron 入口在 `apps/studio/electron`，前端入口由 Vite 输出到 `apps/studio/dist`。
- **代码风格**：已有 `.mjs` 脚本负责 Node ESM 构建任务，不额外引入新工具链。
- **运行基线**：当前主线验收继续统一使用 `Node v20.19.6`。

### 3. 可复用组件清单

- `package.json`：仓库级构建与 smoke 命令入口。
- `apps/studio/package.json`：Studio 构建与开发入口。
- `apps/studio/scripts/build-electron.mjs`：Electron 主进程与 preload 构建。
- `apps/studio/electron/main.ts`：生产模式窗口加载逻辑。
- `apps/studio/vite.config.ts`：静态前端产物输出配置。

### 4. 验证策略

- **目标 1**：在 `Node v20.19.6` 下成功执行 `pnpm --filter @flowweave/app-studio build`。
- **目标 2**：确认产物目录 `apps/studio/dist` 与 `apps/studio/dist-electron` 完整生成。
- **目标 3**：尝试直接启动 Electron 成品并捕获窗口证据。
- **目标 4**：如无法生成安装器，明确说明仓库当前只具备“可运行构建产物”，尚未具备“安装包”能力。

### 5. 依赖和集成点

- **外部依赖**：`electron`、`vite`、`esbuild`、`playwright`。
- **内部依赖**：`@flowweave/runtime`、`@flowweave/project-knowledge`、`@flowweave/ui` 等工作区包。
- **集成方式**：Electron 主进程加载 Vite 静态产物；前端通过别名直接消费 `packages/*/src`。
- **配置来源**：根 `package.json`、`apps/studio/package.json`、`apps/studio/vite.config.ts`。

### 6. 关键风险点

- **安装器缺失**：仓库未提供 `.app/.dmg/.pkg` 打包脚本，本轮更可能展示“可运行桌面成品”而非安装包。
- **运行环境**：Electron 需要图形会话，若当前终端环境无法直接显示窗口，需要退化为本机应用启动与截图验证。
- **Node 基线**：结论只对 `Node v20.19.6` 负责，Node 24 兼容性仍不是本轮目标。
