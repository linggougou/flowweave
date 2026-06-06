# 项目上下文摘要（Recorder Placeholder Contract）

生成时间：2026-06-06 21:21:57 CST

## 1. 相似实现分析

- **实现1**：`apps/extension/entrypoints/content.ts`
  - 模式：content script 在 DOM 事件侧收集录制 payload，再通过 `sendEvent()` 发送 `RecordedEvent`
  - 可复用：`readUploadFiles()`、`normalizeUploadTokenPart()`、`buildUploadReplayInputs()`
  - 需注意：当前 upload token 仅由 `name/id/aria-label` 归一化得出，多个 file input 很容易在同页或同组件内碰撞
- **实现2**：`packages/shared/src/recording-protocol.ts`
  - 模式：以 `recordedEventSchema` 作为录制合同入口，使用 `superRefine()` 对 `inputType=file` 做 upload 专项校验
  - 可复用：`isReplayableUploadInput()`、`parseRecordedEvent()`
  - 需注意：这里已经把 upload 限定为“变量占位符或真实路径”，但仍在本地保留一套占位符判断规则
- **实现3**：`packages/recorder/src/normalize.ts`
  - 模式：先把 `RecordedEvent` 归一化为 `NormalizedStep`，再由 `buildFlowFromEvents()` 导出 Flow
  - 可复用：`normalizeFill()`、`readStringArray()`、`buildFlowVariables()`
  - 需注意：upload 在 `normalizeFill()` 中会被转成 `upload` 步骤，但当前只保留 `files`，`fileNames` 等录制元信息会在归一化时丢失
- **实现4**：`packages/shared/src/template-variables.ts`
  - 模式：共享占位符协议已经存在，支持提取变量名、整值占位符识别与插值
  - 可复用：`extractTemplateVariables()`、`getSingleTemplateVariableName()`
  - 需注意：recorder 和 recording-protocol 还没有完全复用这份事实来源

## 2. 项目约定

- **命名约定**：TypeScript 严格模式；函数、变量使用英文；注释、文档与测试描述使用简体中文
- **文件组织**：monorepo；`apps/*` 只依赖 `packages/*`，录制协议放在 `packages/shared`，录制归一化放在 `packages/recorder`
- **导入顺序**：先外部包，再内部相对路径；类型导入与值导入保持现有风格
- **代码风格**：优先小函数、显式类型、早返回；测试使用 `describe/it/expect` 的 Vitest 风格

## 3. 可复用组件清单

- `packages/shared/src/template-variables.ts`：共享占位符提取与单值识别
- `packages/shared/src/recording-protocol.ts`：`RecordedEvent` 校验与 upload 输入合法性约束
- `packages/recorder/src/normalize.ts`：事件归一化与 Flow 变量提取
- `apps/extension/entrypoints/content.ts`：扩展侧 upload payload 生成入口

## 4. 测试策略

- **测试框架**：Vitest
- **测试模式**：以 `packages/recorder/src/normalize.test.ts` 为主的单元/合同回归测试
- **参考文件**：
  - `packages/recorder/src/normalize.test.ts`
  - `packages/shared/src/template-variables.test.ts`
  - `packages/page-intelligence/src/fragility.test.ts`
- **覆盖要求**：
  - upload token 冲突防御
  - `fileNames` 与 upload payload 保真
  - `{{...}}` 字面量与真实变量占位符边界
  - 录制事件到 Flow 变量声明的回归

## 5. 依赖和集成点

- **外部依赖**：`zod` 用于协议校验；`vitest` 用于测试
- **内部依赖**：
  - `apps/extension` 依赖 `@flowweave/recorder` 的 payload 构建能力
  - `packages/recorder` 依赖 `@flowweave/shared` 的协议与错误类型
- **集成方式**：扩展发送 `RecordedEvent` → `parseRecordedEvent()` 校验 → `normalizeRecordedEvent()` 转为 `NormalizedStep` → `buildFlowFromEvents()` 导出 Flow
- **配置来源**：本次验证命令统一固定为 Node 20 路径前缀

## 6. 技术选型理由

- **为什么用共享占位符协议**：Foundation 已把 fragility 切到 `packages/shared/src/template-variables.ts`，这条轨道继续复用能避免 recorder / runtime / protocol 再次分叉
- **优势**：减少手写正则漂移，边界行为能通过 shared 测试与 recorder 回归共同锁定
- **劣势和风险**：本轨道受限于独占写入范围，不能同步修改 runtime 或 DSL 类型；如果需要跨轨道类型调整，必须保持向前兼容或通过现有可扩展字段承载

## 7. 关键风险点

- **并发问题**：`content.ts`、`recording-protocol.ts`、`normalize.ts` 都围绕同一 upload 合同，串行更安全；并行子任务容易在 token 规则和归一化字段上互相覆盖
- **边界条件**：
  - 多个相同 `name/id/aria-label` 的 file input 触发 upload token 碰撞
  - `{{...}}` 字面量若不是单值变量，不应被误判为 upload 回放输入
  - `fileNames`、`nameAttr` 等元信息需要在 normalize 后仍可用于后续诊断或导出
- **性能瓶颈**：本次均为轻量字符串处理，主要风险不是性能而是合同漂移
- **安全考虑**：按项目约束，不引入新的安全逻辑；仅确保不会把裸文件名误当成真实上传路径

## 8. 工具与替代流程

- `desktop-commander`：当前环境不可用，改用 `codegraph_*`、`rg`、`sed` 与本地命令完成结构分析和文件检索
- `context7`：当前环境不可用，本次优先使用仓库内设计文档与共享协议源码作为事实来源
- `github.search_code`：当前环境不可用，本次不依赖外部开源实现，改用仓库内相似实现与既有测试模式

## 9. 充分性检查

- ✅ 我能说出至少 3 个相似实现路径：
  - `apps/extension/entrypoints/content.ts`
  - `packages/shared/src/recording-protocol.ts`
  - `packages/recorder/src/normalize.ts`
  - `packages/shared/src/template-variables.ts`
- ✅ 我理解实现模式：
  - upload 在 extension 侧生成 payload，在 shared 侧做事件校验，在 recorder 侧归一化成 upload 步骤并提取变量
- ✅ 我知道可复用组件：
  - `getSingleTemplateVariableName()`、`parseRecordedEvent()`、`buildFlowVariables()`
- ✅ 我理解命名与代码风格：
  - 英文标识符 + 中文测试描述，早返回与小函数风格
- ✅ 我知道如何测试：
  - 以 `packages/recorder/src/normalize.test.ts` 为主写红灯用例，再用 Node 20 执行 `pnpm --filter @flowweave/recorder test`
- ✅ 我确认没有重复造轮子：
  - upload 与模板变量相关逻辑已经存在 shared 基线，不能再新增第三套正则
- ✅ 我理解依赖与集成点：
  - 关键链路是 `content.ts -> recording-protocol.ts -> normalize.ts -> Flow variables`
