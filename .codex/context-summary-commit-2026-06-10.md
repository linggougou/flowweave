# 2026-06-10 提交上下文摘要

## 用户目标

- 用户要求：`代码需要提交一下`

## 当前阶段

- 生命周期阶段：稳定化收口 / v1 先跑通版维护
- 路线锁：`PROJECT_ROUTE_LOCK.md`
- 当前边界：仅收口现有主线改动并提交，不新增功能，不解冻 P3 / P4

## 本次提交范围

1. Node 24 默认开发基线与入口文档对齐
2. 物理 `PROJECT_ROUTE_LOCK.md` 入仓
3. runtime headed 浏览器 profile 稳定化
4. project-knowledge / studio 的 Electron `better-sqlite3` native binding 打通
5. Electron 单窗口聚焦与构建链测试补齐
6. `.codex` 操作与验证留痕更新

## 不纳入提交

- `.idea/`
- `apps/studio/output/`
- 根目录 `output/`

## 提交前验证

- `pnpm lint`
- `pnpm smoke`
- `pnpm e2e:recorded-pages`
- `pnpm --filter @flowweave/app-studio build`
- `codesign --verify --deep --strict node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/Electron.app`

## 额外说明

- 验证时发现 `packages/runtime/src/playwright-runner.ts` 有一个 lint 级别的未使用变量，已做最小修复后重新通过验证。
