# 真实页面稳定性 Wave 12：Web 与 Scroll 合同收口编排板

状态：进行中（2026-06-08）

更新时间：2026-06-08 23:42 CST

## 1. 主目标

在不破坏当前 `Node 20` 稳定主链的前提下，先吸收当前工作区已经验证过的 Foundation 改动，再用 worktree + subagent 完成：

1. Web Flow 版本恢复路由真实可用
2. `scroll` 从录制协议到 DSL 与 runtime 的完整闭环
3. 主线 smoke / CLI 继续可通过

## 2. 当前基线

- 协调分支：`codex/real-page-stability-program`
- Node 基线：`v20.19.6`
- 当前工作树：脏，但仅包含已知 Foundation 改动与 `.codex` 留痕
- `.worktrees/`：已存在，且已由 `.gitignore` 忽略
- 本轮替代工具说明：
  - `sequential-thinking` 不可用，改用 `update_plan` + CodeGraph +结构化日志做等效拆解
  - `desktop-commander` 不可用，改用 `codegraph_*`、`rg`、`sed`、`git diff`
  - `context7` / `github.search_code` 当前不可用，本轮优先依据仓库现有实现和测试推进

## 3. Foundation（主代理先行）

### 目标

- 吸收当前工作区已验证的基线改动，减少后续并行轨道噪声。

### 写入范围

- `packages/page-intelligence/src/fragility.ts`
- `packages/page-intelligence/src/fragility.test.ts`
- `packages/runtime/src/playwright-runner.ts`
- `packages/runtime/src/playwright-runner.test.ts`
- `scripts/doctor.mjs`
- `package.json`
- `apps/studio/package.json`
- `pnpm-lock.yaml`

### 局部验收

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime typecheck
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:prepare
CI=1 PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
```

### 并行前置条件

- Foundation 已提交到协调分支
- 主工作区 `git status` 除 `.codex` 外干净或仅剩新轨道期望改动

## 4. 第一批并行轨道

| 轨道 | 分支 | Worktree | 负责范围 | 禁止修改 |
|------|------|----------|----------|----------|
| Web Restore Contract | `codex/real-page-wave12-web-restore-contract` | `.worktrees/codex-real-page-wave12-web-restore-contract` | `apps/web/server/*` | `packages/shared`、`packages/recorder`、`packages/runtime`、`examples` |
| Scroll Capture Contract | `codex/real-page-wave12-scroll-capture-contract` | `.worktrees/codex-real-page-wave12-scroll-capture-contract` | `apps/extension`、`packages/shared`、`packages/recorder`、`packages/flow-dsl` | `apps/web`、`packages/runtime`、`examples` |

### Web Restore Contract 子代理职责

- 抽出可测试 server 入口
- 用真实 HTTP 测试锁定 restore 路由
- 修复 `/flow-versions/:versionId/restore` 不可达问题
- Node 20 验收：
  - `pnpm --filter @flowweave/app-web test`
  - `pnpm --filter @flowweave/app-web typecheck`

### Scroll Capture Contract 子代理职责

- 定义 `scroll` 统一步骤形态
- 在扩展侧录制窗口与容器 scroll
- 在 recorder / DSL 层打通闭环
- Node 20 验收：
  - `pnpm --filter @flowweave/recorder test`
  - `pnpm --filter @flowweave/flow-dsl typecheck`

## 5. 第二批后继轨道

| 轨道 | 分支 | Worktree | 依赖 | 负责范围 |
|------|------|----------|------|----------|
| Scroll Runtime Contract | `codex/real-page-wave12-scroll-runtime-contract` | `.worktrees/codex-real-page-wave12-scroll-runtime-contract` | Scroll Capture Contract 已并回 | `packages/runtime`、`examples/*`、矩阵测试 |

### Scroll Runtime Contract 子代理职责

- 在 runtime 中执行页面级与容器级 scroll 步骤
- 为 scroll 增加 recorded replay 回归入口
- Node 20 验收：
  - `pnpm --filter @flowweave/runtime test`
  - `pnpm e2e:recorded-pages`

## 6. Agent 编排顺序

1. 主代理完成 Foundation 验收并提交
2. 创建两条第一批 worktree
3. 并行派发：
   - Worker A：Web Restore Contract
   - Worker B：Scroll Capture Contract
4. 两条轨道返回后做主代理审查与并回
5. 再创建并派发：
   - Worker C：Scroll Runtime Contract
6. 统一主线验收
7. 回收 worktree / agent

## 7. 审查与回收规则

### 每条轨道必须满足

1. 写入范围无越界
2. Node 20 局部命令通过
3. 主代理完成规格复核
4. 主代理完成代码质量复核

### 回收动作

1. 记录轨道摘要到 `.codex/operations-log.md`
2. 合并轨道分支
3. 关闭对应 agent
4. 删除对应 worktree

## 8. 风险与应对

- `packages/shared/src/recording-protocol.ts` 会成为 scroll 捕获轨道的单点共享协议，禁止其他轨道顺手修改。
- `packages/runtime/src/playwright-runner.ts` 冲突概率高，因此 scroll runtime 必须等前一轨道并回后再启动。
- `apps/web/server/index.ts` 目前模块导入即监听端口，测试轨道若不先抽 server factory，会导致端口抢占与测试不稳定。
- 若同一阻塞条件连续 3 次出现，必须在 `.codex/operations-log.md` 明确记录“阻塞”并说明重复原因。
