# P2.7 本地资产安全维护上下文摘要

## 1. 任务定位

- 日期：2026-08-23
- 生命周期：S4 计划已冻结，准备进入 S5 分轨开发。
- 路线真源：`PROJECT_ROUTE_LOCK.md`。
- 里程碑真源：`docs/exec-plans/active/p2-7-asset-maintenance.md`。
- 用户授权：P2.6 完成并披露 P2.7 范围后回复“继续”；此前已要求自主规划、worktree 并行、验收后回收 Agent。
- 主闭环：Studio 单条 execution 安全删除；Studio / Web 历史版本对当前任务的安全只读 diff。

## 2. 基线与代码事实

- 起点：main `e8047fedb2f85d8e15560f4c5a474d24c7709da9`，与 `origin/main` 一致。
- 定向基线：flow-dsl `18/18`、project-knowledge `18/18`、local-api `8/8`、Web `21/21`、Studio `167/167`。
- `resolveRunDirectory()` 当前只做 `join()`；`.` / `..` 可命中父路径，分配入口还能为 ghost project 创建目录。
- `execution_steps` 对 execution 有 FK cascade；`page_snapshots` 只有 projectId + snapshotPath，没有 executionId。
- Studio 运行保存顺序为 execution 后 page snapshots，但 active execution 生命周期覆盖整个 `runFlow()`；删除限定 Studio 主进程并拒绝 active execution 可关闭 UI 竞态。
- Local API 当前没有破坏性授权，CORS 不能代替授权，因此 P2.7 不新增 HTTP DELETE。
- Studio / Web 已有版本列表与历史文档读取；diff 无需新数据库或 API。

## 3. 设计裁决

- 删除：严格 ID → 无副作用项目探测 → 精确路径与文件类型检查 → 同根原子 quarantine → DB immediate transaction → 白名单逐项清理。
- 缺失 execution 不清目录；未知文件、子目录、symlink、FIFO/socket fail closed；不使用递归删除。
- page snapshot 仅按精确父目录与 `page-<n>.json` basename 匹配删除。
- Renderer 只传两个 ID；活动执行拒绝；绝对路径和内部错误不返回前台。
- Diff：`@flowweave/ui` 共享、确定性 JSON Pointer、500 条上限、安全展示副本；Studio / Web 均接入。
- 明确排除：Web / Local API 删除、Flow / 项目 / 批量删除、孤儿 sweep、编辑 diff、P3/P4/vNext。

## 4. 分轨

- G1：`packages/project-knowledge/**` + local-api 安全分配回归。
- G2：`packages/ui/**` 共享只读 diff。
- G3：`apps/studio/**` 删除 IPC/UI、异步守卫和 diff。
- G4：`apps/web/**` diff 与版本异步守卫。
- G5：根 E2E、文档、`.codex`、Node 20/24、真实 UI、安全与 CI。

G1/G2 并行；合入公共合同后 G3/G4 并行。每轨 TDD 先红后绿，独立 Judge 必须留下 scorecard/verdict 并 PASS 后才回收。

## 5. 工具与替代

- 已使用 CodeGraph `status`、`impact` 审计影响面；首次误用 `--max-results`，依据 help 改为 `--limit`。
- `orchestration` skill 需要 Orca CLI，但本机 `command -v orca` 为空；使用 Codex 原生 Sub-Agent + Git worktree 等效编排，不跳过并行或验收。
- coverage provider 未安装，不为追求数字新增依赖；以关键路径分支、故障注入和全量 smoke 替代。
