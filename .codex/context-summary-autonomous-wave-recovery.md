## 项目上下文摘要（autonomous-wave-recovery）

生成时间：2026-06-07 00:26:00 CST

### 1. 当前目标状态

- 协调分支：`codex/real-page-stability-program`
- 用户目标：自主规划并推进下一轮真实页面稳定性增强，完成计划、worktree / 子代理编排，并逐步验收回收
- 当前结论：
  - 设计文档、实施计划、并行编排板均已存在
  - `Foundation` 与后续 Wave 4 / Wave 5 集成已完成
  - 保留的 5 个旧 autonomous-wave worktree 中，`CI Runtime Refresh`、`Benchmarks P5`、`Runtime Replay Contract` 已被当前协调分支等价吸收
  - 需重点核对的仅剩 `Recorder Placeholder Contract` 与 `Studio Experience`

### 2. 关键分支 / worktree 审计

- `codex/ci-runtime-refresh`
  - `git cherry -v codex/real-page-stability-program codex/ci-runtime-refresh`
  - 结果：`- 72c01aa`
  - 结论：补丁等价已吸收
- `codex/real-page-benchmarks-p5`
  - 结果：`- dc69e74`
  - 结论：补丁等价已吸收
- `codex/real-page-runtime-contract`
  - 结果：`- 19889d0`
  - 结论：补丁等价已吸收
- `codex/real-page-recorder-contract`
  - 结果：`+ d0fc337`
  - 结论：patch-id 不等价，但当前主分支已存在同类实现与更晚的回归测试，需要按功能而不是按 commit 继续核对
- `codex/real-page-studio-experience`
  - 结果：`+ f504577`
  - 结论：patch-id 不等价，但当前主分支已具备多数对应能力，需要按功能核对是否已被后续提交超集覆盖

### 3. 相似 / 相关实现分析

- **实现 1**: `apps/extension/lib/content-contract.test.ts`
  - 模式：扩展 content script 的 payload / flush / placeholder 合同测试
  - 已覆盖：
    - upload token 去碰撞
    - contenteditable 文本采集
    - 提交型 keypress 先 flush 待提交 fill
  - 结论：Recorder Contract 分支最关键的 content 合同能力已在主分支有等价测试
- **实现 2**: `packages/recorder/src/normalize.test.ts`
  - 模式：录制事件归一化 + Flow 变量抽取回归
  - 已覆盖：
    - 宽字符 upload 占位符
    - `fileNames` 保留
    - `files / fileNames` 数量一致性
    - upload 变量声明
  - 结论：Recorder Contract 分支大部分 normalize / protocol 诉求已被主分支吸收
- **实现 3**: `apps/studio/src/shared/run-input-state.ts`
  - 模式：Studio 运行输入草稿、变量恢复、preflight 校验
  - 已覆盖：
    - `buildRunDraftState`
    - `collectRunPreflightIssues`
    - `parseVariableInput`
  - 结论：Studio Experience 分支关于最近一次输入恢复与运行前检查的核心逻辑已在主分支
- **实现 4**: `apps/studio/electron/services.ts`
  - 模式：Studio -> Electron -> Runtime 运行上下文透传
  - 已覆盖：
    - `getFlowRunInput()`
    - `ensureStorageStatePathExists()`
    - `resolveRunEnvironment()` 的显式覆盖 / 清空语义
  - 结论：主分支当前实现比旧 Studio 分支更强，不能直接倒回旧分支版本
- **实现 5**: `packages/project-knowledge/src/repository.ts`
  - 模式：执行历史与运行上下文持久化
  - 已覆盖：
    - `getLatestExecutionForFlow()`
    - 运行上下文字段补列与组装
  - 结论：Studio Experience 所需的知识库支撑已在主分支

### 4. 当前验证证据

- 旧 worktree 局部验证：
  - `pnpm --filter @flowweave/recorder test`：`39/39` 通过（Recorder worktree）
  - `pnpm --filter @flowweave/project-knowledge test`：`13/13` 通过（Studio worktree）
  - `pnpm --filter @flowweave/app-studio test`：`26/26` 通过（Studio worktree）
  - `pnpm --filter @flowweave/app-studio typecheck`：通过（Studio worktree）
- 当前协调分支验证：
  - `pnpm --filter @flowweave/app-extension test -- lib/content-contract.test.ts`：`4/4` 通过
  - `pnpm --filter @flowweave/recorder test`：`45/45` 通过
  - `pnpm --filter @flowweave/project-knowledge test`：`13/13` 通过
  - `pnpm --filter @flowweave/app-studio test`：`40/40` 通过
  - `pnpm --filter @flowweave/app-studio typecheck`：通过

### 5. 决策依据

- 不直接 cherry-pick `Recorder Contract` / `Studio Experience` 的原因：
  - 两条分支都从旧基线 `bc6e191` 分叉
  - 当前主分支已经叠加了 Wave 4 / Wave 5 的后续增强
  - 直接倒回旧分支会回退：
    - Recorder 的 contenteditable / flush / wait 推断修复
    - Studio 的 failure insight / repair suggestions / 显式环境清空语义
- 当前更合理的策略：
  - 以当前协调分支为真相源
  - 证明其已经吸收或超集覆盖旧轨道目标
  - 在证据充分后回收对应 worktree

### 6. 风险点

- `git cherry` 对 `Recorder Contract` 与 `Studio Experience` 仍返回 `+`
  - 说明 patch-id 不完全等价，不能只凭命令判定已合并
  - 必须结合当前代码与 Node 20 测试证据做功能级判定
- `codex-real-page-studio-experience` worktree 当前有私有 `.codex` 未提交改动
  - 不是功能代码
  - 回收 worktree 前需明确记录只保留主工作区的统一留痕
