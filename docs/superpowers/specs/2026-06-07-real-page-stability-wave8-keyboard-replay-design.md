# 真实页面稳定性 Wave 8：键盘驱动录制回放补齐设计

生成时间：2026-06-07 04:02:00 CST

## 1. 背景

Wave 7 已把 recorded replay 的高价值场景覆盖从 `7` 条扩到 `11` 条，也补齐了扩展 background 导出合同。但它主要解决的是“已有 recorded event 能否稳定回放”的证明问题，还没有继续缩小“真实用户实际录制时，哪些交互根本录不出来或录得不够好”的差距。

当前最明显的缺口在键盘驱动交互：

- 扩展内容脚本虽然在 `keydown` 上监听按键，但无修饰键只录 `Enter / Tab / Escape`。
- 真实页面里常见的命令面板、suggest 输入、组合框筛选，往往依赖 `ArrowDown / ArrowUp + Enter` 完成选择。
- runtime 已经能执行通用 `press` step，但 recorded replay 缺少真实页面风格的键盘导航场景。

## 2. 目标

1. 让扩展能够稳定录制“方向键选择 + Enter 确认”这一类真实页面常见键盘导航。
2. 在不新增 recorded protocol 事件类型的前提下，继续复用 `keypress -> press` 这条既有链路。
3. 用 recorded replay 与 smoke baseline 证明该能力已经进入主线，而不是停留在局部单测。

## 3. 非目标

本轮明确不做：

1. 新增 `keydown` / `keyup` / `hotkey` 等新的 recorded event 类型。
2. 录制所有按键，包含光标移动、文本编辑级别的细粒度键位。
3. 做完整的富文本编辑快捷键建模。
4. 在 Studio 中新增专门的键盘回放配置 UI。

## 4. 方案对比

### 方案 A：只扩大 `PRESS_KEYS` 白名单

- 做法：直接把 `ArrowDown / ArrowUp / Home / End / PageUp / PageDown` 全部加入 `PRESS_KEYS`。
- 优点：实现最快。
- 缺点：容易把普通输入框中的光标移动也录进去，噪声风险高。

### 方案 B：在现有 `press` 模型上，按场景条件放开方向键录制

- 做法：
  - recorded event 仍然用 `keypress`。
  - 只在“可推断为组合框 / suggest / 命令面板”的目标上录 `ArrowDown / ArrowUp`。
  - 通过新 fixture 证明 `ArrowDown -> Enter` 的 recorded replay 闭环。
- 优点：最小改动、最贴近真实用户价值、对噪声有控制。
- 缺点：不会一次性覆盖所有键盘交互。

### 方案 C：把组合框导航直接语义化为 `select` 或 `click`

- 做法：在 recorder 层根据后续 DOM 变化，把方向键选择折叠成 `select` 或目标项 `click`。
- 优点：理论上流程更“业务语义化”。
- 缺点：实现复杂度高，容易引入大量场景特判，不适合当前阶段。

## 5. 推荐结论

采用**方案 B**。

也就是：

1. 保持 recorded protocol 不变，继续使用 `keypress -> press`。
2. 在扩展层新增“键盘导航型目标”的轻量判定，只为高价值场景放开 `ArrowDown / ArrowUp`。
3. 新增一个真实页面风格的键盘命令面板 fixture，把 recorded replay、recorded smoke、real-pages smoke 一起补齐。

## 6. 详细设计

### 6.1 扩展录制层

文件：

- `apps/extension/entrypoints/content.ts`
- `apps/extension/lib/content-contract.test.ts`

设计：

1. 新增“键盘导航目标”判定 helper。
2. `Enter / Tab / Escape` 继续保持全局录制。
3. `ArrowDown / ArrowUp` 只在以下目标上录制：
   - `role="combobox"`
   - 带 `aria-autocomplete`
   - 带 `aria-controls`
   - 原生 `select`
   - 或位于上述容器中的输入框
4. `ArrowDown / ArrowUp` 不能触发 pending fill 的提前 flush；仍由 `Enter / Tab / Escape` 负责提交型收口。

### 6.2 recorder 与协议层

文件：

- `packages/shared/src/recording-protocol.ts`
- `packages/recorder/src/normalize.ts`
- `packages/recorder/src/normalize.test.ts`

设计：

1. 本轮不新增新事件类型。
2. `payload.key` 继续承载标准化后的按键名，如 `ArrowDown`、`ArrowUp`、`Enter`。
3. recorder 归一化层只需补测试，证明新增方向键 recorded event 仍会稳定产出 `press` step，并在需要时保留既有自动 wait 推断行为。
4. 如果现有 recorder 测试已经足够证明生产逻辑，则不改生产代码。

### 6.3 runtime 与回归矩阵

文件：

- `examples/fixtures/keyboard-command-palette.html`
- `packages/runtime/src/playwright-runner.test.ts`
- `examples/recorded-replay-smoke.ts`
- `packages/runtime/src/recorded-replay-matrix.test.ts`
- `examples/real-page-smoke.ts`
- `docs/guides/recorded-replay-matrix.md`

设计：

1. 新增一个本地 fixture，模拟真实业务里“输入关键词 -> ArrowDown 选择结果 -> Enter 确认打开”的命令面板流程。
2. runtime 单测新增 recorded replay 用例，强制走：
   - `parseRecordedEvent()`
   - `buildFlowFromEvents()`
   - `executeFlow()`
3. recorded replay smoke baseline 新增 `keyboard-command-palette`。
4. hand-written `e2e:real-pages` 也新增同名场景，确保真实页面总矩阵不落下这类键盘导航交互。

### 6.4 验收方式

统一使用 Node `20.19.6`：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

## 7. 风险与补救

### 风险 1：方向键录制噪声过大

- 补救：先只放开 `ArrowDown / ArrowUp`，且限定在组合框 / suggest / 命令面板类目标上。

### 风险 2：fixture 过于理想化

- 补救：fixture 必须具备异步结果刷新、`aria-expanded`、高亮候选与 Enter 确认后的真实页面反馈，不做静态假按钮。

### 风险 3：recorded replay 与 real-pages 覆盖脱节

- 补救：同一场景同时进入 runtime recorded replay 单测、recorded smoke baseline 与 real-pages smoke。

## 8. 审批说明

按 `brainstorming` 标准流程，这一步本应等待用户逐段确认后再实现；但当前会话已获得“自主规划任务、持续开发、无需指示”的明确授权，因此本轮将以该授权视作设计审批，通过落盘 spec + plan + `.codex` 留痕继续执行。
