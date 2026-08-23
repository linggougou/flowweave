# 结论

**PASS（100/100）**。`595804d` 已精确关闭初审 P1，G3 可离开独立审查并进入 G4 会签。

初审历史：`dc82c25` 曾给出 **REVISE（84/100）**，原因是 `catch` 只校验 generation，存在 selection render 到 passive effect 之间的迟到 reject 污染窗口；其余 IPC、路径与渲染安全硬门当时均已通过。

# 为什么

修复在单次预览请求内统一定义 `isCurrentPreviewRequest`，同时绑定 generation、projectId、flowId、executionId，并用于 absent 写状态前、available 创建 Blob 前、Blob 创建后以及 catch 写错误前。判旧发生在 Blob 创建后时仍会立即 revoke，因此所有完成出口现已共享同一上下文合同。

新增测试不是普通切换 happy path：它让旧请求保持 pending，用 `flushSync` 提交新 execution render，在 passive effect 尚未成为 generation 保障的窗口触发旧请求 reject，验证新上下文不出现旧错误、本机路径或 unavailable 状态，也不创建 Blob URL；随后 effect 清理关闭弹层。复用验证证据为 App 5/5、Studio 209/209、UI 14/14、typecheck、lint、build 全绿。

# 必须修改

无。初审 required fix 已关闭。后续仅进入既定 G4 会签；不得据此新增 Web/Local API 文件能力或解冻 P3/P4、vNext。

# 证据

- 被审 G3：`393c8135aeda2ee4d674c766c424593e8ded3a3e` / `c39ceafe935a7e2c4d530a7d49d31c736fd8f2a8`
- Required fix：`595804d4dd0dfa745200ce9adbeecee3b606643f`（原提交 `9661fff`）
- 统一 guard：`apps/studio/src/App.tsx:1151-1207`
- 精确故障注入：`apps/studio/src/App.execution-screenshot-preview.test.tsx:306-344`
- 复用主证据：App 截图预览 5/5、Studio 209/209、UI 14/14、typecheck、lint、build 全绿
- 收敛检查：`git diff --check dc82c25..595804d` 通过；required fix 仅修改 `App.tsx` 与对应测试，本轮未重跑全量
