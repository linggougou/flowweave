# 真实页面稳定性 Wave 10 并行编排板

更新时间：2026-06-07 06:05 CST

## 1. 主目标

在不破坏当前 Wave 9 稳定基线的前提下，完成“动作级韧性 + P8 技术根因观测”三轨并行开发，并在 Node 20 下通过统一验收。

## 2. 基线检查

- 当前分支：`codex/real-page-stability-program`
- 当前主线状态：`ahead 13`
- Node 基线：`v20.19.6`
- 当前 worktree：仅主工作区
- 已完成基线：
  - Wave 9 recorded replay：`13/13`
  - Wave 9 real-pages：`21/21`

## 3. 轨道分派

| 轨道 | 分支 | Worktree | 写入范围 | 禁止修改 |
|------|------|----------|----------|----------|
| Runtime Action Resilience | `codex/real-page-wave10-runtime-resilience` | `.worktrees/codex-real-page-wave10-runtime-resilience` | `packages/runtime/src/playwright-runner.ts`、`playwright-runner.test.ts`、`types.ts` | `examples/*`、`apps/studio/*` |
| Benchmarks P8 | `codex/real-page-wave10-benchmarks-p8` | `.worktrees/codex-real-page-wave10-benchmarks-p8` | `examples/*`、`packages/runtime/src/real-page-matrix.test.ts`、`packages/runtime/src/recorded-replay-matrix.test.ts`、`docs/guides/fixture-matrix.md` | `packages/runtime/src/playwright-runner.ts`、`apps/studio/*` |
| Studio Runtime Cause Insight | `codex/real-page-wave10-studio-runtime-cause` | `.worktrees/codex-real-page-wave10-studio-runtime-cause` | `apps/studio/src/shared/*`、`apps/studio/src/DiagnosticInspector*` | `packages/runtime/src/playwright-runner.ts`、`examples/*` |

## 4. 执行顺序

### 阶段 A：主代理先落设计与计划

1. 更新 `.codex/context-summary-real-page-stability-wave10.md`
2. 落地 spec / implementation plan / orchestration
3. 创建三条 worktree

### 阶段 B：三轨并行

1. Runtime 轨：
   - 先补失败测试
   - 再实现动作级恢复
   - 最后落结构化根因分类
2. Benchmarks 轨：
   - 先收敛 fixture / 文档 / smoke 的场景单一真相
   - 再建 `p8` fixture 与 recorded replay 缺口补齐
   - 最后跑两条 smoke
3. Studio 轨：
   - 先补共享逻辑失败测试
   - 再消费 runtime 新字段
   - 最后补修复建议

### 阶段 C：统一集成

1. 先并 Runtime
2. 再并 Benchmarks
3. 最后并 Studio
4. 主代理统一跑 Node 20 验收并更新 `.codex`

## 5. 验收门槛

- Runtime：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`
- Benchmarks：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts real-page-matrix.test.ts`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`
- Studio：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector failure-insights repair-suggestions`
- 主代理统一门槛：
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts real-page-matrix.test.ts`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test -- DiagnosticInspector failure-insights repair-suggestions`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages`
  - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages`

## 6. 风险清单

- runtime 动作恢复如果范围过宽，可能掩盖真实错误。
- `p8` 若直接并入默认矩阵，可能拉长日常回归时长。
- Studio 与 runtime 共享字段若不同步，会造成假红或错误解释。

## 7. 回收规则

轨道满足以下条件即可回收：

1. 写入范围内改动完整
2. 轨道局部命令通过
3. 主代理规格复核无阻塞问题
4. 主代理代码质量复核无阻塞问题

回收动作：

1. 记录轨道摘要到 `.codex/operations-log.md`
2. 合并对应分支
3. 删除对应 worktree
4. 若无保留需要，再删本地轨道分支
