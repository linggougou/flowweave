# P2.8 Studio 执行截图受控内嵌预览执行计划

## 1. 路线与阶段

- 生命周期：S4 里程碑计划 → S5 分轨开发 → S6 集成验证 → S7 会签。
- 路线：`PROJECT_ROUTE_LOCK.md` 的 P2.8“Studio 执行截图受控内嵌预览”。
- 用户授权：2026-08-24 在 P2.7 完成并要求继续开发；此前已要求 plan、worktree、Sub-Agent 并行与验收后回收。
- 主闭环：Studio 选择历史执行和步骤 → 请求受控截图 → 应用内只读查看 → 关闭后恢复原上下文与焦点。
- 明确非目标：Web / Local API / 扩展文件服务、HAR / DOM / SVG / HTML / PDF、下载导出、OCR 标注、P3/P4、vNext、技术栈替换。

## 2. 审计裁决

### 2.1 为什么选择截图预览

“先跑通”路线已明确登记“Electron 内打开截图或缩略图（当前仅路径）”为可拆独立体验项。现有 diagnostic 和 page snapshot 已在 Studio 中结构化展示，只有像素截图仍依赖系统外部应用；因此截图预览是范围最小、用户价值直接且不触及冻结阶段的下一闭环。

### 2.2 为什么不能复用 `openPath`

现有 preload 向 renderer 暴露任意 `filePath`，主进程只检查非空便调用 `shell.openPath()`；历史 SQLite 中的 artifact path 也不能作为可信能力凭证。P2.8 必须移除 renderer 通用路径能力，改为固定业务标识请求，由主进程从真实项目和 execution 推导唯一 `step-<N>.png`。

### 2.3 为什么只预览 PNG

HAR 含敏感头，原始 JSON / DOM 会扩大页面内容暴露面，SVG / HTML 可携带主动内容。本阶段固定 `image/png`，校验普通文件、magic bytes、大小上限与读取期间身份，不提供任意 MIME、URL、文件名或回退外部打开。

## 3. 冻结合同

### 3.1 请求与归属

- renderer 请求只含 `projectId`、`executionId`、非负安全整数 `stepIndex`；不接收路径、文件名、MIME、URL 或 base directory。
- projectId / executionId 复用单段安全 ID 校验；execution 必须存在且归属指定项目，跨项目请求 fail closed。
- 唯一路径由受控 data root、两个业务 ID 和 `step-<N>.png` 推导；不得信任 SQLite 中的 `screenshotPath`。

### 3.2 文件读取

- project、runs、run directory 与目标文件均不得为 symlink；目标必须为普通文件。
- PNG 文件名固定，单图上限 `8 MiB` 并在分配 Buffer 前检查；以只读 no-follow 文件描述符读取，拒绝硬链接，读取后重验目录与文件身份和长度，拒绝期间替换。
- 校验完整 8 字节 PNG signature 与 IHDR；宽高必须为正且各不超过 `8192`，总像素不超过 `40,000,000`。不接受扩展名伪装、SVG、HTML、JPEG、目录、FIFO、socket 或设备文件。
- 缺失与安全拒绝返回稳定、脱敏的错误码和人话消息；绝对路径与文件内容不得进入日志以外的前台响应，日志也不得记录图像字节。

### 3.3 Electron 与 renderer

- preload 只暴露固定 `getExecutionScreenshotPreview(request)`；删除 `openPath` 暴露和 IPC channel。结果仅为 `available { mediaType: "image/png", bytes: Uint8Array, width, height }` 或 `absent`。
- 主进程执行严格结构化参数校验、校验调用方为主窗口 main frame 和精确允许的开发 / 生产来源，并把底层错误映射为 renderer 安全错误；不新增 HTTP 路由。
- renderer 仅把主进程返回的有界 PNG bytes 转换为短生命周期 Blob URL 并用于只读 `<img>`；切换、关闭和卸载时 revoke；不使用 data URL、`file:`、外部 URL、iframe 或 `dangerouslySetInnerHTML`。
- 在开放本地 bytes 前补齐 Studio 壳层硬门：renderer sandbox、生产 CSP（`img-src 'self' blob:`，禁止 object / frame / worker / base / form）、导航与新窗口拒绝；开发态只精确放行 Vite / HMR 来源。Electron 大版本升级另行变更，不混入本阶段。
- 预览具备 loading / success / unavailable 状态、关闭按钮、Escape、对话框语义、图片 alt 与触发按钮焦点恢复。
- 独立 requestId 绑定 project / flow / execution / step；切换、删除、关闭和卸载都会使旧响应失效。
- 页面不再用 title 或文本泄露 artifact 绝对路径；diagnostic / page snapshot 继续使用已有结构化展示，不回退外部打开原文件。

## 4. 依赖 DAG 与 worktree 轨道

```text
G0 路线锁、计划、安全合同与基线
  ├─ G1 project-knowledge 受控截图 resolver
  └─ G2 Studio 只读预览组件（纯 renderer）

G1 + G2
  └─ G3 Electron 固定 IPC + App 接线 + 竞态保护

G3
  └─ G4 独立 Judge、安全复审、真实 Electron、Node 20/24 与 CI 会签
```

### G1：安全解析核心（L3）

- 所有权：`packages/project-knowledge/**`。
- 交付：execution / step 归属校验、受控路径推导、symlink / hardlink / 类型 / 大小 / PNG signature / IHDR / TOCTOU 守卫与只读 bytes 结果。
- TDD 红灯：非法 ID / stepIndex、ghost / cross-project / cross-execution、step 不存在、DB 外部路径、缺失、目录、symlink、hardlink、运行目录替换、文件替换、截断 / 伪 PNG、异常尺寸、超限与兄弟 sentinel。

### G2：renderer 只读组件（L2）

- 所有权：`apps/studio/src/ExecutionScreenshotPreview.tsx` 及其测试和样式；不修改 `App.tsx`、共享 API 类型或 Electron 文件。
- 交付：无路径输入的 dialog，loading / success / unavailable、Escape、alt、焦点恢复与无主动内容渲染。

### G3：Electron 与 App 集成（L3）

- 所有权：`apps/studio/electron/**`、`apps/studio/src/App.tsx`、`apps/studio/src/DiagnosticInspector.tsx`、`apps/studio/src/shared/**`、`apps/studio/src/studio-client.ts`、必要的 `packages/ui/src/StepLogTable.tsx`。
- 依赖 G1 / G2 集成基线后实施。
- 交付：固定 IPC/preload/service、移除 `openPath`、sender / frame / origin 校验、renderer sandbox、CSP、导航 / 新窗口拒绝、artifact ref 回调、Blob 生命周期、独立请求守卫与组件接线。
- TDD 红灯：路径 / 未知字段拒绝、iframe / 额外窗口 / 导航后 sender 拒绝、固定 invoke、错误脱敏、A→B 乱序、切换项目 / Flow / execution、关闭、删除、卸载后迟到响应、Blob revoke，以及页面无绝对路径。

### G4：验收与回收（L3）

- 所有权：根 E2E、文档、`.codex/**`。
- 每轨由独立 Judge 输出 `.codex/reviews/p2-8/<track>/scorecard.json` 与 `verdict.md`；REVISE / REJECT 退回原轨修复并复审。

## 5. 验收门禁

```bash
pnpm --filter @flowweave/project-knowledge test
pnpm --filter @flowweave/app-studio test
pnpm --filter @flowweave/app-studio typecheck
pnpm --filter @flowweave/app-studio lint
pnpm --filter @flowweave/app-studio build
git diff --check
pnpm lint
CI=1 pnpm smoke
pnpm e2e:recorded-pages
pnpm e2e:portability
pnpm audit --prod --audit-level high --registry=https://registry.npmjs.org
```

- Node 24 执行完整本地门禁；Node 20.19.6 按 lockfile 重建后至少执行无缓存 typecheck / test / build 与关键 E2E。
- Electron 真机覆盖可见截图、不可用状态、Escape / 关闭 / 回焦、快速切换不串图和页面无绝对路径。
- 最终以集成分支和 main 的 Node 20 / 24 CI 双绿会签。
- coverage provider 未安装时不新增依赖，以关键分支故障注入和完整 smoke 替代并留痕。

## 6. Definition of Done

- [x] renderer 不再拥有通用 `openPath`，截图请求和响应均不含本机绝对路径。
- [x] 受控 resolver 不信任 SQLite artifact path，跨项目、symlink / hardlink、类型、signature / IHDR、大小 / 像素和 TOCTOU 全部 fail closed。
- [x] Studio 内可只读查看成功与失败执行的步骤截图，缺失或拒绝有明确状态。
- [x] 预览可键盘关闭、恢复焦点，快速切换和删除不会串图。
- [x] Web / Local API / 扩展、HAR / DOM、P3/P4、vNext 与破坏性能力未混入。
- [x] 分轨 TDD、安全审查与 Judge 均 PASS，无未关闭 P0/P1。
- [x] Node 24、Node 20、recorded replay `25/25`、portability 与安全审计通过。
- [x] G4 独立集成总审通过。
- [x] 远端集成分支与 `main` Node 20 / 24 双矩阵通过。
- [x] worktree、分支、临时进程与 Agent 在验收后回收，留痕完整。

当前状态：P2.8 已完成并归档。G1、G2、G3 Judge 与 G4 集成总审均 PASS；Node 24 本地主门禁、recorded replay `25/25`、可移植往返、生产依赖审计、真实 Electron、Node 20.19.6 无缓存矩阵，以及远端集成分支 / `main` Node 20、24 双矩阵全部通过。

## 7. 回滚策略

- G1、G2、G3 独立提交，可按轨 revert；不做数据库迁移，不变更 Flow DSL 或 runtime 产物格式。
- 若不能证明安全解析和 renderer 路径能力移除，整阶段拒绝合入并重新进入安全设计门禁；不得以保留任意 `openPath` 作为降级方案。
- UI 组件可独立回滚，不影响执行、录制、删除或版本 diff 主链路。
