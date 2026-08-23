# 结论

**PASS（100/100）**。`cc24555` 已精确关闭初审 required fix，G1 可离开独立审查并进入 G3 集成。

初审历史：`19e043a` 曾给出 **REVISE（88/100）**，原因仅为缺少冻结要求的运行目录身份漂移故障注入；resolver 本身当时未发现可利用缺陷。

# 为什么

实现以 `projectId + executionId + stepIndex` 校验真实 execution/step 归属，只从受控根推导 `step-<N>.png`，不使用 SQLite `screenshotPath`。读取前后验证 data/project/runs/run/file 身份，使用只读 no-follow fd，拒绝 symlink、硬链接、目录、FIFO、超过 8 MiB、伪 PNG、异常 IHDR 和像素炸弹；返回值和错误均不暴露路径。

新增用例在 `beforeExecutionScreenshotFileRevalidation()` 中整体替换 `runDirectory`，同时保留相同截图 inode，证明拒绝结果来自目录身份重验而不是文件身份偶然变化；用例还验证原目录、替换目录、兄弟 sentinel 未被读取或修改，错误不含 dataDir/runDirectory。修复后独立定向为截图预览 31/31、删除回归 36/36，共 67/67；主代理已有 project-knowledge 全包 85/85、typecheck、lint、build 全绿证据。

# 必须修改

无。G1 required fix 已关闭。后续仅按既定 G3 接入固定 Electron IPC、移除 `openPath` 并完成 renderer 竞态保护；不得扩大到 Web / Local API、P3/P4 或 vNext。

# 证据

- 候选：`1069c393e1eab98a4d776219eef4e3f6e186d369`（G1 原提交 `5ae8a22` 已纳入）
- Required fix：`cc245555c8ad05f89b3e82a666fb985ec773cc02`（原修复 `6265b57`）
- 核心：`packages/project-knowledge/src/repository.ts:994-1160`
- 测试：`packages/project-knowledge/src/execution-screenshot-preview.test.ts`，新增运行目录身份漂移用例
- 冻结要求：`docs/exec-plans/active/p2-8-execution-screenshot-preview.md:64-69`
- 独立定向：`pnpm exec vitest run src/execution-screenshot-preview.test.ts src/execution-deletion.test.ts --reporter=dot` → 2 files / 67 tests 通过（31 + 36）
- 主代理证据：project-knowledge 全包 85/85、typecheck、lint、build 全绿
- 修复差异：`git diff --check 1069c39..cc24555` 通过
