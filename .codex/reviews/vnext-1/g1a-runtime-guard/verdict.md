# 结论

**REVISE（89/100）**。候选 `093e92eab33c0dd9904b5005e9f8aea1ba1a9918` 已满足 G1A-C 的核心目标：`executeFlow()` 会在 `mkdir`、progress、HAR/Chromium 之前拒绝非 v1 schema，且 fresh `runtime` 回归全绿；但当前 `FLOW_SCHEMA_MISMATCH` 仍会把 raw/cast 输入里的任意 `schemaVersion` 对象原样挂进 `error.details`，因此不能给 PASS。

# 为什么

- Runtime guard 的放置顺序是对的：`packages/runtime/src/playwright-runner.ts:2233-2243` 在任何运行副作用前先比较 schema version，再抛 `FLOW_SCHEMA_MISMATCH`。
- 新增测试对“副作用前拒绝”这件事本身是有效的：`packages/runtime/src/playwright-launch-options.test.ts:71-99` 明确断言了 `artifactDir` 不存在、`onProgress` 未触发、Chromium 未启动。
- v1 回归没有被打坏：fresh `pnpm typecheck` 通过，fresh `pnpm --filter @flowweave/runtime test` 通过 `48/48`，其中包含 `playwright-runner`、`real-page matrix`、`recorded-replay matrix`。
- 主要问题在错误边界：`packages/runtime/src/playwright-runner.ts:2233-2241` 把 `schemaVersion` 的 `unknown` 值直接塞进 `details.receivedVersion`，而 `packages/shared/src/errors.ts:8-16` 会原样保存该 `details`。我用畸形输入实测后拿到 `sameObject=true`，`detailsJson` 里完整保留了嵌套 `secret/token` 对象。
- 这不是当前 Studio UI 的直接泄漏复现，因为 `apps/studio/electron/main.ts:273-292` 目前只向 renderer 返回裁剪后的 message；但错误对象本身已经不再 fail-closed，后续只要有日志、API 或调试通道复用 `details`，就可能把任意对象带出去。

# 必须修改

- 规范化 `FLOW_SCHEMA_MISMATCH.details.receivedVersion`，只保留安全的原始诊断值；不要把原始对象、数组或任意引用直接挂到 `details`。
- 补一个 raw/cast 异常输入回归测试，覆盖 object/array/missing `schemaVersion`，并断言依然是在 `mkdir`、progress、HAR/Chromium 前拒绝，且错误 details 已脱敏/规范化。

# 证据

- diff：`37cf7179ce156309c2c57063662b20d53a4fbc1f..093e92eab33c0dd9904b5005e9f8aea1ba1a9918` 只改了 `packages/runtime/src/playwright-runner.ts` 与 `packages/runtime/src/playwright-launch-options.test.ts`
- fresh 验证：
  - `pnpm typecheck`：`21/21 successful`
  - `pnpm --filter @flowweave/runtime test`：`4 files / 48 tests passed`
- 关键代码：
  - `packages/runtime/src/playwright-runner.ts:2233-2243`
  - `packages/runtime/src/playwright-launch-options.test.ts:71-99`
  - `packages/shared/src/errors.ts:8-16`
  - `apps/studio/electron/main.ts:273-292`
- 畸形输入 probe：
  - `name FlowWeaveError`
  - `code FLOW_SCHEMA_MISMATCH`
  - `sameObject true`
  - `detailsJson {"expectedVersion":1,"receivedVersion":{"secret":"top-secret","nested":{"token":"abc"}}}`
