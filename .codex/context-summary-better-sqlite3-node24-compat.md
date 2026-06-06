## 项目上下文摘要（better-sqlite3 与 Node 24 兼容修复）

生成时间：2026-06-06 20:15:00 CST

### 1. 相似实现与仓库定位

- **实现1**: [packages/project-knowledge/package.json](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/package.json:1)
  - 模式：`project-knowledge` 直接依赖 `better-sqlite3`
  - 可复用：无，本次为只读调研
  - 需注意：声明范围是 `^11.8.1`，但锁文件当前实际解析到 `11.10.0`
- **实现2**: [pnpm-lock.yaml](/Users/ling/codeHome/A_Mine/flowweave/pnpm-lock.yaml:1841)
  - 模式：锁文件确定真实安装版本
  - 可复用：无，本次以锁定版本为准分析兼容性
  - 需注意：`drizzle-orm` 当前也绑定到 `better-sqlite3@11.10.0`
- **实现3**: [package.json](/Users/ling/codeHome/A_Mine/flowweave/package.json:1)
  - 模式：仓库根 `engines.node` 仅要求 `>=20`
  - 可复用：无
  - 需注意：仓库没有继续要求 Node 18，因此 `better-sqlite3` 12.x 删除 Node 18 支持不会直接违反仓库基线
- **实现4**: [apps/studio/package.json](/Users/ling/codeHome/A_Mine/flowweave/apps/studio/package.json:1)
  - 模式：Electron 桌面端当前使用 `electron@^33.2.1`
  - 可复用：无
  - 需注意：`better-sqlite3` v12.0.0 删除的是 Electron 26/27/28，不影响当前 Electron 33

### 2. 项目约定

- **命名约定**: monorepo 包名为 `@flowweave/*`
- **文件组织**: 依赖声明在各包 `package.json`，真实解析版本在 `pnpm-lock.yaml`
- **代码风格**: 依赖升级做最小差异修改，文档只补运行约束，不扩写新脚本

### 3. 可复用组件清单

- 无专用组件复用；本次修改聚焦现有依赖声明、锁文件与启动文档。

### 4. 测试与验证策略

- **验证方式1**: 读取仓库依赖声明与锁文件，确认真实版本
- **验证方式2**: 查询官方 npm 元数据与官方 GitHub Releases
- **验证方式3**: 在本机 `Node v24.14.0` 临时目录执行 `npm install better-sqlite3@11.10.0` / `12.1.1`，验证安装脚本行为
- **验证方式4**: 在仓库内分别切到 Node 24 与 Node 20，执行安装与 smoke / e2e 回归，验证跨 Node 主版本切换约束
- **观察点**:
  - Node 24 的 Node ABI 为 `137`
  - `better-sqlite3@11.10.0` 是否提供 `node-v137` 预编译产物
  - `better-sqlite3` 何时在官方 release / engines 中显式纳入 Node 24
  - 切换 Node 主版本后，`pnpm` 是否会自动重跑原生模块安装脚本

### 5. 依赖和集成点

- **外部依赖**: `better-sqlite3`、`drizzle-orm`
- **内部集成点**:
  - [packages/project-knowledge/src/db/client.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/src/db/client.ts:5)
  - [packages/project-knowledge/src/repository.test.ts](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/src/repository.test.ts:5)
- **配置来源**:
  - [packages/project-knowledge/package.json](/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/package.json:23)
  - [pnpm-lock.yaml](/Users/ling/codeHome/A_Mine/flowweave/pnpm-lock.yaml:1841)

### 6. 官方资料与关键结论

- **better-sqlite3 README**
  - 安装章节写明：仅支持“当前受支持的 Node.js”，LTS 提供预编译二进制；安装问题看 troubleshooting
  - 升级章节明确要求先看 release notes
- **better-sqlite3 troubleshooting**
  - 安装失败时首先建议使用最新版本 `better-sqlite3`
  - Electron 场景才单独建议 `electron-rebuild`
- **better-sqlite3 v11.10.0 release（2025-05-07）**
  - 资产列表只包含 `node-v108`、`node-v115`、`node-v127`、`node-v131`
  - 不包含 Node 24 对应的 `node-v137`
- **better-sqlite3 v12.0.0 release（2025-06-21）**
  - 说明中明确写了“Add node v24 to build matrix”
  - npm `engines.node` 开始显式包含 `24.x`
- **better-sqlite3 v12.1.0 release（2025-06-23）**
  - 说明中写了“Use node-abi 4.9.0”
  - 资产列表出现 `node-v137-*`
  - 说明这是首个同时具备 Node 24 engines 声明和 Node 24 预编译资产的版本
- **仓库内升级后实测**
  - `better-sqlite3@12.1.1` 可在 Node 24 与 Node 20 的临时目录直接安装成功
  - 仓库内切到 Node 24 后执行 `pnpm install`，`project-knowledge` 测试与 `SKIP_E2E=1 pnpm smoke` 均通过
  - 从 Node 24 切回 Node 20 时，普通 `pnpm install` 不会重建原生模块，必须执行 `pnpm install --force`

### 7. 关键风险点

- **安装风险**: `11.10.0` 在 Node 24 上缺少 `node-v137` 预编译二进制，安装会先 miss prebuild
- **环境风险**: 即使源码理论可编译，如果开发机没有 Xcode CLT / 构建链，`node-gyp rebuild` 会失败
- **升级风险**: 升到 12.x 会失去 Node 18 与旧 Electron 26-28 支持；但按当前仓库基线，这一风险对 FlowWeave 很低
- **切换风险**: 升级后虽然双 Node 主版本都可运行，但切换 20 / 24 时不能只跑普通 `pnpm install`，需要 `pnpm install --force`
- **最小改动方向**: 以“升级 `better-sqlite3` 到至少 `12.1.0` 并刷新 lockfile”为优先，并在文档里明确 `pnpm install --force` 的切换要求
