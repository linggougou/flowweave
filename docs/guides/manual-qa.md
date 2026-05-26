# v1 手测清单（录制 → 知识库 → 回放）

按顺序勾选，用于验收 **第一版（先跑通，无 AI）** 主链路。预计 15–20 分钟。

## 准备

- [ ] Node 20，`pnpm install`，`pnpm doctor` 无致命错误
- [ ] `pnpm exec playwright install chromium`（若 doctor 提示）
- [ ] `SKIP_E2E=1 pnpm smoke` 或 `pnpm smoke:full` 通过

## A. 脚本端到端（无 UI）

- [ ] `pnpm e2e:login` 成功
- [ ] `~/.flowweave/projects/` 下出现项目目录
- [ ] 最新 `runs/<executionId>/` 含 `step-*.png`

## B. Web API + 控制台

- [ ] 终端运行 `pnpm dev:web`
- [ ] `curl http://127.0.0.1:3847/api/health` → `{"ok":true}`
- [ ] 浏览器打开 <http://127.0.0.1:5174>，能看到项目列表
- [ ] 可选：执行历史 / Flow 版本页可切换

## C. 扩展录制与同步

- [ ] `pnpm dev:extension` 或 `build` 后加载 `apps/extension/dist/chrome-mv3`
- [ ] 侧栏事件计数随页面操作增加
- [ ] 选择目标项目（API 已启动）
- [ ] **同步到知识库** 成功提示
- [ ] **清空录制** 后计数归零（可选验证）
- [ ] Web 控制台该项目下出现新 Flow

## D. Studio 回放

- [ ] `pnpm dev:studio` 启动
- [ ] 侧栏选择与扩展相同项目
- [ ] 侧栏 **Flow 列表** 选中刚同步的 Flow
- [ ] 点击 **运行流程**，步骤表有 passed/failed
- [ ] 截图列可点击，系统打开图片（或提示路径无效）
- [ ] **Flow 版本** 标签可看到历史（若曾二次保存）

## E. 数据一致性

- [ ] Studio / Web / `~/.flowweave` 中项目 ID、Flow ID 一致
- [ ] 同一次执行的 `executionId` 在 Web 与 Studio 均可查到

## 通过标准

以上 **A + B + C + D** 核心项全部勾选，即视为 **v1 第一版落地**。
