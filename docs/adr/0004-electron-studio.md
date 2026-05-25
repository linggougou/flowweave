# ADR-0004: Electron 桌面工作台

## 状态

已采纳（2026-05-25）

## 背景

`apps/studio` 需集成：流程编辑、执行监控、本地 DB、Playwright 子进程、调试回放。需要成熟的主进程能力。

## 决策

- 桌面端采用 **Electron + Vite + React**。
- 本地服务（API + runtime 调度）可在主进程或内置 Node 子进程运行。
- UI 组件优先复用 `@flowweave/ui`。

## 后果

- 与 Playwright、SQLite 集成路径清晰。
- 安装包体积较大；Tauri 作为后续优化选项（需新 ADR）。

## 备选方案

- Tauri：更轻，与 Playwright 子进程集成需额外设计。
