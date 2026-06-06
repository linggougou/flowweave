# 真实页面稳定性增强并行编排板

更新时间：2026-06-06 15:01 CST

## 1. 主目标

在不打断现有可运行主链路的前提下，完成“真实页面稳定录制与执行增强”的五轨道并行开发，并在 Node 20 下通过统一验收。

## 2. 基线检查

- 当前分支：`codex/real-page-stability-program`
- Node 基线：`v20.19.6`
- `pnpm smoke`：通过
- worktree 根目录：`.worktrees/`
- `.worktrees/` 已被 `.gitignore` 忽略

## 3. 轨道分派

| 轨道 | 分支 | Worktree | 子代理职责 | 禁止修改 |
|------|------|----------|------------|----------|
| Foundation | `codex/real-page-foundation` | `.worktrees/codex-real-page-foundation` | 冻结 DSL、ExecutionOptions、环境类型与文档 | 业务逻辑实现 |
| Recorder | `codex/real-page-recorder` | `.worktrees/codex-real-page-recorder` | 录制语义、payload、去噪、归一化测试 | runtime / Studio |
| Runtime | `codex/real-page-runtime` | `.worktrees/codex-real-page-runtime` | 步骤执行、等待、定位诊断 | repository / Studio UI |
| Environment | `codex/real-page-environment` | `.worktrees/codex-real-page-environment` | 环境、变量、会话注入贯通 | recorder / runtime 解析细节 |
| Diagnostics | `codex/real-page-diagnostics` | `.worktrees/codex-real-page-diagnostics` | fragility、诊断展示、Studio 调试入口 | recorder 录制语义 |
| Benchmarks | `codex/real-page-benchmarks` | `.worktrees/codex-real-page-benchmarks` | fixture、新 smoke、文档 | 运行时接口定义 |

## 3.1 已启动子代理

| 轨道 | 子代理 | Agent ID | 状态 | 说明 |
|------|--------|----------|------|------|
| Foundation | `Kepler` | `019e9bb4-15c4-7d61-bd88-c9632921efc7` | running | 负责冻结 DSL / ExecutionOptions / 环境类型与说明文档 |
| Benchmarks（第一阶段） | `Halley` | `019e9bb4-4cd4-7931-a911-c2f8c7521167` | running | 先创建本地 fixture 页面与覆盖说明文档，不碰 runtime 代码 |
| Diagnostics（第一阶段） | `Kuhn` | `019e9bb4-8113-7092-b538-a6e7ef66d76c` | completed | 已提交 `adf388e`，主代理审查后已并入协调分支 |

## 4. 执行顺序

### 阶段 A：冻结接口

1. Foundation 独立完成并通过自身测试。
2. 主代理合并 Foundation 到协调分支。
3. 其余五轨道从协调分支最新提交重新同步。

### 阶段 B：并行实现

1. Recorder / Runtime / Environment / Diagnostics / Benchmarks 同时启动。
2. 每轨道必须先补失败测试，再实现最小变更。
3. 每轨道完成后先由主代理做规格符合性复核，再做代码质量复核。

当前状态：

1. Foundation 已启动，等待接口冻结完成。
2. Benchmarks 先行处理不依赖 Foundation 的 fixture 页面与说明文档，减少空转。
3. Diagnostics 第一阶段已完成并通过主代理复验：`pnpm --filter @flowweave/page-intelligence test`。
4. Recorder / Runtime / Environment 的正式编码在 Foundation 回收后统一拉起。

### 阶段 C：统一集成

1. 按顺序合并五轨道。
2. 解决冲突后运行 `pnpm smoke`。
3. 通过后更新 `.codex/verification-report.md` 与本编排板。

## 5. 验收门槛

- 子轨道局部命令通过：
  - Recorder：`pnpm --filter @flowweave/recorder test`
  - Runtime：`pnpm --filter @flowweave/runtime test`
  - Environment：`pnpm --filter @flowweave/project-knowledge test && pnpm --filter @flowweave/app-studio typecheck`
  - Diagnostics：`pnpm --filter @flowweave/page-intelligence test && pnpm --filter @flowweave/app-studio typecheck`
  - Benchmarks：`pnpm smoke`
- 主代理统一门槛：
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm smoke`

## 6. 回收规则

轨道满足以下条件即可回收对应子代理：

1. 授权写入范围内改动完整。
2. 对应局部测试命令通过。
3. 规格复核无缺口。
4. 代码质量复核无阻塞问题。

回收动作：

1. 记录轨道结果摘要。
2. 关闭子代理。
3. 合并对应 worktree 分支。

## 7. 风险清单

- Foundation 未先冻结即并行开工，会导致 schema 冲突。
- Runtime 与 Diagnostics 同时改 `playwright-runner.ts`，必须通过阶段顺序避免直接并发写入。
- Environment 与 Diagnostics 都会碰 Studio UI，必须把 Diagnostics 限制为脆弱性与路径展示，不提前改运行表单。
