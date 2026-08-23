# UX Foundation 4 上下文与验证摘要

## 任务定位

- 时间：2026-08-23（Asia/Shanghai）
- 分支：`codex/ux-foundation-4-safe-run`
- 生命周期：S5 开发落地 → S6 测试与问题处理 → S7 轨道验收
- 里程碑真源：`PROJECT_ROUTE_LOCK.md` 的 P2.5“非技术用户首次旅程闭环”
- 执行计划：`docs/exec-plans/active/ux-foundation-3-5-development.md` Track F4
- 阶段出口：运行前可理解影响，运行中可见安全进度并可取消；取消不能伪装为成功或失败。
- 最小可验收闭环：runtime `AbortSignal + progress` → Electron executionId 会话控制 → preload 受控订阅/取消 → knowledge 以 `cancelled` 保存 → Studio 共享状态/摘要可由集成层接入。
- 明确非目标：不改 `App.tsx`、`styles.css`、Web、Extension、路线锁、共享计划；不解冻 P3/P4；不引入新依赖。

## 研究与复用

- 复用 `packages/runtime/src/playwright-runner.ts` 现有逐步执行与 `finally` 资源关闭结构。
- 复用 `packages/project-knowledge` 已有 execution-level `cancelled` 状态；当前步骤取消在知识库映射为 `skipped`，避免改动数据契约。
- 复用 Studio `sensitive-variables.ts` 的 `secret_` 命名与 `[已隐藏]` 脱敏协议。
- 复用 Electron `ipcMain.handle` / preload `contextBridge` 模式，只新增固定频道，不向渲染进程暴露任意频道能力。
- CodeGraph 在当前工具上下文不可用；替代为 `rg` 调用链检索、现有测试模式核对和 TypeScript 类型门禁。
- RTK 可执行但未安装全局 hook，且其 pnpm filter 压缩器会忽略 filter；验证阶段改用原生 pnpm，保留完整退出码和输出。

## TDD 证据

先写红测并确认以下失败：

- runtime 未发送进度，Abort 后仍返回 `success`。
- knowledge `cancelled` 被 Studio 映射为 `failed`。
- 运行摘要/进度 reducer 文件不存在。
- Electron 没有 executionId 控制器、取消 IPC、进度转发和严格运行参数校验。
- preload 没有固定进度订阅、listener 清理和取消方法。
- IPC 原始运行异常会携带敏感变量值与堆栈行。

实现后对应测试全部转绿。

## 实现摘要

### Runtime

- `ExecutionStatus` / `StepLogStatus` 新增 `cancelled`。
- `ExecutionOptions` 新增 `signal` 与 `onProgress`。
- 进度事件包含 `started`、`step-started`、`step-finished`、`completed`、`failed`、`cancelled`。
- 事件只包含 executionId、步骤索引/ID/类型、计数与固定业务动作文案，不携带 variables、定位器、错误详情或堆栈。
- Abort 时立即触发幂等 session close；context/browser 或 persistent context/profile 清理仅执行一次。
- 当前没有独立 `waiting` 事件；wait 步骤通过 `currentAction: 正在等待页面就绪` 明确表达等待状态。

### Electron / preload / service

- 主进程为每次运行生成 executionId，并用 `Map<executionId, { controller, completion }>` 管理活动会话。
- 取消接口按 executionId 操作；重复取消返回 `alreadyCancelled: true`，不会重复 abort。
- 应用退出时阻止首次和重复退出，主动取消活动会话并等待各自 completion；所有 cancelled 保存与快照处理结束后再关闭本地 API，最后只触发一次真正退出。
- runFlow IPC 使用字段白名单、类型/数量/长度/有限数校验；拒绝嵌套变量和未知字段。
- 进度只发给发起运行的 webContents，且校验 runtime 事件 executionId 与主进程会话一致。
- preload 只暴露固定 `onExecutionProgress` / `cancelExecution`，订阅返回 cleanup 并精确移除包装 listener。
- service 将 cancelled execution 保存为知识库 `cancelled`，进行中步骤保存为 `skipped`，Studio execution 映射为 `cancelled`；首步前取消时用 runFlow 外层 startedAt 作为持久化 fallback。
- IPC 异常返回前移除 `secret_` 变量值、堆栈行并清空 Error.stack。

### Studio 共享模型

- 新增安全运行摘要：任务名、目标域名、环境、步骤数、高风险动作、是否需要确认。
- 高风险动作覆盖提交、删除、发送、保存；分类不读取 fill value 或 variables。
- 新增纯函数进度 reducer，按 executionId 隔离并映射 running/completed/failed/cancelled。
- 历史执行状态保留 knowledge `cancelled`，不再误映射为 failed。

## 验证结果

- `pnpm --filter @flowweave/runtime test`：通过，4 个文件、47 项测试。
- `pnpm --filter @flowweave/app-studio test`：通过，25 个文件、114 项测试。
- `pnpm --filter @flowweave/runtime typecheck`：通过。
- `pnpm --filter @flowweave/runtime lint`：通过。
- `pnpm --filter @flowweave/runtime build`：通过。
- `pnpm --filter @flowweave/app-studio typecheck`：通过。
- `pnpm --filter @flowweave/app-studio lint`：通过。
- `pnpm --filter @flowweave/app-studio build`：通过，Electron bundle 严格签名校验通过，native binding 就绪，Vite 生产构建通过。
- `git diff --check`：通过。
- 变更 diff 敏感信息扫描：只命中测试假值 `secret_password`，未发现真实凭据。
- 数值覆盖率：仓库未安装 `@vitest/coverage-*` provider；为避免越界新增依赖，本轨以 runtime/Studio 全套测试和新增正常/取消/资源/IPC/脱敏/摘要/状态合同替代，未声称数值覆盖率。

## 安全审查与残余风险

- `pnpm audit --prod` 使用项目 npmmirror 时因其没有 audit endpoint 失败；指定 npm 官方 registry 后成功执行。
- 审计发现既有 `drizzle-orm@0.38.4` 命中高危公告 GHSA-gpj5-g38j-94v9（动态 SQL identifier 转义）。本轨未修改依赖；只读检索未发现 `sql.identifier` / `sql.raw` 动态标识符使用。升级到 `>=0.45.2` 涉及 knowledge 数据层兼容验证，应进入独立变更，不在 F4 中暗改锁文件。
- `apps/studio/src/studio-client.ts` 的 HTTP fallback 私有状态映射仍会把 `cancelled` 归入 failed，且浏览器 fallback 不支持运行/取消。本轨按文件边界未修改；集成代理接入 `App.tsx` 时应同步将 HTTP 历史映射改为 cancelled，并在 Electron 能力缺失时隐藏取消入口。
- 主界面接线与真实 Electron 点击旅程由集成轨完成；本轨交付的是已测试的 runtime/Electron/preload/shared 合同。

## 独立 Reviewer P1 修复闭环

- Reviewer P1-1 红测：模拟 signal 在首步前取消，runtime 返回 `steps: []`；确认原实现传给 `apiSaveExecution` 的 startedAt 为 undefined，重新回读会退化到 1970。
- P1-1 绿测：`toKnowledgeExecution` 接受 runFlow 捕获的 outer startedAt fallback；断言 cancelled 零日志执行落库时间与 Studio 返回一致，重置 service 模块后经 `apiGetExecution` 回读仍为真实时间且状态保持 cancelled。
- Reviewer P1-2 红测：deferred runFlow 未 resolve 时触发 before-quit；确认原实现不会 preventDefault，也会提前关闭 API，且没有最终受控 quit。
- P1-2 绿测：活动运行记录 controller 与 completion；before-quit 防重入地 abort 并 await completion，runFlow resolve 前 API close/app.quit 均不发生，resolve 后严格按“完成运行 → 关闭 API → 最终 quit”执行一次。
- 补充边界：无活跃运行同样通过一次协调关闭后正常退出；最终 quit 的 before-quit 不再 preventDefault，避免死循环；shutdown 开始后拒绝新 runFlow，避免漏出 drain 快照。

## 轨道结论

- 技术评分：94/100。
- 战略评分：96/100。
- 综合评分：95/100。
- 建议：F4 轨道通过，可提交并交由集成代理审查接线；P3/P4 继续冻结。
