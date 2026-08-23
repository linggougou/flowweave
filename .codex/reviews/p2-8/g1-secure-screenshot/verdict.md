# 结论

**REVISE（88/100）**。`getExecutionScreenshotPreview` 的实现没有发现可利用的任意路径或跨项目读取缺陷，但 G1 的 L3 故障注入证据少了一条冻结用例，暂不能离开审查门。

# 为什么

实现以 `projectId + executionId + stepIndex` 校验真实 execution/step 归属，只从受控根推导 `step-<N>.png`，不使用 SQLite `screenshotPath`。读取前后验证 data/project/runs/run/file 身份，使用只读 no-follow fd，拒绝 symlink、硬链接、目录、FIFO、超过 8 MiB、伪 PNG、异常 IHDR 和像素炸弹；返回值和错误均不暴露路径。

关键定向复验为截图预览 30/30、删除回归 36/36，共 66/66；主代理已有 project-knowledge 84/84、typecheck、lint、build 全绿证据。唯一阻塞是执行计划明确要求分别注入“运行目录替换”和“文件替换”，当前测试仅覆盖文件路径替换。源码虽会重验 run 目录身份，但 L3 安全门不能用代码推断代替缺失的可重复故障证据。

# 必须修改

在 `packages/project-knowledge/src/execution-screenshot-preview.test.ts` 增加运行目录身份漂移用例：通过 `beforeExecutionScreenshotFileRevalidation()` 替换 `runDirectory`，断言读取 fail closed、错误不含绝对路径、替换目录及兄弟 sentinel 不被读取或修改。随后复跑截图测试、删除回归和 project-knowledge 全包即可申请复审；不需要重写 resolver，也不得扩大到 Web / Local API、P3/P4 或 vNext。

# 证据

- 候选：`1069c393e1eab98a4d776219eef4e3f6e186d369`（G1 原提交 `5ae8a22` 已纳入）
- 核心：`packages/project-knowledge/src/repository.ts:994-1160`
- 测试：`packages/project-knowledge/src/execution-screenshot-preview.test.ts:53-303`
- 冻结要求：`docs/exec-plans/active/p2-8-execution-screenshot-preview.md:64-69`
- 独立定向：`pnpm exec vitest run src/execution-screenshot-preview.test.ts src/execution-deletion.test.ts --reporter=verbose` → 2 files / 66 tests 通过
- 差异：`git diff --check 93380de..1069c39` 通过
