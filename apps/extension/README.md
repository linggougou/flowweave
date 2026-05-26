# FlowWeave 浏览器扩展（P1）

Chromium MV3 录制扩展，基于 [WXT](https://wxt.dev/) 构建。将页面上的点击、输入与导航聚合为 `RecordedEvent`，并可在侧栏导出 Flow JSON 草案。

## 开发

```bash
# 在仓库根目录
pnpm install
pnpm --filter @flowweave/app-extension dev
```

`dev` 会启动 WXT 开发模式并输出可加载的 `dist/`（或 `.output/` 下的 chrome-mv3 目录，以构建日志为准）。

## 构建

```bash
pnpm --filter @flowweave/app-extension build
```

产物位于 `apps/extension/dist/`（Chrome MV3）。

## 以 unpacked 方式加载（Chrome）

1. 执行上述 `build`（或 `dev` 完成首次编译）。
2. 打开 Chrome → **扩展程序** → **管理扩展程序** → 开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择目录：`apps/extension/dist/chrome-mv3`（若不存在则选 `apps/extension/dist` 下包含 `manifest.json` 的子目录）。
5. 固定工具栏图标；点击图标应打开 **侧栏**，显示已记录事件数量。
6. 在任意网页进行点击、输入、跳转后，侧栏计数应增加；点击 **导出 Flow JSON** 下载草案文件。
7. 另开终端运行 `pnpm dev:web`，侧栏选择项目后点击 **同步到知识库**，在 Studio / Web 控制台可见同一 Flow。

## 架构说明

| 入口 | 职责 |
|------|------|
| `entrypoints/content.ts` | 监听 click / change / SPA 导航，发送 `RecordedEvent` |
| `entrypoints/background.ts` | 聚合事件、会话存储、响应导出 |
| `entrypoints/sidepanel.html` | 事件计数与导出 UI |

Flow 生成经 `lib/flow-export.ts` 重导出 `@flowweave/recorder` 的 `buildFlowFromEvents`。同步知识库通过本地 Web API（默认 `http://127.0.0.1:3847`）写入 SQLite。
