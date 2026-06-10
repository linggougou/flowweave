# FlowWeave 开发计划（先跑通，后智能）

> **生效日期**：2026-05-26  
> **原则**：现阶段不开发 AI 相关功能；优先让「录制 → 入库 → 回放 → 可查」在本地稳定跑通。  
> **AI 编排（原 P4）**：整体冻结，保留 `@flowweave/ai-orchestrator` 占位与已有启发式代码，**不接入 Studio / 扩展 / Web**。

> **2026-06-09 更新**
> - 真实页面稳定性 residual gaps 已收口并回主线。
> - 当前 recorded replay 基线已统一为 `25 = 23 fixture + 2 runtime-generated`。
> - 其中 runtime-generated 场景为 `placeholder-disambiguation` 与 `scroll-runtime-contract`。
> - Studio 已补齐布局 contract、歧义候选诊断细节；Electron 已补 bundle integrity 自修复与显式失败语义。
> - 仓库默认开发基线已切到 `.nvmrc` 的 Node 24，Node 20 继续保留兼容。

---

## 1. 当前基线（已完成）

| 能力 | 状态 |
|------|------|
| Monorepo 工具链（pnpm + Turbo + TS strict） | ✅ |
| Flow DSL（Zod）+ recorder 归一化 | ✅ |
| Playwright runtime + 步骤截图 | ✅ |
| SQLite 知识库（项目 / Flow / 执行 / 环境 / 版本 / 快照） | ✅ |
| WXT 扩展录制 + 导出 JSON + **同步知识库** | ✅ |
| Electron Studio 运行 / 执行历史 / Flow 版本 | ✅ |
| Web 控制台 + 本地 API（3847） | ✅ |
| `pnpm e2e:login` 端到端脚本 | ✅ |
| 脆弱性体检（纯 CSS 警告）、HAR 录制、页面 JSON 快照 | ✅（基础版，非主线阻塞） |
| recorded replay 稳定基线（23 fixture + 2 runtime-generated） | ✅ |
| Studio 布局 contract + 歧义候选诊断细节 | ✅ |
| Electron bundle integrity 自修复与显式失败 | ✅ |

**结论**：P0 + P1 已闭环；P2 主体与 2026-06-09 residual gaps 收口均已完成。当前主线重点从“补功能”转为“守住稳定基线、补齐真源文档、为后续阶段保留清晰冻结边界”。

---

## 2. 目标定义（本阶段）

### 必须达成（MVP）

1. 新开发者 **30 分钟内** 能在本机跑通：安装 → 验证 → 扩展录制 → 同步知识库 → Studio 回放。
2. 三端共用 **同一份** `~/.flowweave/projects/` 数据，行为可预期。
3. **不依赖** API Key、LLM、云端服务。
4. CI（Node 20 / 24）验证链稳定；本地开发、排障和交付前自验默认以 Node 24 为准。

### 明确不做（冻结至后续「智能阶段」）

- Vercel AI SDK、`ai-orchestrator` 产品化 UI
- NL → Flow 对话框、步骤复用建议
- 基于 LLM 的页面理解 / 自愈选择器
- 多用户协作、云端同步

---

## 3. 里程碑（按优先级）

### M1 — 本地跑通指南（P0.5，**最高优先**）

**目标**：一条文档 + 少量脚本，降低「跑不起来」的摩擦。

| 任务 | 说明 | 验收 |
|------|------|------|
| 统一快速启动文档 | 新建 `docs/guides/quickstart.md`，合并 e2e / web / extension / studio 步骤 | 按文档逐步执行无歧义 |
| Playwright 浏览器安装 | 文档与 `package.json` 脚本：`pnpm exec playwright install chromium` | 首次 clone 后 e2e 可过 |
| 根目录便捷脚本 | 已有 `dev:web`；补充 `dev:studio`、文档说明 extension `dev` | README 链到 quickstart |
| 环境自检 | 可选 `pnpm doctor`：Node 版本、playwright、API 3847、数据目录 | ✅ |
| README 更新 | 阶段表、文档入口指向本 roadmap | 与 AGENTS 一致 |

**不涉及新功能开发**，以文档与脚本为主。

---

### M2 — 录制 → 知识库 → 回放闭环加固（P1+ / P2）

**目标**：扩展录制的 Flow 在 Studio **可选、可跑**，而非隐式「第一个 Flow」。

| 任务 | 说明 | 验收 |
|------|------|------|
| Studio 选择 Flow 运行 | `runFlow(projectId, flowId?)`；UI 与当前选中 Flow 一致 | 同步后的 Flow 可被选中并执行 |
| 扩展 projectId 持久化 | 侧栏所选项目写入 session，同步时使用 | 重启扩展后项目选择可恢复 |
| 默认环境 URL | 录制后可选更新项目 `baseUrl`（后续迭代，非 M2 阻塞） | — |
| 端到端手测清单 | quickstart 附录：录制 3 步 → 同步 → Studio 运行 → Web 看历史 | 人工走通一次并记录 |

---

### M3 — 可观测与调试体验（P2 收尾）

**目标**：出问题能定位，不追求分析智能化。

| 任务 | 说明 | 验收 |
|------|------|------|
| 执行详情完整展示 | Studio / Web 统一步骤字段（时长、错误、截图路径） | 与 SQLite 一致 |
| runs 目录说明 | 文档：`step-*.png`、`page-*.json`、`network.har` 含义 | guides 可查 |
| Flow 版本 | 已完成；可选 **版本 diff**（JSON 对比） | 非阻塞，排 M3 末尾 |
| 截图预览 | Electron 内打开截图或缩略图（当前仅路径） | 体验项，可拆独立 PR |

**page-intelligence / network-intelligence**：维持现有单元测试与 runtime 落盘，**不扩展** a11y 树、请求-动作关联，直至智能阶段。

---

### M4 — 工程质量与发布准备

| 任务 | 说明 | 验收 |
|------|------|------|
| CI 稳定 | GitHub Actions 全绿；必要时跳过 e2e 或仅 smoke | main 分支 CI 通过 |
| Smoke 脚本 | `pnpm smoke`：typecheck + test + build + e2e:login（`SKIP_E2E=1` 跳过 e2e）；`pnpm smoke:full` 始终含 e2e | ✅ |
| 扩展 / Studio 构建产物 | `build` 文档：如何加载 unpacked / 打包 Electron | CONTRIBUTING 补充 |
| 测试补强 | `project-knowledge`、`runtime` 优先；apps 可后补 | 核心包关键路径有测试 |

---

### M5 — 产品化增强（可选，M1–M4 完成后）

| 任务 | 说明 |
|------|------|
| Web 控制台只读 → 轻量编辑 | 改 Flow 名称、删除执行记录等 |
| 扩展录制控制 | 开始/暂停/清空会话 |
| 流程导入导出 | 脱敏 JSON 文件 ↔ 知识库 |
| 三模式 UI | 业务 / 分析 / 专业（设计稿级，非当前必须） |

---

## 4. 冻结区（智能阶段，后续再开）

以下能力 **保留 ADR 与包骨架**，排期见独立文档（待产品确认后再写 `2026-XX-ai-phase-roadmap.md`）：

| 原阶段 | 内容 | 当前策略 |
|--------|------|----------|
| P4 | `ai-orchestrator` + AI SDK + NL→Flow UI | 冻结；不新增依赖、不接 UI |
| P3 深度 | a11y 树、区域标注、HAR↔步骤关联、请求模板 | 冻结扩展；现有 HAR/快照/fragility 够用 |
| P5+ | 协作、云端、元素自愈 | 远期 |

---

## 5. 推荐执行顺序（给 Agent / 开发者）

```text
M1 文档与脚本（quickstart、README、doctor）
  ↓
M2 Studio 选 Flow 运行 + 闭环手测
  ↓
M4 smoke + CI
  ↓
M3 调试体验（按需）
  ↓
M5 可选增强
  ↓
（未来）智能阶段：再启用 P4 / P3 深度
```

---

## 6. 验证命令（本阶段标准）

```bash
# 环境：Node 24（.nvmrc，Node 20 兼容）
pnpm install
pnpm doctor                           # 环境自检
pnpm exec playwright install chromium   # doctor 提示缺失时

pnpm smoke                            # typecheck + test + build + e2e
SKIP_E2E=1 pnpm smoke                 # 跳过 e2e

pnpm dev:web                          # API :3847 + Web :5174
pnpm --filter @flowweave/app-studio dev
pnpm --filter @flowweave/app-extension dev
```

---

## 7. 文档索引

| 文档 | 用途 |
|------|------|
| [quickstart.md](../../guides/quickstart.md) | **本地跑通（M1 产出）** |
| [p1-e2e.md](../../guides/p1-e2e.md) | login fixture 端到端 |
| [web-console.md](../../guides/web-console.md) | Web API 与扩展同步 |
| [flow-dsl.md](../../domain/flow-dsl.md) | Flow 结构 |
| 本文 | **当前有效开发计划** |

---

## 8. 状态板

| 里程碑 | 状态 | 备注 |
|--------|------|------|
| M1 本地跑通 | ✅ 完成 | quickstart、doctor、dev 脚本 |
| M2 闭环加固 | ✅ 完成 | 选 Flow 运行、项目持久化、[manual-qa](../../guides/manual-qa.md) |
| M3 可观测 | ✅ 完成 | 耗时列、截图打开、[run-artifacts](../../guides/run-artifacts.md) |
| M4 工程质量 | ✅ 完成 | smoke、CI Playwright、CONTRIBUTING、[v1.0.0](../../releases/v1.0.0.md) |
| M5 产品增强 | 🟡 最小 | 扩展清空录制；其余可选 |
| 智能阶段（P4/P3 深度） | ⏸ 冻结 | 用户明确要求延后 |
