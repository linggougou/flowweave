# FlowWeave P1 完整开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 或 best-of-n-runner worktree 并行实现。每轨道独立分支，验收后合并 `main`。

**Goal:** 交付 P1 最小闭环——浏览器扩展录制 → 流程归一化 → Playwright 执行 → Studio 查看结果；知识库落盘骨架可用。

**Architecture:** 五轨道 worktree 并行：`recorder`、`runtime`、`extension`、`studio`、`project-knowledge`。`main` 先锁定 `shared` 录制协议与 Flow DSL v1。各轨道只改授权目录，集成由主代理在 `main` 合并后跑全量验证。

**Tech Stack:** TypeScript, pnpm, Turborepo, Zod, Playwright, WXT, Electron, SQLite+Drizzle, Vitest

---

## 轨道与分支映射

| 轨道 | 分支 | Worktree 路径 | 负责包/应用 | 依赖 |
|------|------|---------------|-------------|------|
| R1 | `feat/p1-recorder` | `.worktrees/feat-p1-recorder` | `packages/recorder`, `packages/shared`（协议） | `flow-dsl`（main） |
| R2 | `feat/p1-runtime` | `.worktrees/feat-p1-runtime` | `packages/runtime` | `flow-dsl`, `recorder` 类型 |
| R3 | `feat/p1-extension` | `.worktrees/feat-p1-extension` | `apps/extension` | `recorder` 公共 API |
| R4 | `feat/p1-studio` | `.worktrees/feat-p1-studio` | `apps/studio`, `packages/ui`（最小） | `runtime`, `project-knowledge` API |
| R5 | `feat/p1-knowledge` | `.worktrees/feat-p1-knowledge` | `packages/project-knowledge` | `shared`, `flow-dsl` |

**合并顺序：** R1 → R5 → R2 → R3 → R4（接口稳定后合应用层）

---

## 验收标准（P1 Done）

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` 全绿
- [ ] `examples/fixtures/login.html` 本地页可录制至少 3 步并保存为 Flow JSON
- [ ] `runtime` 可 headless 回放该 Flow，输出 `ExecutionResult`（success/fail + step logs）
- [ ] `project-knowledge` 可创建项目目录、保存 Flow 与一次执行记录
- [ ] Extension 可在 Chrome 加载（dev unpacked），Side Panel 显示录制状态
- [ ] Studio 可打开项目列表、触发一次执行、展示步骤日志（只读 UI 即可）

---

## 主代理前置任务（main）

### Task 0: 提交 P0 基线 + 录制协议契约

**Files:**
- Create: `packages/shared/src/recording-protocol.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `.gitignore`（`.worktrees/`）
- Create: `examples/fixtures/login.html`

**契约要点：**

```typescript
// RecordedEventType: click | fill | navigate | select | scroll | keypress
// RecordedEvent: { id, type, timestamp, url, frameId?, payload }
// RecorderSessionMeta: { sessionId, projectId, startedAt }
```

- [ ] 实现 `recording-protocol.ts` 与 Zod schema
- [ ] 添加 `examples/fixtures/login.html` 静态登录页
- [ ] 提交：`chore: P0 基线与 P1 录制协议契约`

---

## 轨道 R1: recorder

### Task R1-1: 事件归一化器

**Files:**
- Create: `packages/recorder/src/normalize.ts`
- Create: `packages/recorder/src/normalize.test.ts`
- Modify: `packages/recorder/src/index.ts`

**步骤：**
- [ ] 测试：`click` 事件 → `NormalizedStep` type `click` + `Target`
- [ ] 测试：`fill` 事件 → `NormalizedStep` type `fill`
- [ ] 测试：`navigation` → `NormalizedStep` type `navigate`
- [ ] 实现 `normalizeRecordedEvent(event): NormalizedStep | null`
- [ ] 导出 `buildFlowFromEvents(events, meta): FlowDocument`

**验收：** `pnpm --filter @flowweave/recorder test` 全通过

---

## 轨道 R2: runtime

### Task R2-1: Playwright 执行器

**Files:**
- Create: `packages/runtime/src/playwright-runner.ts`
- Create: `packages/runtime/src/playwright-runner.test.ts`（mock 或 fixture HTML）
- Modify: `packages/runtime/package.json`（依赖 `playwright`）
- Modify: `packages/runtime/src/index.ts`

**步骤：**
- [ ] 添加 `playwright` 依赖
- [ ] 测试：对 `file://` fixture 执行 `navigate` + `click` 步骤
- [ ] 实现 `executeFlow(flow, options): Promise<ExecutionResult>`
- [ ] `ExecutionResult`: `{ executionId, status, steps: StepLog[] }`

**验收：** 集成测试可跑 `examples/fixtures/login.html` 最小流程

---

## 轨道 R3: extension

### Task R3-1: WXT 工程初始化

**Files:**
- Create: `apps/extension/wxt.config.ts`
- Create: `apps/extension/entrypoints/background.ts`
- Create: `apps/extension/entrypoints/content.ts`
- Create: `apps/extension/entrypoints/sidepanel/`（React 可选最简 HTML）
- Modify: `apps/extension/package.json`

**步骤：**
- [ ] 安装 `wxt`, `@wxt-dev/module-react`（可选）
- [ ] content script 监听 click/input，发送 `RecordedEvent` 到 background
- [ ] background 聚合事件，调用 `@flowweave/recorder` 归一化预览
- [ ] Side Panel 显示事件计数与「导出 JSON」按钮（下载 Flow 草案）
- [ ] `pnpm --filter @flowweave/app-extension build` 产出 `dist/`

**验收：** `wxt build` 成功；README 补充加载说明

---

## 轨道 R4: studio

### Task R4-1: Electron 壳 + 本地 API

**Files:**
- Create: `apps/studio/electron/main.ts`
- Create: `apps/studio/electron/preload.ts`
- Create: `apps/studio/src/App.tsx`（Vite）
- Create: `apps/studio/vite.config.ts`
- Modify: `apps/studio/package.json`

**步骤：**
- [ ] 依赖 `electron`, `vite`, `react`, `react-dom`
- [ ] 主进程暴露 IPC：`listProjects`, `runFlow`, `getExecution`
- [ ] 渲染进程：项目列表 +「运行」按钮 + 步骤日志表格
- [ ] 调用 `@flowweave/runtime` + `@flowweave/project-knowledge`

**验收：** `pnpm --filter @flowweave/app-studio dev` 可启动窗口

---

## 轨道 R5: project-knowledge

### Task R5-1: SQLite 存储层

**Files:**
- Create: `packages/project-knowledge/src/db/schema.ts`（Drizzle）
- Create: `packages/project-knowledge/src/db/client.ts`
- Create: `packages/project-knowledge/src/repository.ts`
- Create: `packages/project-knowledge/src/repository.test.ts`
- Modify: `packages/project-knowledge/package.json`（`drizzle-orm`, `better-sqlite3`）

**表：** `projects`, `flows`, `executions`, `execution_steps`

**API：**
- `createProject(name)`
- `saveFlow(projectId, flow: FlowDocument)`
- `saveExecution(projectId, result: ExecutionResult)`
- `listProjects()`, `getFlow(flowId)`

**验收：** 内存或临时目录测试通过；默认路径 `~/.flowweave/projects`

---

## 集成任务（main，合并后）

### Task INT-1: 端到端示例脚本

**Files:**
- Create: `examples/run-login-flow.ts`
- Create: `docs/guides/p1-e2e.md`

- [ ] 脚本：加载 fixture Flow → runtime 执行 → knowledge 存盘
- [ ] 文档：从扩展录制到 studio 查看的完整路径

### Task INT-2: 合并与回归

- [ ] 按顺序 merge R1→R5→R2→R3→R4
- [ ] 解决冲突，跑全量 CI
- [ ] 更新 `README.md` P1 完成状态

---

## 并行调度命令（主代理）

```bash
# 创建 worktrees（见 orchestration 文档）
git worktree add .worktrees/feat-p1-recorder -b feat/p1-recorder
# ... 各轨道

# 各 worktree 内
pnpm install && pnpm build && pnpm test
```

## 风险与回退

| 风险 | 缓解 |
|------|------|
| 接口漂移 | 协议先合 `main` |
| Playwright 下载慢 | CI 使用 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` + cache |
| Electron 体积 | P1 仅 dev 模式，不打安装包 |

---

## P2+ 预告（不在此计划执行）

- 页面理解、HAR 分析、AI 编排、Web 控制台加强
