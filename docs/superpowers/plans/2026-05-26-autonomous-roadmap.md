# FlowWeave 自主执行 Roadmap

> 模式：PLAN → IMPLEMENT → VERIFY → REFINE → CONTINUE  
> 更新：2026-05-26

## 项目现状摘要

| 维度 | 状态 |
|------|------|
| 架构 | pnpm monorepo，6 引擎包 + 3 应用 |
| P1 | ✅ 录制归一化、Playwright 执行、WXT 扩展、Electron Studio、SQLite |
| P2 | 🟡 执行历史已合并；缺运行产物目录与截图链路 |
| P3–P5 | 占位包，未实现 |

---

## PHASE 1 — P2 收尾：运行产物与调试可追溯

**目标**  
每次执行在 `~/.flowweave/projects/<projectId>/runs/<executionId>/` 落盘截图与元数据；Studio 步骤表可查看截图路径。

**涉及文件**

- `packages/project-knowledge/src/paths.ts`
- `packages/project-knowledge/src/repository.ts`
- `packages/runtime/src/types.ts`
- `packages/runtime/src/playwright-runner.ts`
- `apps/studio/electron/services.ts`
- `packages/ui/src/StepLogTable.tsx`
- `apps/studio/src/shared/studio-api-types.ts`

**风险点**

- `better-sqlite3` 需 Node 20
- Electron 渲染进程无法直接 `file://` 打开任意路径（P1 仅显示路径文本）

**验收标准**

- [x] `pnpm test` / `typecheck` / `build` 全绿
- [x] `pnpm e2e:login` 后 runs 目录存在 `step-*.png`
- [x] Studio 运行后步骤行显示截图路径

---

## PHASE 2 — P3 页面理解基础

**目标**  
录制/执行时捕获 DOM 快照索引；`page-intelligence` 提供页面指纹与脆弱选择器提示。

**涉及文件**

- `packages/page-intelligence/src/*`
- `packages/recorder/src/normalize.ts`（可选 enrich）
- `packages/project-knowledge` schema 扩展 `page_snapshots`

**风险点**  
快照体积；需只存路径 + 哈希。

**验收标准**

- [ ] 对 login fixture 生成 snapshot 记录
- [ ] 体检 API 对纯 css 步骤返回 warning

---

## PHASE 3 — P3 接口理解基础

**目标**  
runtime 可选 HAR；`network-intelligence` 解析关键请求模板。

**涉及文件**

- `packages/runtime/src/playwright-runner.ts`
- `packages/network-intelligence/src/*`

**风险点**  
HAR 含敏感头；默认本地、不入 Git。

**验收标准**

- [ ] 执行后 `runs/<id>/trace.har` 可选生成
- [ ] 至少识别 1 条 XHR 与页面动作关联

---

## PHASE 4 — P4 AI 编排最小闭环

**目标**  
`ai-orchestrator` 接入 AI SDK；NL → Flow 草案；必须 Zod 校验。

**涉及文件**

- `packages/ai-orchestrator/src/*`
- `apps/studio` 可选对话框 UI

**风险点**  
API Key 仅本地；禁止自动写入无确认。

**验收标准**

- [ ] 给定 prompt 输出合法 `FlowDocument` JSON
- [ ] 非法输出被拒绝并记录错误

---

## PHASE 5 — 产品整合与三端打通

**目标**  
扩展导出 Flow 写入知识库；Web 只读控制台；文档与 CI 完整。

**涉及文件**

- `apps/extension/*`
- `apps/web/*`
- `.github/workflows/ci.yml`

**验收标准**

- [ ] 扩展导出 → 知识库 → Studio 可运行同 Flow
- [ ] CI 在 Node 20 稳定绿

---

## 执行状态板

| Phase | 状态 |
|-------|------|
| PHASE 1 | ✅ DONE |
| PHASE 2 | ✅ 环境/快照/HAR 基础已落地 |
| PHASE 3 | 🟡 HAR 解析完成；深度映射待做 |
| PHASE 4 | 🟡 启发式 NL→Flow 已落地；AI SDK 待接 |
| PHASE 5 | PENDING |
