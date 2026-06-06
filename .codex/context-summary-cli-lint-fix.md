# 项目上下文摘要（CLI lint 修复）

生成时间：2026-06-06 14:23:39 CST

## 1. 相似实现与参考模式

- `apps/studio/src/studio-client.ts`
  - 当前错误发生点，集中定义浏览器端与 Electron 间的 Studio API 适配逻辑。
  - 顶部采用 `import type` 方式引入共享类型，适合最小化删除未使用类型。
- `apps/studio/src/shared/studio-api-types.ts`
  - `RunFlowOptions` 在共享类型层仍被 `StudioApi.runFlow` 使用，说明问题只在消费端未使用，而不是类型定义多余。
  - 因此应删除无用导入，而不是删除共享类型本身。
- `eslint.config.js`
  - 文件内容使用 ESM `import/export default` 语法。
  - 在当前根 `package.json` 未声明 `"type": "module"` 的情况下，Node 会输出 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- `apps/studio/scripts/dev-electron.mjs`
  - 仓库已有 `.mjs` 命名的 ESM 脚本实践，说明对 Node 侧 ESM 文件显式使用 `.mjs` 与项目习惯一致。
- `scripts/create-package-skeleton.mjs`
  - 再次证明仓库脚本层面对 `.mjs` 作为 ESM 载体已有稳定模式，不需要额外引入新约定。

## 2. 当前失败复现

- 远端 `origin/main` 最新提交：`5cbb300 feat: 增强录制回放闭环 — 多策略定位、扩展侧栏与 Studio 体验`
- GitHub Actions 失败步骤：`pnpm lint`
- 本地复现命令：`pnpm --filter @flowweave/app-studio lint`
- 本地错误输出：
  - `apps/studio/src/studio-client.ts`
  - `6:3 error 'RunFlowOptions' is defined but never used`

## 3. 项目约定

- **类型导入**：统一使用 `import type`，并受 `@typescript-eslint/consistent-type-imports` 约束。
- **未使用变量规则**：`@typescript-eslint/no-unused-vars` 为 `error`，仅允许 `_` 前缀忽略。
- **Node ESM 文件命名**：仓库中 Node 脚本优先用 `.mjs` 明确声明 ESM。

## 4. 修复策略

- 最小修复：删除 `studio-client.ts` 中未使用的 `RunFlowOptions` 类型导入。
- 顺手清理 CLI 噪音：将根 ESLint 配置从 `eslint.config.js` 改为 `eslint.config.mjs`，消除 Node 模块类型警告。

## 5. 验证策略

- 先复现失败：`pnpm --filter @flowweave/app-studio lint`
- 修复后验证：
  - `pnpm --filter @flowweave/app-studio lint`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
