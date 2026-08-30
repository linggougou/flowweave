# 结论

**PASS（100/100）**。候选 `66b3e84` 已满足 G1B 对 Studio 旧入口 guard 的要求：`runFlow` 在 `resolveFlowForRun(...)` 之后、但在 `run directory`、环境保存、Chromium、Runtime、progress、execution/page snapshot 之前拒绝所有非 v1 schema；`schemaVersion` 的对象/数组/字符串/缺失输入也不会把原始 payload 泄漏进错误 `details`。fresh `app-studio test`、全仓 `test`、`typecheck`、`lint`、`build` 均通过。

# 为什么

- 净 diff 很克制：`fff2c89..66b3e84` 只改了 `apps/studio/electron/services.ts` 和 `apps/studio/electron/services.test.ts`，`git diff --check` 也没有发现格式化噪音或大文件 churn。
- guard 位置正确：`apps/studio/electron/services.ts:662-669` 在 `resolveFlowForRun` 后立刻调用 `assertStudioRunSchemaVersion(...)`，而 `apiAllocateRunDirectory`、`resolveRunEnvironment`/`saveEnvironment`、`ensureStorageStatePathExists` 都在它之后；`isChromiumInstalled`、`executeFlow`、`apiSaveExecution`、`apiSavePageSnapshot` 更晚。
- 安全诊断闭合：`apps/studio/electron/services.ts:626-631` 把 `receivedVersion` 归一化为 `number | "missing" | "invalid"`，不再把任意对象原样塞进 `FlowWeaveError.details`。
- 测试是真实的：`apps/studio/electron/services.test.ts:361-408` 新增参数化用例，覆盖 `v2 / 对象 / 数组 / 字符串 / 缺失` 五类输入，并逐项断言 `apiAllocateRunDirectory`、`isChromiumInstalled`、`executeFlow`、`onProgress`、`apiSaveExecution`、`apiSavePageSnapshot`、`saveEnvironment` 全部未触发，同时验证错误序列化不含 `studio-schema-canary` 或 `private-token`。
- v1 回归保持不变：fresh `pnpm --filter @flowweave/app-studio test` 通过 `40 files / 214 tests`；fresh `pnpm test` 全仓 `21/21 successful`；fresh `pnpm typecheck`、`pnpm lint`、`pnpm build` 也都通过。

# 必须修改

无。

# 证据

- reviewed SHA：`66b3e84fc9486fc2930dda324163a0794a153509`
- 基线与净 diff：
  - `baseline parent`: `fff2c89`
  - `git diff --stat fff2c89..66b3e84`：仅 2 个文件、`77 insertions / 2 deletions`
  - `git diff --check fff2c89..66b3e84`：通过
- 关键源码定位：
  - `apps/studio/electron/services.ts:621-640`
  - `apps/studio/electron/services.ts:662-695`
  - `apps/studio/electron/services.ts:167-197`
  - `apps/studio/electron/services.test.ts:361-408`
- fresh 验证：
  - `pnpm --filter @flowweave/app-studio test`：`40 files / 214 tests passed`
  - `pnpm test`：`21/21 successful`
  - `pnpm typecheck`：`21/21 successful`
  - `pnpm lint`：`13/13 successful`
  - `pnpm build`：`13/13 successful`
- 验证备注：
  - 首轮把 `pnpm --filter @flowweave/app-studio test` 与 `pnpm test` 并行启动时，二者会互相踩到 `apps/studio/electron/flow-portability-files.test.ts` 共用的 `.tmp-g5-file-tests` 临时目录，出现 `ENOENT`。
  - 我随后单独运行 `pnpm exec vitest run electron/flow-portability-files.test.ts` 得到 `14 tests passed`，再串行重跑 Studio 定向测试与全仓测试均全绿，因此该现象判定为既有测试隔离问题，不属于本候选回归。
