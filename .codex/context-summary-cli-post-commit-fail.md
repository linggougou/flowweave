## 项目上下文摘要（提交后 CLI 不通过排查）

生成时间：2026-06-08 10:05:00 CST

### 1. 相似实现分析

- **实现 1**: `.github/workflows/ci.yml`
  - 模式：CI 在 `Node 20 / 24` 双矩阵下统一执行 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm smoke`。
  - 可复用：本地复现顺序应尽量贴近 CI。
  - 需注意：不能只看 Node 20；Node 24 也属于真实验收面。
- **实现 2**: `package.json`
  - 模式：根脚本统一由 `turbo` 驱动 `lint / typecheck / test / build`。
  - 可复用：优先用 `pnpm lint` 与 `pnpm smoke` 做仓库级复现。
  - 需注意：`smoke` 会串起 `typecheck + test + build + e2e:login`，一旦 lint 过了，还要关注 smoke。
- **实现 3**: `turbo.json`
  - 模式：`lint` 不依赖上游 build；`typecheck/test` 依赖 `^build`。
  - 可复用：如果仅 lint 失败，可局部锁定包而不用先 build 全仓。
  - 需注意：若问题出在 workspace 依赖声明或 lockfile，可能在 install / build 阶段暴露，而不只是 ESLint。
- **实现 4**: `apps/studio/package.json`
  - 模式：Studio 最近新增了 `better-sqlite3 / drizzle-orm / zod` 直接依赖，可能影响 install、lint、build 与跨 Node ABI 行为。
  - 可复用：本轮优先关注最近改动面。
  - 需注意：上轮成品化改动与当前 CLI 失败可能相关，但不能先假设就是它。

### 2. 项目约定

- **Node 基线**：本地主验证仍优先 `Node v20.19.6`，但 CI 还覆盖 `Node 24`。
- **构建顺序**：先复现，再最小修复，再回归。
- **留痕要求**：排查与验证结论必须写入项目 `.codex/`。

### 3. 可复用组件清单

- `.github/workflows/ci.yml`
- `package.json`
- `turbo.json`
- `apps/studio/package.json`
- `packages/page-intelligence/src/fragility.ts`
- `packages/page-intelligence/src/fragility.test.ts`

### 4. 当前风险点

- 上轮改动横跨：
  - `apps/studio/package.json`
  - `pnpm-lock.yaml`
  - `packages/page-intelligence/src/fragility.ts`
  - `packages/page-intelligence/src/fragility.test.ts`
- 可能失败面：
  - `pnpm lint` 的代码风格 / 未使用依赖 / 新规则
  - `pnpm smoke` 的 Node 24 ABI、构建或 e2e
  - `pnpm install --frozen-lockfile` 的 lockfile 一致性

### 5. 二次排查新增结论

- **源码级阻塞**：`packages/runtime` 的两个 TypeScript 问题确实会让 CI `smoke` 在 `typecheck` 阶段失败。
  - `src/playwright-runner.test.ts` 里的 `./index.ts` 导入会触发 `TS5097`
  - `src/playwright-runner.ts` 的 `uploadAttemptHandle` 控制流会触发 `TS2339`
- **环境级阻塞**：在本地切换 Node 主版本后，`better-sqlite3` 会因为原生 ABI 不匹配导致 `project-knowledge` 测试与仓库 `smoke` 失败。
  - 真实报错：`NODE_MODULE_VERSION 130` 对 `115`
  - 直接 `require('better-sqlite3')` 不能稳定复现；必须实际执行 `new Database(':memory:')` 才会触发真实绑定加载。
- **可复用实现 / 约束补充**：
  - `README.md` 与 `docs/guides/quickstart.md` 已明确要求 Node 20 / 24 切换后执行 `pnpm install --force`
  - `scripts/doctor.mjs` 已有 Node / Playwright / Web API 自检模式，可扩展为 `smoke` 前置守卫
  - `package.json` 的 `smoke` / `smoke:full` 是最合适的本地早失败接入点
