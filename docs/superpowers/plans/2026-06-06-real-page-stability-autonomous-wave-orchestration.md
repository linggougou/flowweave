# 真实页面稳定性下一轮自主并行编排板

更新时间：2026-06-06 23:48 CST

## 1. 主目标

在不破坏当前 `Node 20` 稳定主链的前提下，先完成一层 Foundation，再完成下一轮 5 轨 worktree 并行开发，并把结果统一并回 `codex/real-page-stability-program`。

## 2. 当前基线

- 协调分支：`codex/real-page-stability-program`
- 远端同步：已同步到 `origin/codex/real-page-stability-program`
- Node 基线：`v20.19.6`
- 当前主门槛：`pnpm lint`、`pnpm smoke`
- `.worktrees/`：已存在且已被 `.gitignore` 忽略

## 3. Foundation（主代理先行）

- 目标：
  - 抽取共享占位符协议工具。
  - 先让 `fragility` 切到统一协议，为 Recorder / Runtime 两轨提供稳定基线。
- 写入范围：
  - `packages/shared/src/index.ts`
  - `packages/shared/src/template-variables.ts`
  - `packages/page-intelligence/src/fragility.ts`
  - `packages/page-intelligence/src/fragility.test.ts`
- 局部验收：
  - `pnpm --filter @flowweave/shared build`
  - `pnpm --filter @flowweave/page-intelligence test`

## 4. 新一轮轨道

| 轨道 | 分支 | Worktree | 负责范围 | 禁止修改 |
|------|------|----------|----------|----------|
| Recorder Placeholder Contract | `codex/real-page-recorder-contract` | `.worktrees/codex-real-page-recorder-contract` | `apps/extension/entrypoints/content.ts`、`packages/shared/src/recording-protocol.ts`、`packages/recorder` | `packages/runtime`、`apps/studio`、`examples`、CI |
| Runtime Replay Contract | `codex/real-page-runtime-contract` | `.worktrees/codex-real-page-runtime-contract` | `packages/runtime/src/playwright-runner.ts`、`packages/runtime/src/types.ts`、`packages/runtime/src/playwright-runner.test.ts` | `apps/extension`、`packages/recorder`、`apps/studio`、`examples`、CI |
| Studio Experience | `codex/real-page-studio-experience` | `.worktrees/codex-real-page-studio-experience` | `apps/studio`、`packages/project-knowledge` | `packages/runtime`、`examples`、CI |
| Benchmarks P5 | `codex/real-page-benchmarks-p5` | `.worktrees/codex-real-page-benchmarks-p5` | `examples`、`docs/guides/fixture-matrix.md`、`packages/runtime/src/real-page-matrix.test.ts` | `packages/recorder`、`apps/studio`、CI |
| CI Runtime Refresh | `codex/ci-runtime-refresh` | `.worktrees/codex-ci-runtime-refresh` | `.github/workflows`、`README.md`、`docs/guides/quickstart.md` | 功能代码、fixture、Studio |

## 5. 子代理职责

### Recorder Placeholder Contract

- 统一扩展侧 upload 占位符、payload 保真与 recorder normalize 合同
- 重点防止 `fileNames` 丢失、upload token 碰撞、字面量 `{{...}}` 边界误判
- 局部验收：
  - `pnpm --filter @flowweave/recorder test`

### Runtime Replay Contract

- 切到 Foundation 提供的共享占位符协议
- 扩 RecordedEvent -> Flow -> runtime 整链回归
- 局部验收：
  - `pnpm --filter @flowweave/runtime test`

### Studio Experience

- 修复运行参数透传，让 Studio 表单真正影响 `executeFlow()`
- 持久化最近一次运行输入
- Studio 自动回填与 preflight 提示
- 诊断面板修复建议层与 `runContext` 摘要
- 局部验收：
  - `pnpm --filter @flowweave/project-knowledge test`
  - `pnpm --filter @flowweave/app-studio test`
  - `pnpm --filter @flowweave/app-studio typecheck`

### Benchmarks P5

- 新增 Tab / contenteditable / 空结果重试 / 联动筛选类 fixture
- 增加独立矩阵测试与汇总输出
- 局部验收：
  - `pnpm --filter @flowweave/runtime test`
  - `pnpm e2e:real-pages`

### CI Runtime Refresh

- 升级 GitHub Actions 到无 deprecated runtime 警告的版本
- 保持本地/远端门槛一致
- 局部验收：
  - `pnpm lint`
  - `pnpm smoke`

## 6. 合并顺序

1. Foundation
2. Recorder Placeholder Contract
3. Runtime Replay Contract
4. Studio Experience
5. Benchmarks P5
6. CI Runtime Refresh

理由：

- Foundation 决定占位符协议事实来源，必须先并回。
- Recorder Placeholder Contract 与 Runtime Replay Contract 依赖同一共享协议，因此先录制、再执行，减少回归噪声。
- Studio Experience 与 Benchmarks 基本独立，但 Studio 体验更贴近主产品面，可先合。
- CI Runtime Refresh 对功能代码无侵入，放最后并不阻塞功能合入。

## 7. 统一验收

主代理每合完一条轨道后做最小复验，全部并回后执行：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
```

若 Benchmarks 轨道改动了矩阵主入口，再追加：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:full
```

## 8. 回收规则

满足以下条件即可回收对应 agent / worktree：

1. 轨道授权范围内改动完整
2. 对应局部命令通过
3. 规格复核通过
4. 代码质量复核无阻塞问题

回收动作：

1. 记录轨道摘要
2. 合并 worktree 分支
3. 关闭子代理
4. 删除对应 worktree

## 9. 风险与注意事项

- `packages/runtime/src/playwright-runner.test.ts` 继续变大风险高，因此 Benchmarks 轨道尽量落新测试文件，避免和 Runtime Replay Contract 抢写。
- `apps/studio/src/App.tsx` 冲突概率高，因此 Studio 体验与诊断建议合并成同一轨道。
- `apps/studio/electron/main.ts` 目前仍只消费 `showBrowser`，Studio Experience 轨必须优先修复这条执行断链。
- Recorder / Runtime 若不先吃到同一共享协议，容易各自复制正则，因此 Foundation 不可跳过。
- CI 轨道涉及时效性版本信息，实施前必须用官方来源复核。
