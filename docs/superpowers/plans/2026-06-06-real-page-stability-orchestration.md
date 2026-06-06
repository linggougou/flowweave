# 真实页面稳定性增强并行编排板

更新时间：2026-06-06 16:09 CST

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
| Foundation | `Kepler` | `019e9bb4-15c4-7d61-bd88-c9632921efc7` | completed | 已提交 `7d54477` 与返修 `d8a3618`，主代理复验通过并并入协调分支 |
| Benchmarks（第一阶段） | `Halley` | `019e9bb4-4cd4-7931-a911-c2f8c7521167` | completed | 已提交 `c04e27a`，主代理审查后已并入协调分支 |
| Diagnostics（第一阶段） | `Kuhn` | `019e9bb4-8113-7092-b538-a6e7ef66d76c` | completed | 已提交 `adf388e`，主代理审查后已并入协调分支 |
| Recorder | `Planck` | `019e9bc2-28d0-7852-87c5-b1ee7fe13742` | completed | 已提交 `5cded60`，主代理复验后并入协调分支提交 `8228aae` |
| Runtime | `Faraday` | `019e9bc2-76c9-7a33-8fa2-ae2f26a4eedf` | completed | 已提交 `f8ab818`，主代理复验后并入协调分支提交 `07d4d02` |
| Environment | `Galileo` | `019e9bc2-b90a-7250-b8ca-90e4c28416c0` | completed | 原子代理已回收，主代理基于 worktree 改动完成复验、提交 `343afe1` 并并回协调分支 `1051e10` |

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

1. Foundation 已完成，主代理复验通过：
   - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl test`
   - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime typecheck`
   - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge typecheck`
2. Benchmarks 第一阶段已完成，4 个本地 fixture 与矩阵文档已并回协调分支。
3. Diagnostics 第一阶段已完成并通过主代理复验：`pnpm --filter @flowweave/page-intelligence test`。
4. Recorder 已完成并通过主代理复验：`pnpm --filter @flowweave/recorder test`。
5. Runtime 已完成并通过主代理复验：
   - `pnpm --filter @flowweave/shared --filter @flowweave/flow-dsl --filter @flowweave/page-intelligence build`
   - `pnpm --filter @flowweave/runtime typecheck`
   - `pnpm --filter @flowweave/runtime test`
6. Environment 已完成并通过主代理复验：
   - `pnpm --filter @flowweave/ui build`
   - `pnpm --filter @flowweave/project-knowledge build`
   - `pnpm --filter @flowweave/runtime build`
   - `pnpm --filter @flowweave/project-knowledge test`
   - `pnpm --filter @flowweave/app-studio typecheck`
7. 统一集成验收已完成：
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - `pnpm smoke`
8. Diagnostics 第二阶段已由主代理直接完成并通过回归：
   - 代码提交：`76851c9 feat: 增强失败步骤诊断产物与入口`
   - 新能力：
     - 失败步骤生成 `step-<n>-diagnostic.json`
     - 失败步骤生成 `page-<n>.json`
     - Studio 执行日志支持“打开诊断”
   - 验证：
     - `pnpm --filter @flowweave/runtime test`
     - `pnpm --filter @flowweave/project-knowledge test`
     - `pnpm --filter @flowweave/app-studio typecheck`
     - `pnpm smoke`
9. Benchmarks 第二阶段已由主代理直接完成并通过回归：
   - 代码提交：`d5bcfea feat: 建立真实页面回归矩阵并补齐登录态基准`
   - 新能力：
     - `packages/runtime/src/playwright-runner.ts` 现在会把 `storageStatePath` 透传给 `browser.newContext()`
     - 新增 `examples/fixtures/session-dashboard.html` 登录态基准页面
     - 新增 `examples/real-page-smoke.ts` 与 `examples/run-real-page-smoke.ts`
     - `package.json` 新增 `e2e:real-pages`，`smoke:full` 纳入真实页面矩阵
     - runtime 新增“登录态环境注入”和“5 个真实页面 case 全成功”测试
   - 验证：
     - `pnpm lint`
     - `pnpm smoke:full`

### 阶段 C：统一集成

1. 按顺序合并五轨道。
2. 解决冲突后运行 `pnpm smoke`。
3. 通过后更新 `.codex/verification-report.md` 与本编排板。

当前状态：已完成。
  - 协调分支当前已包含：
    - `5be3cc7 增强页面脆弱性静态分析规则`
    - `5d00cc2 新增真实页面基准页面与矩阵文档`
    - `871ee25 feat: 冻结真实页面稳定性基础接口`
    - `c517035 fix: 调整 wait 步骤校验挂载方式`
    - `8228aae feat: 增强 Recorder 真实页面语义与去噪`
    - `25eef55 fix: 修正 Flow DSL 步骤类型导出`
    - `07d4d02 增强真实页面 runtime 稳定执行能力`
    - `1051e10 feat: 打通 Studio 运行环境与变量注入`
    - `76851c9 feat: 增强失败步骤诊断产物与入口`
    - `d5bcfea feat: 建立真实页面回归矩阵并补齐登录态基准`
  - Node 20 统一验收结果：`pnpm lint` 与 `pnpm smoke:full` 全部通过。

## 5. 验收门槛

- 子轨道局部命令通过：
  - Recorder：`pnpm --filter @flowweave/recorder test`
  - Runtime：`pnpm --filter @flowweave/runtime test`
  - Environment：`pnpm --filter @flowweave/project-knowledge test && pnpm --filter @flowweave/app-studio typecheck`
  - Diagnostics：`pnpm --filter @flowweave/page-intelligence test && pnpm --filter @flowweave/app-studio typecheck`
  - Benchmarks：`pnpm e2e:real-pages`
- 主代理统一门槛：
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm smoke:full`

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

- `Node 24` 仍存在 `better-sqlite3` ABI 漂移风险，因此当前本地与 CI 继续以 `Node 20` 作为稳定基线。
- Diagnostics 第二阶段若深入 Studio 调试 UI，仍需避免与后续 Environment 演进再次并发写同一区域。
- 当前真实页面矩阵仍以本地 fixture 为主；后续若扩展到更重的真实站点 smoke，需单独控制运行时长与外部依赖波动。

## 8. 下一轮候选

1. Benchmarks 第三阶段：补列表筛选、分页、Modal、双态登录失效等基准，并形成成功率与耗时矩阵。
2. Diagnostics 第三阶段：在 Studio 内直接渲染诊断 JSON 内容，并补 warning / error 分组与修复建议。
3. Node 24 兼容排查：单独评估 `better-sqlite3` ABI 与安装策略，决定是否支持双 Node 基线。
