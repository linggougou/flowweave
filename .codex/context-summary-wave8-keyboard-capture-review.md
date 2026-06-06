## 项目上下文摘要（wave8-keyboard-capture-review）

生成时间：2026-06-07 03:28:15 CST

### 1. 相似实现分析

- **实现1**: `apps/extension/entrypoints/content.ts:147`
  - 模式：`buildRecordedPressKey` 统一做键盘录制白名单判定，先过滤组合键、重复输入和 IME 组合输入，再决定是否录成 `keypress`
  - 可复用：`normalizePressKey`、`isSubmitLikePressKey`
  - 需注意：`recordPress` 只会对“提交型”按键触发 `flushPendingFill`
- **实现2**: `apps/extension/entrypoints/content.ts:190`
  - 模式：`pendingFillElement + timer` 双状态去抖，`flushPendingFill(target)` 通过目标比对避免跨元素误 flush
  - 可复用：`resolveFillTarget`、`flushPendingFill`、`schedulePendingFill`
  - 需注意：`change` / `blur` 与 `keypress` 共用同一套 flush 入口
- **实现3**: `packages/recorder/src/normalize.ts:427`
  - 模式：下游 `keypress -> press` 归一化继续把 `Enter / Tab / Escape / Ctrl|Meta+S` 视为提交型触发器
  - 可复用：`isSubmitLikePressKey`
  - 需注意：本轮扩展侧若改变提交型键集合，会直接影响 wait 推断与 replay 语义

### 2. 项目约定

- **命名约定**: 录制层使用 `record*`、`resolve*`、`is*` 前缀表达职责
- **文件组织**: content script 主逻辑放 `apps/extension/entrypoints/content.ts`，合同测试放 `apps/extension/lib/*.test.ts`
- **代码风格**: TypeScript strict，早返回，局部常量大写集合名，测试描述用简体中文

### 3. 可复用组件清单

- `apps/extension/entrypoints/content.ts`: `isSubmitLikePressKey`、`flushPendingFill`、`resolveFillTarget`
- `packages/recorder/src/normalize.ts`: `isSubmitLikePressKey` 的下游消费语义
- `packages/recorder/src/target-from-dom.ts`: `shouldRecordFill`、`resolveClickTarget`、`buildInteractionPayload`

### 4. 测试策略

- **测试框架**: Vitest
- **参考文件**:
  - `apps/extension/lib/content-contract.test.ts`
  - `packages/recorder/src/normalize.test.ts`
- **本次验证**:
  - `pnpm --filter @flowweave/app-extension test -- content-contract.test.ts`
  - 结果：通过，`7/7`

### 5. 依赖和集成点

- **扩展侧输入链路**: `input/change/blur/keydown` 事件监听
- **录制依赖**: `@flowweave/recorder` 的 `shouldRecordFill`、`resolveClickTarget`、`buildInteractionPayload`
- **回放下游**: `packages/recorder/src/normalize.ts` 把 `keypress` 归一化成 `press`

### 6. 技术选型理由

- **为什么用当前方案**: 保持既有 `keypress -> press` 协议不变，只在 content script 层补充导航目标判定，改动最小
- **优势**: 不引入新事件类型，也不改 runtime replay 协议
- **劣势和风险**: `aria-*` 属性启发式天然偏宽，容易依赖合同测试持续锁边界

### 7. 关键风险点

- **误录制风险**: `aria-controls` / `aria-autocomplete` 是宽启发式，未来可能覆盖非 suggest 控件
- **覆盖风险**: 当前合同测试没有反例锁定 `aria-controls` 非 suggest 场景
- **集成风险**: 本轨只验证 capture 合同，不直接证明真实页面 replay 闭环
