# 结论

**PASS（100/100）**。截至提交 `0203c5b`，P2.8 已完成 G1/G2/G3 分轨与本地总验收，G4 独立集成总审未发现新的 P0/P1/P2 或 required fixes，可以进入远端集成分支与 `main` 的 Node 20 / 24 双矩阵会签。

# 为什么

- 文件边界仍然收紧：`@flowweave/project-knowledge` 只按 `projectId + executionId + stepIndex` 推导固定 `step-<N>.png`，不信任数据库里的历史路径，并在读取前后复核 data/project/runs/run/file 身份，拒绝 symlink、hardlink、目录、FIFO、伪 PNG、超大文件和 TOCTOU 漂移。
- Studio 壳层边界闭合：renderer 只拿到固定对象 IPC，不再暴露 `openPath`；主进程只接受当前主窗口 `mainFrame` 与精确允许来源；窗口启用 `sandbox`，拒绝新窗口和导航，CSP 仅允许 `blob:` 图片与开发期固定本地连接。
- 预览生命周期完整：renderer 只把 `blob:` 放进 `<img>`，并在关闭、切换项目/流程/执行、组件卸载与迟到结果判旧时统一回收 Blob URL；旧请求无法把错误、图片或 unavailable 状态污染到新上下文。
- 范围没有外溢：Web / Local API 未获得运行产物字节读取能力，P3/P4、HAR/DOM/SVG/HTML/PDF 预览和 vNext 需求仍保持冻结。
- 验证证据完整：已有 Node 24 主门禁、Node 20 无缓存矩阵、真实 Electron、recorded replay `25/25`、portability、生产依赖审计、G1/G2/G3 Judge 包；本次 G4 又独立复跑了仓库侧 `31/31` 与 Studio 侧 `9/9` 贴边测试。

# 必须修改

无。

# 证据

- 审查基线：`b328ebacf1c5d3314c079f3995329f055e078878`
- 被审提交：`0203c5b`
- 分轨审查包：
  - `.codex/reviews/p2-8/g1-secure-screenshot/`
  - `.codex/reviews/p2-8/g2-preview/`
  - `.codex/reviews/p2-8/g3-studio-integration/`
- 关键实现：
  - `packages/project-knowledge/src/repository.ts:994`
  - `apps/studio/electron/main.ts:91`
  - `apps/studio/electron/services.ts:302`
  - `apps/studio/electron/preload.ts:9`
  - `apps/studio/csp-policy.ts:1`
  - `apps/studio/src/App.tsx:274`
  - `apps/studio/src/App.tsx:1137`
  - `apps/studio/src/ExecutionScreenshotPreview.tsx:14`
- 路线与本地总验收：
  - `PROJECT_ROUTE_LOCK.md:9`
  - `docs/exec-plans/active/p2-8-execution-screenshot-preview.md:61`
  - `.codex/verification-report.md:5295`
  - `.codex/operations-log.md:7204`
- G4 独立 verifier：
  - `pnpm --filter @flowweave/project-knowledge test -- execution-screenshot-preview` → `1` file / `31` tests 通过
  - `pnpm --filter @flowweave/app-studio test -- App.execution-screenshot-preview ExecutionScreenshotPreview` → `2` files / `9` tests 通过
  - 独立 review worktree 无 `node_modules`，因此定向复跑改在同一提交 `0203c5b` 的主工作树执行；失败原因已确认是环境缺依赖，而非代码回归
