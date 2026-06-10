# 快速启动（先跑通，无 AI）

本指南帮助你在 **30 分钟内** 跑通 FlowWeave 主链路：验证工程 → 录制 → 同步知识库 → Studio 回放 → Web 查看。

**要求**：Node.js **24**（默认稳定基线，见仓库根目录 `.nvmrc`）或 **20**（兼容）、pnpm、macOS / Linux / Windows。

**验证口径**：GitHub Actions 会同时覆盖 `Node 20 / 24`；本地开发、排障和交付前自验默认以 Node 24 为准。

---

## 1. 安装与验证

```bash
cd flowweave
corepack enable
pnpm install

# 环境自检（Node、Playwright、API、数据目录）
pnpm doctor

# 一键 smoke：typecheck → test → build → e2e:login
pnpm smoke

# 跳过 e2e（仅验证编译与单元测试）
SKIP_E2E=1 pnpm smoke

# 完整 smoke（始终含 e2e）
pnpm smoke:full
```

首次 clone 若 `pnpm doctor` 提示 Playwright 缺失，执行：

```bash
pnpm --filter @flowweave/runtime exec playwright install chromium
```

`e2e:login` 成功后，数据写入 `~/.flowweave/projects/<项目ID>/`，运行产物在 `runs/<executionId>/`（含 `step-*.png` 等）。

如需逐步手动验证，仍可使用：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e:login
```

---

## 2. 启动本地服务

需要 **两个终端**（扩展同步依赖 Web API）。

### 终端 A：Web API + 控制台

```bash
pnpm dev:web
```

- Web 界面：<http://127.0.0.1:5174>
- API：<http://127.0.0.1:3847>（健康检查：<http://127.0.0.1:3847/api/health>）

### 终端 B：Studio 桌面端

```bash
pnpm dev:extension   # 可选：扩展开发
pnpm dev:studio      # Electron + Vite
```

Studio 启动后会自动确保本地有演示项目；也可使用 `e2e:login` 创建的项目数据。

---

## 3. 浏览器扩展（录制）

```bash
pnpm --filter @flowweave/app-extension build   # 或 dev:extension 开发模式
```

Chrome → **扩展程序** → **开发者模式** → **加载已解压的扩展程序** → 选择：

`apps/extension/dist/chrome-mv3`

1. 打开任意网页，点击扩展图标打开 **侧栏**
2. 在页面上点击、输入，侧栏 **事件计数** 应增加
3. 侧栏选择 **目标项目**（需终端 A 的 API 已启动）
4. 点击 **同步到知识库**

---

## 4. 回放与查看

| 端 | 操作 |
|----|------|
| **Studio** | 选项目 → **运行流程** → 查看步骤日志与截图路径 |
| **Web** | 选项目 / Flow → **执行历史** 或 **Flow 版本** |

三端读取同一路径：`~/.flowweave/projects/`。

---

## 5. 常见问题

### `e2e:login` 报 Playwright 浏览器缺失

```bash
pnpm --filter @flowweave/runtime exec playwright install chromium
```

### 扩展「未连接本地 API」

确认已运行 `pnpm dev:web`，且 `curl http://127.0.0.1:3847/api/health` 返回 `{"ok":true}`。

### 切换 Node 20 / 24 后 `better-sqlite3` 加载或编译失败

请确认当前 Node 版本是仓库支持的 **20** 或 **24**，然后在切换主版本后执行一次 `pnpm install --force`，让原生模块按当前 Node ABI 重新安装。

### Studio 找不到 Flow

先在扩展侧栏 **同步到知识库**，或在 Web 控制台确认该项目下已有 Flow 列表。

---

## 6. 下一步

- 执行细节：[p1-e2e.md](./p1-e2e.md)
- Web / API：[web-console.md](./web-console.md)
- 运行产物：[run-artifacts.md](./run-artifacts.md)
- **v1 手测清单**：[manual-qa.md](./manual-qa.md)
- **发行说明**：[v1.0.0.md](../releases/v1.0.0.md)
- **开发计划**：[run-first-roadmap.md](../superpowers/plans/2026-05-26-run-first-roadmap.md)（AI 功能已冻结，先跑通为主）
