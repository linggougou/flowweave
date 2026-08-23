# P1 端到端指南

## 命令行回放

```bash
corepack enable
nvm use  # 读取仓库 .nvmrc，默认 Node 24
pnpm install
pnpm exec playwright install chromium
pnpm e2e:login
```

## 浏览器扩展录制

1. `pnpm --filter @flowweave/app-extension build`
2. Chrome → 扩展程序 → 开发者模式 → 加载已解压：`apps/extension/dist/chrome-mv3`
3. 打开任意页面操作，侧栏导出 Flow JSON（使用 `@flowweave/recorder` 归一化）

## Studio 工作台

```bash
pnpm --filter @flowweave/app-studio build:electron
pnpm --filter @flowweave/app-studio dev
```

首次启动会自动创建「登录演示」项目并保存 fixture 流程；点击「运行任务」将 headless 执行并写入 SQLite。
