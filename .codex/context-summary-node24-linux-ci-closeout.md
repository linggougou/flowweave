# Node 24 Linux CI 收口上下文摘要

## 任务目标

- 修复 GitHub Actions 中 Node 24 的 `@flowweave/app-studio#build` 失败。
- 保持 Node 24 默认开发基线与 Node 20 兼容矩阵。
- 整理本地产物忽略规则，并将 CI 修复、多语言 README 分边界提交后推送。

## 路线与生命周期

- 路线锁：`PROJECT_ROUTE_LOCK.md` 的 P2 收口与 Node 20 / 24 双基线门禁。
- 生命周期阶段：S6 测试与问题处理，完成后进入 S7 验收判断。
- 里程碑真源：`PROJECT_ROUTE_LOCK.md`、`docs/superpowers/plans/2026-05-26-run-first-roadmap.md`。
- 阶段出口：GitHub Actions Node 20 / 24 双矩阵通过，入口文档与验证证据一致。
- 最小可验收闭环：复现 Node 24 Linux 失败 -> 脚本合同测试红灯 -> 修复 -> 本地双版本验证 -> 推送 -> 远端双矩阵通过。

## 已确认根因

- 失败工作流：GitHub Actions CI #19，提交 `c34c840`。
- Node 20 job 通过；Node 24 job 在 Studio build 失败。
- Electron 专用 `better-sqlite3` binding 已生成，失败发生在校验阶段。
- `electron/cli.js` 报错 `Electron failed to install correctly`，说明 Electron 包缺少 `path.txt` 或对应可执行文件。
- 当前脚本默认 Electron npm 包安装一定完整，没有缺失检测与定向恢复合同。

## 实施边界

- 允许修改：`apps/studio/scripts/`、对应测试、`.gitignore`、`.codex/`、README 提交边界。
- 禁止修改：runtime 主链路、Studio 页面结构、Flow DSL、P3/P4 冻结能力、技术栈。
- 不新增依赖，不改变 CI Node 矩阵，不绕过 Studio build 或 native binding 校验。

## 工具与替代流程

- `gh` 缺失：使用 GitHub Actions REST API与 Git credential 只读下载 job 日志。
- Docker 缺失：以真实远端 Linux 日志作为复现证据，并用依赖注入的脚本单测覆盖 Linux 缺失场景。
- CodeGraph 不可用：使用 `rg`、脚本源码、现有测试和真实 CI 日志完成影响分析。
- 多任务共享 `.codex`、`.gitignore` 与提交顺序，采用单 Agent 串行集成，避免并行覆盖未提交用户改动。

## 验收标准

- 新增测试可稳定复现 Electron 安装不完整场景，并在修复前失败。
- Studio 定向测试、build 通过。
- Node 24：`pnpm lint`、`pnpm smoke`、`pnpm e2e:recorded-pages` 通过。
- Node 20：兼容验证通过。
- `git diff --check`、README 格式与链接检查通过。
- 推送后 GitHub Actions Node 20 / 24 均通过。
