# ADR-0002: 全栈 TypeScript strict

## 状态

已采纳（2026-05-25）

## 背景

录制协议、Flow DSL、执行器与 UI 需要共享类型；运行时类型错误在自动化场景成本高。

## 决策

- 所有 `packages/*` 与 `apps/*` 使用 **TypeScript 5.x**。
- 根 `tsconfig.base.json` 启用 `strict: true`。
- 领域 Schema 使用 **Zod**，必要时导出 JSON Schema。

## 后果

- 编译期可捕获 Flow 结构错误。
- 需为 Playwright、Electron 等配置合适的 `lib` 与 `types`。

## 备选方案

- 部分包用 JavaScript：不利于跨包契约。
