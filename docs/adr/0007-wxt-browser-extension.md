# ADR-0007: WXT 浏览器扩展

## 状态

已采纳（2026-05-25）

## 背景

`apps/extension` 需 MV3、内容脚本注入、Side Panel、与本地服务通信。手写 manifest 维护成本高。

## 决策

- 使用 **WXT** 构建 Chrome 扩展（首期 Chromium 系）。
- 录制逻辑调用 `@flowweave/recorder`，事件经 WebSocket / Native Messaging 发往本地服务。
- UI 可使用 React + `@flowweave/ui` 子集。

## 后果

- 开发体验接近 Vite 应用。
- Firefox/Safari 需后续适配与独立 ADR。

## 备选方案

- Plasmo：同样可行，团队更熟悉 Vite 系选 WXT。
