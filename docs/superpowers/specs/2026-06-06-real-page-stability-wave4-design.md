# 真实页面稳定性 Wave 4 设计

生成时间：2026-06-06

## 1. 背景

上一轮已经把以下能力并回协调分支：

1. Recorder / Runtime / Fragility 的共享占位符协议。
2. Studio 运行上下文透传、最近输入恢复与应用内诊断工作台。
3. 真实页面 `p5` 矩阵，覆盖 `15` 个本地 fixture。
4. Node 20 下 `pnpm lint`、`pnpm smoke`、`pnpm e2e:real-pages` 全绿。

但从“真实录制页面内容并稳定执行”的角度，仍有 3 个高价值缺口：

1. 录制端还不会采集 `contenteditable`，导致富文本备注、运营说明、审批意见等真实页面内容录不出来。
2. 真实页面矩阵仍缺“恢复失败后二次重试成功”“跨页批量选择”“抽屉内二次保存校验”这类更接近后台异常路径的基准，也没有失败类型长期基线。
3. Studio 已能读诊断内容，但还缺少结构化修复建议，用户仍要把“诊断现象”自己翻译成“下一步动作”。

## 2. 本轮目标

1. 打通 `contenteditable` 的真实录制闭环，让录制产物能直接用于当前 runtime 回放。
2. 把真实页面矩阵扩展到 `p6`，补 3 个更贴近后台失败恢复与复杂状态切换的基准，并增加失败类型汇总。
3. 在 Studio 诊断面板中增加结构化修复建议层，直接提示优先动作。

## 3. 成功标准

1. content script 会为 `contenteditable` 生成 fill 事件，recorder 能正确归一化并保留目标 hints。
2. 至少有 1 条录制层单测 + 1 条 normalize 回归覆盖 `contenteditable`。
3. 新增 `p6` 档位矩阵，至少包含：
   - 会话恢复失败后二次重试成功
   - 跨页批量选择
   - 抽屉二次保存校验
4. `run-real-page-smoke.ts` 输出除成功率、总耗时、平均耗时外，还能汇总失败类型分布。
5. Studio 诊断面板能根据 fragility / diagnostic / target hints 给出结构化修复建议。
6. Node 20 下相关局部验证与最终统一验收通过。

## 4. 并行轨道

### 4.1 Recorder Contenteditable Contract

- 范围：
  - `apps/extension/**`
  - `packages/recorder/**`
- 目标：
  - 让 `contenteditable` 进入录制闭环
  - 补 payload / normalize / 去噪回归

### 4.2 Studio Repair Suggestions

- 范围：
  - `apps/studio/src/**`
  - 必要时 `apps/studio/src/shared/**`
- 目标：
  - 将 `fragilityIssues` 与 step diagnostic 转成结构化修复建议
  - 不改 runtime 执行语义

### 4.3 Benchmarks P6

- 范围：
  - `examples/**`
  - `docs/guides/fixture-matrix.md`
  - `packages/runtime/src/real-page-matrix.test.ts`
- 目标：
  - 新增 P6 场景
  - 给矩阵增加失败类型统计

## 5. 非目标

本轮不做：

1. 远端真实站点自动 smoke。
2. AI 自愈选择器。
3. 扩展浏览器级 E2E 平台。
4. Node 24 全面切换。
