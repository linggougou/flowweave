# Recorded Replay Guide Sync 上下文摘要

## 任务信息

- 任务名称：Recorded Replay Guide Sync
- 工作目录：`/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-residual-recorded-replay-guide`
- 分支：`codex/real-page-residual-recorded-replay-guide`
- 生命周期阶段：`S5 开发落地`
- 当前里程碑真源：`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`
- 等效路线锁说明：仓库当前无物理 `PROJECT_ROUTE_LOCK.md`；按项目 `AGENTS.md` 与既有 `.codex/operations-log.md` 约定，使用 `docs/superpowers/plans/2026-05-26-run-first-roadmap.md` 作为当前主线等效路线真源。

## 当前目标

在不触碰 runtime / studio 代码、且本轨只直写限定文档文件的前提下，同步 recorded replay 文档口径，使其与当前 runtime 测试和 smoke runner 保持一致：

1. `docs/guides/recorded-replay-matrix.md` 从旧的 `13` 条口径更新为当前真实口径。
2. 明确区分 `fixture` 与 `runtime-generated` 两类 case。
3. 补清 `placeholder-disambiguation` 与 `scroll-runtime-contract` 的职责说明。
4. 如有必要，最小同步 `docs/guides/fixture-matrix.md` 中与 recorded replay 相关的统计与名词。

## 写入边界

- 本轨直接写入：
  - `docs/guides/recorded-replay-matrix.md`
  - `docs/guides/fixture-matrix.md`（仅在 recorded replay 统计或命名口径不一致时做最小同步）
  - `.codex/context-summary-recorded-replay-guide-sync.md`
- 共享留痕文件：
  - `.codex/operations-log.md`
  - `.codex/verification-report.md`
  - 本轨不直接编辑；若需要记录验证结果，以协调侧统一吸收的共享留痕为准。
- 禁止修改：
  - runtime / studio / examples 源码
  - 其他任意仓库文件

## 已确认事实

### 真实口径来源

- `packages/runtime/src/recorded-replay-matrix.test.ts`
  - 断言 `caseCatalog` 总数为 `25`
  - 断言 `fixtureCases` 为 `23`
  - 断言 `runtimeOnlyCases` 为：
    - `placeholder-disambiguation`（4 步）
    - `scroll-runtime-contract`（5 步）
- `examples/recorded-replay-smoke.ts`
  - `RECORDED_REPLAY_CASE_ORDER` 固定为 `25` 条
  - `RECORDED_REPLAY_RUNTIME_ONLY_CASE_NAMES` 固定为上述 `2` 条
  - `getRecordedReplayCaseCatalog()` 会为 `fixture` case 附带 `fixtureFile: ${name}.html`
  - `printSummary()` 当前输出口径已按“真实 fixture 数 + 运行期临时页数”区分

### runtime-generated case 真实含义

- `placeholder-disambiguation`
  - 运行时生成一张临时 HTML 页面
  - 录制事件只持有宽选择器 `input[type='text']`
  - 依赖 `placeholder: "归档原因"` hint 命中正确输入框
- `scroll-runtime-contract`
  - 运行时生成一张临时 HTML 页面
  - 录制事件包含 `scroll` 动作，目标为 `(x=0, y=480)`
  - 用于验证 `RecordedEvent -> buildFlowFromEvents() -> executeFlow()` 链路中的滚动回放合同，而不是仓库 fixture 覆盖

### 文档现状差异

- `docs/guides/recorded-replay-matrix.md`
  - 仍写为 `13` 条 recorded replay 基线
  - 只提到 `placeholder-disambiguation`
  - 未说明 `23 fixture + 2 runtime-generated = 25` 的结构
- `docs/guides/fixture-matrix.md`
  - 仍写 recorded replay 为 `24` 条（`23 + 1`）
  - 总表中缺少 `scroll-runtime-contract`
  - 备注区和回归入口区也仍停留在 `24` 条旧口径

## 本轮最小可验收闭环

1. 两份文档对齐到 `25 = 23 fixture + 2 runtime-generated`。
2. `scroll-runtime-contract` 与 `placeholder-disambiguation` 均有明确说明。
3. 已执行以下命令并确认通过；共享验证结果由协调侧统一吸收到共享留痕，本轨不直接编辑共享日志文件：
   - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts`
   - `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages`

## 明确不做

- 不增删任何 recorded replay case
- 不修改 `examples/recorded-replay-smoke.ts`、runtime 测试或 fixture 文件
- 不扩大到 real-page 其他档位说明重写
- 不直接补写共享操作日志或验证报告
