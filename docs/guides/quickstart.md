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

| 端         | 操作                                                              |
| ---------- | ----------------------------------------------------------------- |
| **Studio** | 选项目 → 选**自动化任务** → **运行任务** → 查看步骤日志与截图路径 |
| **Web**    | 选项目 / 自动化任务 → **运行记录** 或 **版本记录**                |

三端读取同一路径：`~/.flowweave/projects/`。

---

## 5. 安全导出、导入与重命名

### 文件合同与处理范围

- 扩展与 Studio 导出的文件都是 `schemaVersion: 1` 的裸 `FlowDocument` JSON，不使用额外 envelope。
- 导出会处理当前 schema 中可识别的敏感变量默认值、密码字面量、本机上传路径和 URL 明显凭据，并展示实际产生的 warning 数量。普通业务文本仍需人工复核。
- Studio 每次导入都创建新的 `flowId`、改用目标项目 ID，并生成“（导入）”或带序号的新名称；不会静默覆盖已有任务。
- Studio 只接受单个、最大 **1 MiB** 的 JSON 文件。导入前先校验格式和版本，失败不会写入 Flow 或版本半成品。
- 导出中新建或被硬化的变量会标为必填；直接移除的值不会保留，需要人工复核业务语义并按需补充。导入后先补齐必填变量，再运行任务。

### Extension 与 Studio 操作

1. 在扩展侧栏完成录制并确认任务名称，点击 **导出 Flow JSON**。扩展会触发浏览器下载，并提示实际处理项数；即使为 0，也要检查业务文本。
2. 在 Electron Studio 选中项目与任务后，点击 **导出 JSON**。Studio 通过系统保存对话框选择位置，不接受 renderer 传入任意文件路径。
3. 在目标项目点击 **导入 JSON**，通过 Electron 系统打开对话框选择文件。用户取消对话框时无错误、无数据库写入，也不会改变当前选择。
4. 导入成功后确认选中的是新副本，按 Studio 提示补齐必填变量，再运行并查看执行记录。

Studio 的 Browser fallback 没有原生文件能力，因此不会展示 **导入 JSON** / **导出 JSON** 入口；需要文件往返时请使用 Electron Studio。Web 控制台提供任务旁的 **重命名** 操作，保存后刷新仍应显示新名称。

### 自动往返 smoke

```bash
pnpm e2e:portability
```

该命令会构建相关领域包，在独立临时数据目录中创建来源项目与空目标项目，执行安全导出 → JSON 往返 → 导入新副本 → 补齐变量 → headless Playwright 登录 fixture → 保存并读取执行记录。命令结束后会清理自身临时目录；任一断言失败都会以非零状态退出。

### 手测清单

- [ ] 扩展导出文件是裸 `schemaVersion: 1` 文档，提示数量与实际 warning 一致，并提醒检查业务文本。
- [ ] Studio 导出与导入均打开 Electron 系统文件对话框；取消后没有成功提示、文件写入或新任务。
- [ ] 超过 1 MiB、非法 JSON 或不兼容版本被拒绝，目标项目仍无新增任务。
- [ ] 同一文件连续导入两次得到不同 `flowId` 和递增的新副本名称，原任务未被覆盖。
- [ ] 补齐所有必填变量后，导入任务运行成功且执行记录可查。
- [ ] Browser fallback 不显示原生文件导入导出入口。
- [ ] Web 重命名任务后刷新页面，新名称仍保留。

---

## 6. 常见问题

### `e2e:login` 报 Playwright 浏览器缺失

```bash
pnpm --filter @flowweave/runtime exec playwright install chromium
```

### 扩展「未连接本地 API」

使用已构建的桌面应用时，先打开织流 Studio，再在扩展中点击“重新连接”，无需另外启动服务。

仅在源码开发且没有启动 Studio 时，才需要运行 `pnpm dev:web`；可用 `curl http://127.0.0.1:3847/api/health` 检查开发服务。

### 切换 Node 20 / 24 后 `better-sqlite3` 加载或编译失败

请确认当前 Node 版本是仓库支持的 **20** 或 **24**，然后在切换主版本后执行一次 `pnpm install --force`，让原生模块按当前 Node ABI 重新安装。

### Studio 找不到自动化任务

先在扩展侧栏 **同步到知识库**，或在 Web 控制台确认该项目下已有自动化任务列表。

---

## 7. 下一步

- 执行细节：[p1-e2e.md](./p1-e2e.md)
- Web / API：[web-console.md](./web-console.md)
- 运行产物：[run-artifacts.md](./run-artifacts.md)
- **v1 手测清单**：[manual-qa.md](./manual-qa.md)
- **发行说明**：[v1.0.0.md](../releases/v1.0.0.md)
- **开发计划**：[run-first-roadmap.md](../superpowers/plans/2026-05-26-run-first-roadmap.md)（AI 功能已冻结，先跑通为主）
