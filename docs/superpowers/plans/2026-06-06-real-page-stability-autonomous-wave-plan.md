# 真实页面稳定性下一轮自主并行计划 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前真实页面稳定性主线上，再完成一轮可并行的稳定性增强，重点补齐占位符协议统一、Recorder/Runtime 合同、Studio 真实执行体验、基准矩阵扩容和 CI runtime 维护。

**Architecture:** 本轮采用“Foundation 先行 + 5 轨 worktree 并行”模式。Foundation 由主代理先串行补齐共享占位符协议与 fragility 基线；随后 5 条轨道按独占写入范围拆分：Recorder Placeholder Contract 负责 extension/recorder 合同，Runtime Replay Contract 负责 runtime 回放合同，Studio Experience 负责 studio/project-knowledge，Benchmarks P5 负责 examples 与矩阵文档，CI Runtime Refresh 负责 workflow 与相关文档。主代理按“Foundation -> 轨道局部验收 -> 集成验收 -> 回收 worktree”顺序推进。

**Tech Stack:** TypeScript strict、Vitest、Playwright、pnpm workspace、Turborepo、Electron、GitHub Actions

---

### Task 1: Foundation

**Files:**
- Create: `packages/shared/src/template-variables.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/page-intelligence/src/fragility.ts`
- Modify: `packages/page-intelligence/src/fragility.test.ts`
- Test: `packages/shared/**`、`packages/page-intelligence/**`

- [ ] **Step 1: 写红灯测试，锁定占位符协议分裂**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test
```

Expected:

- 新增的宽变量名、字面量大括号边界或共享解析工具用例先失败。

- [ ] **Step 2: 在 shared 中落统一占位符工具**

实现要求：

- 提供占位符提取、插值、单值判断等基础函数。
- 规则与当前 `FlowDocument.variables.name` 的 `min(1)` 约束保持兼容，不再只接受下划线。
- 导出路径稳定，供后续 Recorder / Runtime 轨道直接消费。

- [ ] **Step 3: 先把 fragility 切到共享协议**

要求：

- 保持现有错误码与诊断行为不回退。
- 只收敛协议，不顺手扩大 UI 或 runtime 范围。

- [ ] **Step 4: 跑局部绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/shared build
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/page-intelligence test
```

Expected:

- Foundation 提供的共享协议可被后续轨道复用。

- [ ] **Step 5: 提交 Foundation 基线**

```bash
git add packages/shared packages/page-intelligence
git commit -m "feat: 提供共享占位符协议基线"
```

### Task 2: Recorder Placeholder Contract

**Files:**
- Modify: `apps/extension/entrypoints/content.ts`
- Modify: `packages/shared/src/recording-protocol.ts`
- Modify: `packages/recorder/src/normalize.ts`
- Modify: `packages/recorder/src/normalize.test.ts`
- Test: `apps/extension/**`、`packages/recorder/**`

- [ ] **Step 1: 写红灯测试，锁定变量契约不一致与整链覆盖缺口**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test
```

Expected:

- 新增的宽变量名 / RecordedEvent 整链回归先失败。

- [ ] **Step 2: 修正扩展侧 upload 占位符与 recorder 归一化保真**

实现要求：

- 以 Foundation 提供的共享协议为准，不新增第二套正则。
- 修正 upload token 生成冲突风险。
- 确保 `fileNames` 等录制元信息在 normalize 后不会无声丢失。

- [ ] **Step 3: 扩展 recorder 侧占位符与导出回归**

覆盖建议：

- `upload-form`
- `literal-placeholder-copy`
- upload token 碰撞防御
- 至少 1 个 `fileNames` 或 payload 保真场景

- [ ] **Step 4: 跑局部绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test
```

Expected:

- Recorder 定向测试通过。

- [ ] **Step 5: 提交轨道分支**

```bash
git add apps/extension packages/shared packages/recorder
git commit -m "feat: 收敛录制占位符合同"
```

### Task 3: Runtime Replay Contract

**Files:**
- Modify: `packages/runtime/src/playwright-runner.ts`
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/playwright-runner.test.ts`
- Test: `packages/runtime/**`

- [ ] **Step 1: 写红灯测试，锁定回放合同缺口**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test
```

Expected:

- 新增的多场景 RecordedEvent -> Flow -> executeFlow 回归先失败。

- [ ] **Step 2: 切到 Foundation 的共享占位符协议**

要求：

- 统一字符串插值、数组插值和未解析占位符保留规则。
- 文件上传变量、导航 URL 与目标策略都走同一套协议。

- [ ] **Step 3: 扩展整链回归**

覆盖建议：

- `upload-form`
- `spa-route`
- `filterable-list`
- 至少 1 个非 upload 的真实录制语义场景

- [ ] **Step 4: 跑局部绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test
```

Expected:

- Runtime 定向测试通过。

- [ ] **Step 5: 提交轨道分支**

```bash
git add packages/runtime
git commit -m "feat: 收敛 runtime 回放合同"
```

### Task 4: Studio Experience

**Files:**
- Modify: `apps/studio/**`
- Modify: `packages/project-knowledge/**`
- Test: `apps/studio/**`、`packages/project-knowledge/**`

- [ ] **Step 1: 写红灯测试，锁定“最近一次输入复用”和 preflight 缺口**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
```

Expected:

- 新增的运行输入配置持久化与 preflight 提示用例先失败。

- [ ] **Step 2: 修复运行参数透传并持久化最近一次运行输入**

范围至少包括：

- `environmentName`
- `baseUrl`
- `storageStatePath`
- `variables`

要求：

- 修复 Electron preload / main / services 透传链路，让这些字段真正进入 `executeFlow()`。
- 与现有执行历史 / Flow 快照持久化链路并存，不引入第二套存储入口。

- [ ] **Step 3: Studio 运行表单支持自动回填和 preflight 提示**

提示至少覆盖：

- 缺少 `baseUrl`
- 缺少必填变量
- `storageStatePath` 文件不存在

- [ ] **Step 4: 诊断面板补“修复建议”层**

要求：

- 继续复用 `FragilityIssue`、`runContext`、`diagnostic` 与页面摘要，不新开平行协议。
- 至少能展示本次实际使用的 `environmentName / baseUrl / storageStatePath / variables`。

- [ ] **Step 5: 跑局部绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/project-knowledge test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio typecheck
```

Expected:

- 知识库、Studio 测试与 typecheck 通过。

- [ ] **Step 6: 提交轨道分支**

```bash
git add apps/studio packages/project-knowledge
git commit -m "feat: 增强 Studio 运行前后体验"
```

### Task 5: Benchmarks P5

**Files:**
- Modify: `examples/**`
- Modify: `docs/guides/fixture-matrix.md`
- Create: `packages/runtime/src/real-page-matrix.test.ts`
- Test: `examples/run-real-page-smoke.ts`、`packages/runtime/src/real-page-matrix.test.ts`

- [ ] **Step 1: 新增 fixture 红灯断言**

优先场景：

- Tab 切换
- contenteditable 编辑
- 空结果重试
- 联动筛选

- [ ] **Step 2: 落 fixture 与矩阵定义**

要求：

- 每个 fixture 单文件自包含。
- 关键断言节点必须有稳定 `id` 或 `data-*`。
- 不依赖外部网络。

- [ ] **Step 3: 增加独立矩阵测试文件**

要求：

- 尽量不要继续膨胀 `packages/runtime/src/playwright-runner.test.ts`
- 新矩阵测试文件只负责场景数量、名称顺序和汇总输出校验

- [ ] **Step 4: 跑局部绿灯验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

Expected:

- runtime 测试通过
- 新增 fixture 已进入矩阵并成功执行

- [ ] **Step 5: 更新矩阵文档并提交**

```bash
git add examples docs/guides/fixture-matrix.md packages/runtime/src/real-page-matrix.test.ts
git commit -m "test: 扩展真实页面矩阵到下一轮后台场景"
```

### Task 6: CI Runtime Refresh

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/guides/quickstart.md`

- [ ] **Step 1: 先核对官方最新 action 版本与弃用说明**

要求：

- 仅以官方 release / 官方文档为准。
- 把引用来源记入 `.codex/operations-log.md`。

- [ ] **Step 2: 升级 workflow 中会触发 deprecated runtime 警告的 action**

要求：

- 保留当前 Node 20 / 24 matrix
- 保留 Playwright 安装与 `pnpm lint` + `pnpm smoke` 链路

- [ ] **Step 3: 跑本地等效验证**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
```

Expected:

- 本地等效 CI 门槛继续通过

- [ ] **Step 4: 同步文档并提交**

```bash
git add .github/workflows/ci.yml README.md docs/guides/quickstart.md
git commit -m "ci: 刷新 actions runtime 基线"
```

### Task 7: 主代理集成与回收

**Files:**
- Modify: `.codex/operations-log.md`
- Modify: `.codex/verification-report.md`
- Modify: `docs/superpowers/plans/2026-06-06-real-page-stability-autonomous-wave-orchestration.md`

- [ ] **Step 1: 按顺序并回轨道**

推荐顺序：

1. Foundation
2. Recorder Placeholder Contract
3. Runtime Replay Contract
4. Studio Experience
5. Benchmarks P5
6. CI Runtime Refresh

- [ ] **Step 2: 跑统一验收**

Run:

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm lint
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke
```

如果 Benchmarks 修改了矩阵主入口，再追加：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm smoke:full
```

- [ ] **Step 3: 更新验收留痕**

要求：

- 记录每条轨道的局部验证结果
- 记录主代理统一验收结果
- 记录 agent 回收与 worktree 回收状态

- [ ] **Step 4: 完成集成提交**

```bash
git add .codex docs/superpowers/plans
git commit -m "chore: 记录下一轮自主并行开发验收"
```
