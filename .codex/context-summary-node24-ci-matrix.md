## 项目上下文摘要（Node 24 CI 双基线）

生成时间：2026-06-06 21:05:00 CST

### 1. 相似实现分析

- **实现1**: [.github/workflows/ci.yml](/Users/ling/codeHome/A_Mine/flowweave/.github/workflows/ci.yml:1)
  - 模式：当前只有单一 `verify` job，固定 Node 20，步骤是 `install -> playwright install -> typecheck -> lint -> test -> build`
  - 可复用：现有 pnpm 与 Node setup、Playwright 安装步骤
  - 需注意：还没有 Node 24 覆盖，也没有直接复用根级 `smoke` 脚本
- **实现2**: [package.json](/Users/ling/codeHome/A_Mine/flowweave/package.json:5)
  - 模式：根脚本把仓库级验证收敛到 `smoke` / `smoke:full`
  - 可复用：`pnpm smoke` 已经覆盖 `typecheck + test + build + e2e:login`
  - 需注意：`smoke` 不含 `lint`，所以 CI 仍需单独保留 `pnpm lint`
- **实现3**: [docs/guides/quickstart.md](/Users/ling/codeHome/A_Mine/flowweave/docs/guides/quickstart.md:5)
  - 模式：面对开发者的推荐入口已经说明 Node 20 是默认稳定基线，但也允许 Node 24
  - 可复用：把 CI 基线升级到双版本后，文档语义与自动验证会更一致
  - 需注意：切换 Node 主版本后必须 `pnpm install --force`
- **实现4**: [docs/guides/manual-qa.md](/Users/ling/codeHome/A_Mine/flowweave/docs/guides/manual-qa.md:7)
  - 模式：人工验收文档仍把 Node 20 当默认准备条件
  - 可复用：说明仓库仍可保留 Node 20 作为默认推荐环境
  - 需注意：CI 扩成双基线不等于放弃 Node 20 默认基线

### 2. 项目约定

- **命名约定**: 工作流 job 命名简洁，根命令优先走 `pnpm`
- **文件组织**: GitHub Actions 统一在 `.github/workflows/ci.yml`
- **代码风格**: YAML 做最小差异修改，优先复用已有脚本，不把 workflow 逻辑散落成多段重复命令

### 3. 可复用组件清单

- `package.json` 中的 `smoke`：统一整仓验证入口
- `.github/workflows/ci.yml` 中现有 setup 步骤：Node、pnpm、Playwright 安装模板
- `README.md` / `docs/guides/quickstart.md`：已经明确 Node 20 / 24 和原生模块切换约束

### 4. 测试策略

- **本地验证1**: Node 24 下 `pnpm install --force && pnpm e2e:login`
- **本地验证2**: Node 24 下 `pnpm smoke`
- **本地验证3**: 改完 workflow 后切回 Node 20，执行 `pnpm install --force && pnpm smoke`
- **本地验证4**: Node 20 下 `pnpm lint`

### 5. 依赖和集成点

- **外部依赖**: GitHub Actions、`actions/setup-node`、`pnpm/action-setup`
- **内部依赖**:
  - `package.json` 的 `smoke`
  - `packages/runtime` 依赖的 Playwright 浏览器安装
- **配置来源**:
  - `.github/workflows/ci.yml`
  - `package.json`

### 6. 技术选型理由

- **为什么用 matrix**: 能在不复制整份 workflow 的前提下，把同一条验证链同时跑在 Node 20 / 24 上
- **为什么复用 `pnpm smoke`**: 避免 CI 和本地验证命令分叉，减少“本地过 / CI 不过”的口径差
- **为什么仍保留单独 `pnpm lint`**: `smoke` 不包含 lint，直接删掉会降低现有质量门槛

### 7. 关键风险点

- **切换风险**: 本地来回切换 Node 20 / 24 时必须 `pnpm install --force`
- **时长风险**: CI 从单 Node 扩到双 Node 后耗时会近似翻倍
- **稳定性风险**: 如果 Node 24 的 `smoke` 在 CI 环境与本机行为不同，需要回到 workflow 依赖安装链继续排查
