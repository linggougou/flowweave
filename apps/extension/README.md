# FlowWeave 浏览器扩展（P1）

Chromium MV3 录制扩展，基于 [WXT](https://wxt.dev/) 构建。用户在侧栏明确开始录制后，扩展才会将页面点击、输入与导航聚合为 `RecordedEvent`；录制完成后可预览、命名并保存到 Studio。

## 开发

```bash
# 在仓库根目录
pnpm install
pnpm dev:extension
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
5. 固定工具栏图标；点击图标应打开 **侧栏**，初始显示“尚未开始”。
6. 打开织流 Studio，在侧栏选择目标项目后点击 **开始录制**；仅“正在录制”期间的页面操作会进入当前会话。
7. 可随时 **暂停录制 / 继续录制**；点击 **完成录制** 后检查目标站点和步骤预览。
8. 输入有效任务名，点击 **确认名称并保存到 Studio**；任务会以该名称出现在 Studio。
9. **清空录制** 前会二次确认，清空后可使用一次 **恢复刚才的录制**。

## 架构说明

| 入口 | 职责 |
|------|------|
| `entrypoints/content.ts` | 监听 click / change / SPA 导航，发送 `RecordedEvent` |
| `entrypoints/background.ts` | 持久化会话状态机、守卫事件、生成预览并响应保存/导出 |
| `entrypoints/sidepanel.html` | 录制控制、步骤预览、任务命名与清空恢复 UI |

会话状态与一次性恢复快照存放于 `browser.storage.session`，因此 service worker 重启不会丢失当前录制。Flow 生成经 `lib/flow-export.ts` 重导出 `@flowweave/recorder` 的 `buildFlowFromEvents`。保存通过 Studio 托管的本地 API（默认 `http://127.0.0.1:3847`）写入 SQLite。
