# 真实页面稳定性 Wave 9：异步 Suggest / Active-Descendant 键盘稳定性设计

生成时间：2026-06-07 03:54:29 CST

## 1. 背景

Wave 8 已经把“同步命令面板上的 `fill -> ArrowDown -> Enter`”纳入主线：

1. 扩展只在导航型目标上录制 `ArrowDown / ArrowUp`。
2. recorded replay baseline 已扩到 `12` 条。
3. `keyboard-command-palette` 已证明同步命令面板的键盘闭环可用。

但这还不是用户真实环境里最容易出问题的那一段。当前最大的剩余风险在于：

- 真实后台常见的是“输入后 debounce / 异步加载 suggestions，再用 `ArrowDown` 选中候选，最后 `Enter` 确认”。
- recorder 现在不会把 `ArrowDown / ArrowUp` 视为自动 wait 触发器。
- runtime `press` 后只做通用 `waitForPageSettled()`，并不会专门观察：
  - `aria-activedescendant`
  - `aria-controls` 指向的 listbox / popup
  - active option 是否真正变得可见
- `keyboard-command-palette` 当前是同步过滤，没法暴露这些时序问题。

所以 Wave 9 的目标，不再是“让方向键能录下来”，而是“让异步 suggest 场景在 replay 时也能稳定地等到正确时机”。

## 2. 目标

1. 让 FlowWeave 能稳定回放“输入 -> 异步 suggestions 准备 -> `ArrowDown` / `ArrowUp` -> `Enter`”这类真实页面常见流程。
2. 在不新增 recorded event 类型的前提下，继续复用 `keypress -> press` 这条既有链路。
3. 优先通过 runtime 对实时 DOM 状态的观察补 ready 等待，而不是把录制时延迟硬编码进 Flow。
4. 收紧扩展导航目标判定，减少非 suggest 输入框误录方向键的噪声。
5. 把异步 suggest 场景同步纳入：
   - runtime 测试
   - recorded replay smoke
   - real-pages smoke

## 3. 非目标

本轮明确不做：

1. 新增 `keydown` / `keyup` / `hotkey` 等新的 recorded protocol 事件类型。
2. 为所有 `press`、所有 `fill` 步骤引入统一的强等待。
3. 通用 AI 自愈选择器或模糊 DOM diff。
4. 富文本编辑、快捷键系统或完整的输入法建模。
5. 远端真实站点 smoke 或云端依赖。

## 4. 方案对比

### 方案 A：只新增异步 fixture，不改 runtime 等待

- 做法：
  - 新建异步 suggest fixture。
  - 通过显式 `wait` 手写流程勉强把 smoke 跑通。
- 优点：
  - 改动最小。
- 缺点：
  - 无法提升 recorded replay 的真实稳定性。
  - 只是在 fixture 里回避问题，不是解决问题。

### 方案 B：runtime 增加窄范围的 suggest-ready 等待，fixture 与 smoke 同步补回归

- 做法：
  - 扩展层只收紧导航目标判定。
  - runtime 在目标是 suggest / combobox 时，按步骤类型做短路等待：
    - `fill` 后 best-effort 等待 suggestions ready
    - `ArrowDown / ArrowUp` 后等待 `aria-activedescendant` 或 active option 生效
  - 新增异步 command palette fixture，并纳入 recorded replay / real-pages matrix。
- 优点：
  - 改动最小但用户价值最高。
  - 不污染 DSL，也不把录制时延迟编码成固定毫秒。
  - 能直接改善 recorded replay 的真实成功率。
- 缺点：
  - 需要仔细控制触发条件，避免拖慢普通输入场景。

### 方案 C：recorder 自动为 `fill -> ArrowDown` 插入 `ms wait`

- 做法：
  - 根据录制事件时间差，为 suggest 输入自动插入一个 `wait ms`。
- 优点：
  - 实现表面上简单。
- 缺点：
  - 把录制时延迟固化到 Flow，脆弱且不可移植。
  - DSL 只能表达时间，不理解真正的 ready 语义。

## 5. 推荐结论

采用**方案 B**。

核心原因：

1. 问题的根因是 replay 时机与 ready 条件不足，而不是协议表达力不够。
2. runtime 能直接利用页面实时 DOM 观测 `aria-controls`、`aria-activedescendant`、listbox visibility，这比 recorder 插时间等待更可靠。
3. 只要把触发范围控制在 suggest / combobox 场景，就不会给普通 `fill` / `press` 带来大面积回归。

## 6. 详细设计

### 6.1 扩展录制层：收紧导航目标判定

文件：

- `apps/extension/entrypoints/content.ts`
- `apps/extension/lib/content-contract.test.ts`

设计：

1. 保留 Wave 8 的总体策略：
   - `Enter / Tab / Escape` 继续全局录制。
   - `ArrowDown / ArrowUp` 只在导航型目标上录制。
2. 收紧 `isKeyboardNavigationTarget()` 判定：
   - `role="combobox"` 继续允许。
   - `aria-autocomplete` 只有不是 `"none"` 时才算 suggest 信号。
   - 仅有 `aria-controls` 但没有 suggest / combobox 语义的输入框，不应自动放开方向键。
3. 继续保持：
   - `ArrowDown / ArrowUp` 不会触发 pending fill 提前 flush。

### 6.2 runtime：补 suggest-ready 与 active-descendant 窄等待

文件：

- `packages/runtime/src/playwright-runner.ts`
- `packages/runtime/src/playwright-runner.test.ts`

设计：

1. 新增小范围 helper，用来识别“当前 target 是否像 suggest / combobox”：
   - 读取目标元素的：
     - `role`
     - `aria-autocomplete`
     - `aria-controls`
     - `aria-expanded`
2. 对 `fill` 步骤：
   - 仅当目标像 suggest / combobox 时，做一次 **best-effort** 的短等待。
   - 等待目标不是“页面完全稳定”，而是以下任一 ready 信号：
     - `aria-controls` 指向的 popup / listbox 出现可见 option
     - 目标或其关联容器的 `aria-busy` / `data-loading` 清空
     - `aria-expanded="true"` 且候选项至少 1 个可见
   - 若在短超时内没有出现这些信号，不抛错，只继续执行，避免误伤“只有按方向键才打开列表”的页面。
3. 对 `press` 步骤：
   - 只有当按键是 `ArrowDown` / `ArrowUp` 且目标像 suggest / combobox 时，才执行专门等待。
   - 优先等待：
     - 目标元素的 `aria-activedescendant` 变为非空，并且对应候选可见
   - 若页面没有 `aria-activedescendant`，则退化为：
     - listbox 中存在 `data-active` / `aria-selected="true"` / `.is-active` 一类可见当前项
     - 或候选列表至少已有可见项，随后交由下一个 `Enter` 再消费
4. 通用 `waitForPageSettled()` 保留，不替换；新增 helper 只是补 suggest 场景的窄等待。

### 6.3 recorder：锁定“不在这一轮扩协议”

文件：

- `packages/recorder/src/normalize.test.ts`

设计：

1. 本轮不改 recorder 生产逻辑。
2. 只补测试证明：
   - `ArrowDown / ArrowUp` 仍归一化成普通 `press`。
   - 不因为 Wave 9 引入额外的 recorder 自动 wait 推断。
3. 这样可以明确本轮责任边界：
   - 录制协议继续简洁
   - replay 稳定性交给 runtime 的 DOM-aware 等待完成

### 6.4 Benchmarks：新增异步 command palette fixture

文件：

- `examples/fixtures/async-command-palette.html`
- `examples/recorded-replay-smoke.ts`
- `packages/runtime/src/recorded-replay-matrix.test.ts`
- `examples/real-page-smoke.ts`
- `packages/runtime/src/real-page-matrix.test.ts`
- `docs/guides/recorded-replay-matrix.md`
- `docs/guides/fixture-matrix.md`

设计：

1. 新增一个更贴近真实后台的 fixture：
   - 输入关键字后进入 debounce
   - shell / popup 暂时进入 `data-loading="true"` 或 `aria-busy="true"`
   - suggestions 异步刷新完成后，才真正挂载/显示候选列表
   - `ArrowDown` 之后设置 `aria-activedescendant`
   - `Enter` 根据当前 active option 执行命令
2. 录制回放基线新增同名 case：
   - `recorded replay` 基线预计从 `12` 提升到 `13`
3. `real-pages` 手写矩阵新增同名 case：
   - `e2e:real-pages` 预计从 `20` 提升到 `21`
4. 文档与矩阵测试同步更新，避免继续保留 Wave 8 之后的计数漂移。

## 7. 验收方式

统一使用 Node `20.19.6`：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-extension test -- content-contract.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/recorder test -- normalize.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- playwright-runner.test.ts recorded-replay-matrix.test.ts real-page-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:real-pages
```

## 8. 风险与补救

### 风险 1：等待范围过宽，拖慢普通输入

- 补救：
  - 只在 suggest / combobox 特征命中时触发。
  - 使用短超时 + best-effort，不把所有 `fill` / `press` 都强绑到新等待。

### 风险 2：fixture 太理想化，继续掩盖真实时序问题

- 补救：
  - fixture 必须同时包含 debounce、loading、异步候选挂载、`aria-activedescendant` 更新、最终命令结果 ready。

### 风险 3：录制噪声继续放大

- 补救：
  - 先收紧 `isKeyboardNavigationTarget()` 的负样本边界，再扩异步 suggest 场景。

### 风险 4：矩阵文档与计数继续漂移

- 补救：
  - 本轮把 `recorded-replay-matrix.md`、`fixture-matrix.md`、`real-page-matrix.test.ts` 一起对齐。

## 9. 审批说明

按 `brainstorming` 标准流程，这一步本应等待用户逐段确认后再实现；但当前会话已获得“自主规划任务、持续开发、无需指示”的明确授权，因此本轮将以该授权视作设计审批，通过落盘 spec + plan + `.codex` 留痕继续执行。
