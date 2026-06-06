# FlowWeave 操作日志

## 2026-05-25 夜间自主开发启动

### 已完成（main）

- P0 工程基座、ADR、AGENTS、Flow DSL、录制协议契约
- 提交：`chore: 落地 P0 工程基座、架构文档与 P1 开发计划`
- 计划文档：`docs/superpowers/plans/2026-05-25-p1-full-development-plan.md`
- 编排板：`docs/superpowers/plans/2026-05-25-orchestration.md`

### 并行轨道（best-of-n-runner / worktree）

| 轨道 | 分支 | Agent ID | 状态 |
|------|------|----------|------|
| R1 recorder | feat/p1-recorder | 3d3acde7 | running |
| R5 knowledge | feat/p1-knowledge | 40f0d962 | running |
| R2 runtime | feat/p1-runtime | 49ca873f | running |
| R3 extension | feat/p1-extension | 4251cdf1 | running |
| R4 studio | feat/p1-studio | 369da3d1 | running |

### 合并队列（验收后）

`main ← feat/p1-recorder ← feat/p1-knowledge ← feat/p1-runtime ← feat/p1-extension ← feat/p1-studio`

### 下一步（主代理）

1. 回收五轨道 subagent 结果，跑验收命令
2. 按队列 merge + 解决冲突
3. INT-1 端到端脚本与文档
4. 更新 orchestration 状态板

## 2026-06-06 CLI lint 失败排查与修复

- 时间：2026-06-06 14:23:39 CST
- 任务目标：更新本地代码到 `origin/main`，排查并修复远端 `CI` 中 `pnpm lint` 不通过的问题。
- 上下文依据：
  - `.codex/context-summary-cli-lint-fix.md`
  - `apps/studio/src/studio-client.ts`
  - `apps/studio/src/shared/studio-api-types.ts`
  - `eslint.config.js`
- 已知事实：
  - 本地原 `main` 落后 `origin/main` 一个提交。
  - 快进后当前头提交为 `5cbb300 feat: 增强录制回放闭环 — 多策略定位、扩展侧栏与 Studio 体验`。
  - GitHub 远端失败点是 `pnpm lint`，具体错误为 `RunFlowOptions` 未使用。
- 工具与环境说明：
  - 当前环境未提供 `sequential-thinking` 工具，改为使用结构化排查与显式复现替代。
  - 当前环境未提供 `desktop-commander` 工具，改用本地命令与 CodeGraph 收集上下文。
  - 当前环境未安装 `gh`，无法直接通过 GitHub CLI 读取 Actions 运行记录，改为使用远端网页信息与本地复现验证。
- 编码前检查：
  - 已查阅上下文摘要文件：`.codex/context-summary-cli-lint-fix.md`
  - 将复用的项目模式：
    - `apps/studio/src/shared/studio-api-types.ts`：保留共享类型定义，只调整消费端导入。
    - `apps/studio/scripts/dev-electron.mjs`：沿用 `.mjs` 作为 Node ESM 配置文件命名模式。
    - `scripts/create-package-skeleton.mjs`：确认仓库已有多处 `.mjs` 命名实践。
  - 将遵循命名约定：类型导入继续使用 `import type`，不引入兼容性别名。
  - 将遵循代码风格：做最小差异修复，不顺手改动业务逻辑。
- 编码后声明：
  - 复用了以下既有组件与模式：
    - `apps/studio/src/shared/studio-api-types.ts`：保留 `RunFlowOptions` 定义，仅清理消费端无用导入。
    - `apps/studio/scripts/dev-electron.mjs` 与 `scripts/create-package-skeleton.mjs`：沿用 `.mjs` 作为 Node ESM 文件扩展名。
  - 实际代码改动：
    - 删除 `apps/studio/src/studio-client.ts` 中未使用的 `RunFlowOptions` 导入，修复 ESLint 失败。
    - 将根 ESLint 配置从 `eslint.config.js` 切换为 `eslint.config.mjs`，消除 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
  - 验证环境修正：
    - 快进到 `origin/main` 后，本地 Node 24 环境暴露了 `happy-dom` 与 `better-sqlite3` 的安装/ABI 漂移问题。
    - 依据仓库 `.nvmrc` 与 CI 工作流，最终使用 `Node v20.19.6` 进行验收，结果与远端 CI 目标环境一致。

## 2026-06-06 真实页面稳定性增强规划启动

- 时间：2026-06-06 14:46:00 CST
- 任务目标：为“真实页面录制与执行不稳定”问题建立完整设计、实施计划、worktree 并行编排与后续自主开发基线。
- 用户指令：
  - 用户明确授权“全权自主规划任务、持续开发”。
  - 用户要求“先用 plan 制定完整开发计划，各功能依托 worktree 分派 subagent 并行开发，验收合格即可回收对应 agent”。
- 所用技能：
  - `writing-plans`：产出完整实施计划。
  - `using-git-worktrees`：确认工作区隔离与 worktree 目录策略。
  - `dispatching-parallel-agents`：设计后续并行轨道。
  - `subagent-driven-development`：约束后续执行与验收方式。
  - `brainstorming`：本应要求设计审批后再实现；由于用户已明确授予自主决策权限，本轮以“先写设计文档并落盘”满足设计关卡，再继续进入计划与执行阶段。
- 工具与环境说明：
  - 当前环境未提供 `sequential-thinking`，改为结构化分析、CodeGraph、现有测试与分阶段留痕替代。
  - 当前环境未提供 `desktop-commander`，改用本地命令与 `apply_patch` 进行文件分析与编辑。
  - 当前环境未提供 `context7` 与 `github.search_code`，本轮优先依据仓库现有实现、文档与测试做计划；后续若需要外部资料，再补充来源。
- 上下文依据：
  - `.codex/context-summary-real-page-stability-program.md`
  - `docs/architecture/overview.md`
  - `docs/domain/flow-dsl.md`
  - `docs/superpowers/plans/2026-05-26-run-first-roadmap.md`
  - `packages/flow-dsl/src/schema.ts`
  - `packages/recorder/src/normalize.ts`
  - `packages/recorder/src/target-from-dom.ts`
  - `packages/runtime/src/playwright-runner.ts`
  - `packages/project-knowledge/src/repository.ts`
  - `apps/studio/electron/services.ts`
- 基线检查：
  - 已确认当前在普通仓库工作区，不在 linked worktree 中。
  - 已确认 `.worktrees/` 目录存在且被 `.gitignore` 忽略。
  - 已确认 Node 20 基线存在：`v20.19.6`。
  - 已执行 `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`，结果通过。
- 编码前检查：
  - 已查阅上下文摘要文件：`.codex/context-summary-real-page-stability-program.md`
  - 将使用以下可复用组件：
    - `packages/recorder/src/target-from-dom.ts`：目标提取与行为判定
    - `packages/recorder/src/normalize.ts`：录制归一化
    - `packages/runtime/src/playwright-runner.ts`：执行主循环与产物落盘
    - `packages/project-knowledge/src/repository.ts`：环境与执行记录持久化
    - `apps/studio/electron/services.ts`：Studio 运行服务编排
  - 将遵循命名约定：包对外导出走 `src/index.ts`，错误使用 `FlowWeaveError`，文档与注释使用简体中文。
  - 将遵循代码风格：先补测试、再做最小实现、最后跑 Node 20 验证。
  - 确认不重复造轮子：已检查 recorder、runtime、knowledge、studio 现有主链路，后续以增强为主，不新建平行执行框架。
- 本轮新增文档：
  - `docs/superpowers/specs/2026-06-06-real-page-stability-design.md`
  - `docs/superpowers/plans/2026-06-06-real-page-stability-implementation-plan.md`
  - `docs/superpowers/plans/2026-06-06-real-page-stability-orchestration.md`
- 已执行的编排动作：
  - 创建协调分支：`codex/real-page-stability-program`
  - 创建 worktree：
    - `.worktrees/codex-real-page-foundation`
    - `.worktrees/codex-real-page-recorder`
    - `.worktrees/codex-real-page-runtime`
    - `.worktrees/codex-real-page-environment`
    - `.worktrees/codex-real-page-diagnostics`
    - `.worktrees/codex-real-page-benchmarks`
  - 已启动子代理：
    - Foundation：`Kepler` / `019e9bb4-15c4-7d61-bd88-c9632921efc7`
    - Benchmarks（第一阶段）：`Halley` / `019e9bb4-4cd4-7931-a911-c2f8c7521167`
    - Diagnostics（第一阶段）：`Kuhn` / `019e9bb4-8113-7092-b538-a6e7ef66d76c`
  - 已创建线程心跳自动化：
    - Automation ID：`flowweave`
    - 频率：每 30 分钟一次
    - 目的：自动继续执行计划、回收子代理结果并推进集成
- 轨道回收进展：
  - Diagnostics 第一阶段已完成。
  - 子代理 `Kuhn` 提交哈希：`adf388e195e41bf0a4b51469a9a18c142f1c505f`
  - 主代理复验命令：`PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test`
  - 复验结果：通过（`2` 个测试文件、`7` 个测试全部通过）
  - 已并入协调分支的提交：`5be3cc7 增强页面脆弱性静态分析规则`
  - 已关闭 Diagnostics 子代理，避免无效占用。
  - Benchmarks 第一阶段已完成。
  - 子代理 `Halley` 提交哈希：`c04e27a170c1442cdc71fa507039eed7bbeb101f`
  - 主代理审查结论：无阻塞问题；已并入协调分支提交 `5d00cc2 新增真实页面基准页面与矩阵文档`
  - 已关闭 Benchmarks 子代理。
  - Foundation 首版已提交，但主代理复验未通过。
  - 子代理 `Kepler` 首版提交哈希：`7d5447795214c87183c8ced9e18d77f468795601`
  - 失败命令：`PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl test`
  - 失败信息：`TypeError: Cannot read properties of undefined (reading 'type')`
  - 根因判断：`waitStepSchema` 带 `superRefine` 后成为 ZodEffects，当前 Zod 版本无法直接作为 `z.discriminatedUnion("type", ...)` 成员。
  - 已向 Foundation 子代理发回返修指令，限制在原授权文件范围内修正实现方式。
  - Foundation 已返修完成。
  - 返修提交：`d8a3618f3e1e32f7fca3ed818427df6e8a1dc4b9`
  - 主代理复验：
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl test`：通过
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime typecheck`：通过
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge typecheck`：通过
  - 已并入协调分支提交：
    - `871ee25 feat: 冻结真实页面稳定性基础接口`
    - `c517035 fix: 调整 wait 步骤校验挂载方式`
  - 已关闭 Foundation 子代理。
  - 已将以下 worktree 快进到 Foundation 最新基线：
    - `.worktrees/codex-real-page-recorder`
    - `.worktrees/codex-real-page-runtime`
    - `.worktrees/codex-real-page-environment`
  - 已启动第二阶段正式轨道：
    - Recorder：`Planck` / `019e9bc2-28d0-7852-87c5-b1ee7fe13742`
    - Runtime：`Faraday` / `019e9bc2-76c9-7a33-8fa2-ae2f26a4eedf`
    - Environment：`Galileo` / `019e9bc2-b90a-7250-b8ca-90e4c28416c0`

## 2026-06-06 真实页面稳定性第一轮集成收口

- 时间：2026-06-06 15:35:05 CST
- 任务目标：完成 Recorder / Runtime / Environment 三条主轨道回收，统一并回协调分支，并在 Node 20 下完成仓库级集成验收。
- 上下文依据：
  - `.codex/context-summary-real-page-stability-program.md`
  - `docs/superpowers/specs/2026-06-06-real-page-stability-design.md`
  - `docs/superpowers/plans/2026-06-06-real-page-stability-implementation-plan.md`
  - `docs/superpowers/plans/2026-06-06-real-page-stability-orchestration.md`
  - `packages/recorder/src/normalize.ts`
  - `packages/runtime/src/playwright-runner.ts`
  - `packages/project-knowledge/src/repository.ts`
  - `apps/studio/electron/services.ts`
- 工具与环境说明：
  - 当前环境仍未提供 `sequential-thinking`、`desktop-commander`、`context7`，继续以结构化分解、本地命令、CodeGraph 与仓库测试替代。
  - 统一使用 `Node v20.19.6` 验收，原因是仓库 `.nvmrc` 与既有 `smoke` 基线均指向 Node 20，且 Node 24 仍存在 `better-sqlite3` ABI 漂移。
- 轨道回收结果：
  - Recorder 轨道已完成并并入协调分支：
    - 子代理提交：`5cded6014730a0c6c0ed7c54e7ab12d181a29665`
    - 协调分支提交：`8228aae feat: 增强 Recorder 真实页面语义与去噪`
    - 主代理复验：`PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
  - Runtime 轨道已完成并并入协调分支：
    - 子代理提交：`f8ab81898b3b57a6cfa4758b2672833331708e38`
    - 协调分支提交：`07d4d02 增强真实页面 runtime 稳定执行能力`
    - 主代理复验：
      - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/shared --filter @flowweave/flow-dsl --filter @flowweave/page-intelligence build`
      - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime typecheck`
      - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
  - Environment 轨道已完成并并入协调分支：
    - 原 worktree 分支提交：`343afe1 feat: 打通 Studio 运行环境与变量注入`
    - 协调分支提交：`1051e10 feat: 打通 Studio 运行环境与变量注入`
    - 说明：Environment 原子代理已回收，剩余工作仅为 worktree 已有改动的主代理复验、提交与并回，未再重新派发新子代理，避免重复写入同一批文件。
    - 主代理复验：
      - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/ui build`
      - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge build`
      - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime build`
      - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge test`
      - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
- 编码后声明：
  - 本轮新增并回的能力集中在 Studio 环境与变量链路：
    - `apps/studio/electron/services.ts`：运行环境解析、默认环境回落、执行缓存补齐。
    - `apps/studio/src/App.tsx`：环境切换、`baseUrl`/`storageStatePath` 输入、运行变量注入。
    - `apps/studio/src/flow-step-format.ts`：补齐 `select`、`setChecked`、`press`、`upload`、增强版 `wait` 的展示。
    - `packages/project-knowledge/src/repository.ts`：`storageStatePath` 持久化与旧库列兼容。
  - 复用了以下既有组件与模式：
    - `ProjectKnowledgeRepository` 作为环境持久化单一入口。
    - `RunFlowOptions` 作为 Studio → Electron → Runtime 的运行参数桥接。
    - `playwright-runner.ts` 既有执行主链路，不新建平行执行器。
- 统一验收结果：
  - 分层验证通过：
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/flow-dsl test`
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test`
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test`
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge test`
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
  - 仓库级验证通过：
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm typecheck`
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm test`
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm build`
    - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`
  - `pnpm smoke` 最终 `e2e:login` 成功：
    - 项目 ID：`dd27be49-18ea-46e8-9f93-5de8eea0aa10`
    - 执行 ID：`81ee4ad6-c3f3-4a71-8ac3-fb77beec6f98`
    - 共 `4` 个步骤，全部 `success`
- 当前结论：
  - 真实页面稳定性第一轮主线已完成基础接口冻结、录制增强、执行增强、环境注入贯通、脆弱性静态分析增强与真实页面基准夹具落盘。
  - 当前协调分支与 Environment worktree 均已恢复干净状态，可继续进入 Diagnostics 第二阶段或 Benchmarks 第二阶段。

## 2026-06-06 失败诊断产物与 Studio 调试入口增强

- 时间：2026-06-06 15:46:56 CST
- 任务目标：补齐失败步骤 `diagnostic.json` 产物、知识库持久化、Studio 打开诊断入口，降低真实页面失败时的排查成本。
- 所用技能：
  - `brainstorming`：本轮不重新拉起用户问答，直接复用已批准的设计文档 `docs/superpowers/specs/2026-06-06-real-page-stability-design.md` 作为设计依据。
  - `test-driven-development`：先补失败测试，再做最小实现，最后跑回归。
  - `verification-before-completion`：提交前执行新鲜的局部验证与 `pnpm smoke`。
- 单 agent 串行执行说明：
  - 本轮改动同时穿过 `packages/runtime`、`packages/project-knowledge`、`packages/ui`、`apps/studio` 四层共享执行 DTO。
  - 若再次派发并行子代理，会在 `diagnosticPath` 字段、SQLite schema 迁移和 UI 展示列上形成高概率写冲突。
  - 因此本轮由主代理串行闭环，补偿措施是严格执行 TDD 和全仓 `smoke` 验收。
- 红灯测试：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
    - 失败点：`failedStep?.diagnosticPath` 为 `undefined`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge test`
    - 失败点：`diagnosticPath` 无法从执行记录中读回
- 实现范围：
  - `packages/runtime`
    - 失败步骤写入 `step-<n>-diagnostic.json`
    - 失败步骤额外写入 `page-<n>.json`
    - `StepLog` 新增 `diagnosticPath`
  - `packages/project-knowledge`
    - `execution_steps` 新增 `diagnostic_path`
    - 兼容旧库自动 `ALTER TABLE`
    - `saveExecution / listExecutions / getExecution` 全链路透传
  - `packages/ui`
    - `StepLogTable` 新增“诊断”列与打开按钮
  - `apps/studio`
    - Electron 服务、HTTP fallback、共享类型与主界面透传 `diagnosticPath`
    - 执行日志页支持直接打开诊断 JSON
- 绿灯验证：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test`
    - 结果：`7/7` 通过
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge test`
    - 结果：`10/10` 通过
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/ui build`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge build`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime build`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke`
    - 结果：通过，`e2e:login` 成功
- 提交结果：
  - 代码提交：`76851c9 feat: 增强失败步骤诊断产物与入口`
- 当前结论：
  - 真实页面失败时，现在会同时保留截图、失败页摘要和诊断 JSON。
  - Studio 执行日志页已具备“打开截图 / 打开诊断”双入口。

## 2026-06-06 Benchmarks 第二阶段验收

- 时间：2026-06-06 16:09:46 CST
- 任务目标：补齐真实页面登录态环境基准、统一 5 个本地 fixture 回归矩阵，并把该矩阵纳入 `smoke:full`。
- 所用技能：
  - `verification-before-completion`：先跑新鲜验收，再做提交与留痕。
  - `test-driven-development`：延续本轮前序红灯 -> 绿灯过程，不用“改了应该能过”的推断替代验证。
- 单 agent 串行执行说明：
  - 本轮变更同时穿过 `packages/runtime`、`examples/`、`package.json`、`docs/guides/fixture-matrix.md`，并在最终验收时暴露了 `apps/studio/src/App.tsx` 的未使用类型导入。
  - 若再次派发并行子代理，会在 runtime 测试、矩阵脚本、脚本入口和文档同步上形成高概率冲突。
  - 因此本轮由主代理串行闭环，补偿措施是执行 `pnpm lint` 与 `pnpm smoke:full` 双重验收。
- 前序红绿过程摘要：
  - `packages/runtime/src/types.ts` 早已定义 `storageStatePath`，但 `packages/runtime/src/playwright-runner.ts` 在本轮修复前并未把它传给 `browser.newContext()`。
  - runtime 登录态测试在修复前失败；补上 `storageState: options.storageStatePath` 后转绿。
  - 真实页面矩阵脚本在创建初期会误吃旧 `dist` 产物；本轮改为直接导入 `packages/*/src/index.ts`，避免基准结果与 live implementation 脱节。
- 实现范围：
  - `packages/runtime/src/playwright-runner.ts`
    - `browser.newContext()` 透传 `storageStatePath`
  - `packages/runtime/src/playwright-runner.test.ts`
    - 新增“支持通过 `storageStatePath` 注入登录态环境”
    - 新增“真实页面 fixture 矩阵全部成功”
    - 清理未使用的 `spaRouteFixtureUrl`，恢复 runtime lint
  - `examples/fixtures/session-dashboard.html`
    - 新增登录态仪表盘 fixture，验证 localStorage 会话恢复
  - `examples/real-page-smoke.ts`
    - 统一定义 5 个基准 Flow、上传测试文件与 `storageStatePath`
  - `examples/run-real-page-smoke.ts`
    - 输出矩阵结果、耗时和产物目录
  - `package.json`
    - 新增 `e2e:real-pages`
    - `smoke:full` 追加真实页面矩阵
  - `docs/guides/fixture-matrix.md`
    - 同步第二阶段回归入口与 `session-dashboard` 基准说明
  - `apps/studio/src/App.tsx`
    - 清理未使用的 `StudioProjectEnvironment` 类型导入，恢复仓库 lint 绿灯
- 编码后声明：
  - 复用了以下既有组件与模式：
    - `ExecutionOptions.storageStatePath`：继续作为环境注入唯一入口，不新建平行配置字段。
    - `executeFlow`：继续走 runtime 主执行链路，不新增独立 smoke 执行器。
    - 既有 `examples/fixtures/*.html` 与 runtime fixture 测试模式：沿用本地自包含 HTML 基准，不引入外部站点波动。
  - 遵循了以下项目约定：
    - 包级对外行为仍通过 `packages/*/src/index.ts` 暴露。
    - 注释与文档保持简体中文，标识符沿用英文。
    - 验收统一使用 `Node v20.19.6`，不把 `Node 24` 假失败混入结果。
- 绿灯验证：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint`
    - 结果：通过，`12` 个包全部成功。
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:full`
    - 结果：通过，包含 `typecheck / test / build / e2e:login / e2e:real-pages`
    - `e2e:login`
      - 项目 ID：`639177c6-41e8-41cf-80e1-46c5ae8c6c66`
      - 执行 ID：`6dbc2072-655b-497a-a69a-9f63d5eda342`
      - `4` 个步骤全部 `success`
    - `e2e:real-pages`
      - `checkbox-select`：成功，`5` 步，`860ms`
      - `delayed-panel`：成功，`4` 步，`1554ms`
      - `upload-form`：成功，`5` 步，`768ms`
      - `spa-route`：成功，`4` 步，`797ms`
      - `session-dashboard`：成功，`3` 步，`685ms`
- 提交结果：
  - 代码提交：`d5bcfea feat: 建立真实页面回归矩阵并补齐登录态基准`
- 当前结论：
  - `storageStatePath` 已从 Studio / 环境配置语义真正落到 Playwright context 级别，登录态页面不再只是“界面上填了字段”，而是可以进入可执行验证。
  - 真实页面基准现已形成 `5` case 矩阵，并纳入 `smoke:full`。
  - `Node 24` 与 `better-sqlite3` 的 ABI 风险仍存在，本轮验收继续以 `Node 20` 为准。
