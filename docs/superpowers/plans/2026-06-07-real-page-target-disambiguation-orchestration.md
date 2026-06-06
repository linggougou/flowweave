# 真实页面 Target Disambiguation 并行编排板

更新时间：2026-06-07 00:55 CST

## 1. 主目标

在不破坏当前 `Node 20` 稳定主链的前提下，补齐真实页面“歧义目标消解”能力，让录制得到的 Flow 在重复按钮、重复文案和列表行操作页面中更稳定地命中正确元素。

## 2. 当前基线

- 协调分支：`codex/real-page-stability-program`
- 当前工作区：干净
- Node 基线：`v20.19.6`
- 当前主门槛：
  - `pnpm smoke`
  - `pnpm e2e:real-pages`
- 本轮规划前基线验证：
  - `pnpm --filter @flowweave/recorder test -- target-from-dom.test.ts normalize.test.ts step-filter.test.ts`：`45/45`
  - `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts real-page-matrix.test.ts`：`20/20`
  - `pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts`：`5/5`

## 3. Foundation（主代理先行）

- 目标：
  - 为 `Target.hints` 增加 `scopeText` 与 `scopeKind`
  - 冻结 DSL / Studio 共享类型协议
- 写入范围：
  - `packages/flow-dsl/src/schema.ts`
  - `apps/studio/src/shared/studio-api-types.ts`
- 局部验收：
  - `pnpm --filter @flowweave/flow-dsl test`
  - `pnpm --filter @flowweave/app-studio typecheck`

## 4. 并行轨道

| 轨道 | 分支 | Worktree | 负责范围 | 禁止修改 |
|------|------|----------|----------|----------|
| Recorder Scope Hints | `codex/target-recorder-scope` | `.worktrees/codex-target-recorder-scope` | `packages/recorder/src/target-from-dom.ts`、`packages/recorder/src/target-from-dom.test.ts`、`packages/recorder/src/normalize.ts`、`packages/recorder/src/normalize.test.ts` | `packages/runtime`、`apps/studio`、`examples` |
| Runtime Disambiguation | `codex/target-runtime-disambiguation` | `.worktrees/codex-target-runtime-disambiguation` | `packages/runtime/src/playwright-runner.ts`、`packages/runtime/src/playwright-runner.test.ts` | `packages/recorder`、`apps/studio`、`examples` |
| Studio Ambiguity Insight | `codex/target-studio-ambiguity` | `.worktrees/codex-target-studio-ambiguity` | `apps/studio/src/DiagnosticInspector.tsx`、`apps/studio/src/DiagnosticInspector.test.tsx`、`apps/studio/src/shared/repair-suggestions.ts`、`apps/studio/src/shared/repair-suggestions.test.ts`、必要时 `apps/studio/src/shared/studio-api-types.ts` | `packages/runtime`、`examples` |
| Benchmarks P7 | `codex/target-benchmarks-p7` | `.worktrees/codex-target-benchmarks-p7` | `examples/fixtures/repeated-row-actions.html`、`examples/real-page-smoke.ts`、`docs/guides/fixture-matrix.md`、`packages/runtime/src/real-page-matrix.test.ts` | `packages/recorder`、`apps/studio`、`packages/runtime/src/playwright-runner.test.ts` |

## 5. 轨道职责

### Recorder Scope Hints

- 采集最近语义容器的作用域线索
- 避免把过长或重复文本塞进 payload
- 保持 normalize 对新字段的保真
- 局部验收：
  - `pnpm --filter @flowweave/recorder test -- target-from-dom.test.ts normalize.test.ts step-filter.test.ts`

### Runtime Disambiguation

- 保留 `matchedCount === 1` 快路径
- 为 `matchedCount > 1` 增加候选打分
- 无法唯一消解时产出歧义诊断，而非静默 `.first()`
- 局部验收：
  - `pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts`

### Studio Ambiguity Insight

- 为歧义失败补更明确的修复建议
- 展示“多命中 / 作用域不足 / 需要重新录制到正确行”类提示
- 局部验收：
  - `pnpm --filter @flowweave/app-studio test -- DiagnosticInspector.test.tsx src/shared/repair-suggestions.test.ts`
  - `pnpm --filter @flowweave/app-studio typecheck`

### Benchmarks P7

- 新增重复操作列 fixture
- 把新场景接入 real-page matrix 与真实页面 smoke
- 保持 `p6` 已有观测输出不退化
- 局部验收：
  - `pnpm --filter @flowweave/runtime test -- real-page-matrix.test.ts`
  - `pnpm e2e:real-pages`

## 6. 合并顺序

1. Foundation
2. Recorder Scope Hints
3. Runtime Disambiguation
4. Studio Ambiguity Insight
5. Benchmarks P7

理由：

- Recorder / Runtime / Studio 都要消费同一份协议，Foundation 必须先并回。
- Runtime 需要 Recorder 侧产生的新 hints 才能真正发挥价值。
- Benchmarks 最后接入，能减少和 Runtime 轨 recorded replay 回归的并发冲突。

## 7. 统一验收

全部并回后执行：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

若新增 recorded replay fixture 导致 runtime 测试显著变慢，再补记最慢用例耗时变化。

## 8. 回收规则

满足以下条件即可回收对应 agent / worktree：

1. 轨道授权范围内改动完整
2. 对应局部命令通过
3. 主代理复核无阻塞问题
4. 已记录轨道摘要、提交哈希与并回结果

回收动作：

1. 记录轨道审计
2. 合并 worktree 分支
3. 关闭对应子代理
4. 删除对应 worktree

## 9. 风险与注意事项

- `packages/runtime/src/playwright-runner.ts` 是高冲突文件，Runtime 轨需避免顺手改等待策略或环境注入逻辑。
- `apps/studio/src/shared/studio-api-types.ts` 既在 Foundation 也在 Studio 轨可能涉及，Foundation 只补协议；Studio 轨若需追加字段，必须先基于 Foundation 最新基线。
- recorded replay 定向回归统一由 Runtime 轨维护，Benchmarks 只负责 fixture、matrix 与文档，避免并发冲突。
- 候选打分策略必须控制复杂度，避免为了解歧义把每步执行时间拉高到不可接受。
