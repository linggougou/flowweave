# P2.7 本地资产安全维护执行计划

## 1. 路线与阶段

- 生命周期：S4 里程碑计划 → S5 分轨开发 → S6 集成验证 → S7 会签。
- 路线：`PROJECT_ROUTE_LOCK.md` 的 P2.7“执行记录安全清理与版本只读 Diff”。
- 用户授权：2026-08-23 在 P2.6 完成且已明确披露下一阶段范围后回复“继续”，并要求 plan、worktree、Sub-Agent 并行与验收回收。
- 主闭环：Studio 删除单条已完成 execution 及其精确受控运行产物；Studio / Web 只读查看历史版本相对当前任务的结构化 JSON diff。
- 明确非目标：Local API / Web 删除、Flow / 项目 / 版本 / 批量删除、孤儿目录 sweep、递归清理、可编辑 diff、vNext、P3/P4、云协作、技术栈替换。

## 2. 审计裁决

### 2.1 为什么删除仅在 Studio

现有 Local API 允许无 Origin、本机页面和扩展调用，CORS 不是破坏性授权。本阶段不引入 token / capability 系统，也不把 `DELETE` 暴露给 HTTP。删除只经 Electron 主进程固定 IPC 进入 repository；renderer 仅传 `projectId + executionId`，不传文件路径。

### 2.2 为什么不能直接递归删除

现有 `resolveRunDirectory()` 仅 `join()`，`executionId="."` 或 `../` 可命中父目录；`page_snapshots` 又没有 executionId 外键。P2.7 必须先建立 ID、真实项目、containment、symlink 与直属产物白名单，再以“原子隔离 → 数据库事务 → 白名单逐项清理”的顺序实施。禁止 `rm({ recursive: true })`。

### 2.3 版本语义

`saveFlow()` 在保存新内容前为旧内容建立快照，因此界面只能表述为“历史 vN → 当前任务”，不能虚构当前版本号。Diff 固定比较所选历史版本和当前 Flow，不支持任意两版本、编辑、合并或应用补丁。

## 3. 冻结合同

### 3.1 ID 与项目存在性

- projectId、executionId 只接受长度受限的 `[A-Za-z0-9_-]+` 单段标识。
- `.`, `..`、正反斜杠、编码分隔符、控制字符、空值和非字符串必须在任何 mkdir / SQLite 打开前拒绝。
- 分配和删除运行目录前必须以无副作用方式确认真实项目；不存在项目不得生成目录、`store.sqlite` 或 ghost project。
- 现有分配入口同时收紧，不只保护删除路径。

### 3.2 单条删除与运行产物

- Repository 只提供 `deleteExecution(projectId, executionId)`；查询同时约束两个 ID。
- execution 不存在时幂等返回 `already-absent`，绝不清理同名目录。
- 精确目标只能是 `<canonicalDataRoot>/<projectId>/runs/<executionId>`，且 project、runs、runDir 任一级均不得为 symlink。
- 允许的直属文件仅为 `network.har`、`step-<n>.png`、`page-<n>.json`、`step-<n>-diagnostic.json`；未知文件、子目录、symlink、FIFO、socket 均在数据库变更前拒绝。
- 先把 runDir 原子 rename 到同一 runs 根的随机 quarantine 名，再在 SQLite immediate transaction 中删除精确关联 page snapshot 行与 execution；execution_steps 由 FK cascade。
- page snapshot 只按“规范化父目录等于精确 runDir 且 basename 为 `page-<n>.json`”识别，禁止字符串前缀匹配。
- 数据库失败时恢复原目录；恢复失败必须报高危结构化错误。
- 数据库提交后只逐个 unlink 白名单直属文件再 rmdir；最终清理失败保留 quarantine 并返回 `artifacts: "quarantined"`，不泄露绝对路径。
- runDir 不存在时可删除数据库记录并返回 `artifacts: "absent"`。
- `saveExecution()` 的 execution 与 steps 同事务保存，避免半条记录。

### 3.3 Studio 删除交互

- 主进程复用单段 ID 校验，`activeExecutions` 中的 execution 明确拒绝；删除成功后驱逐内存 execution cache。
- preload 仅暴露固定业务方法，不暴露路径；Browser fallback 不展示删除能力。
- 确认框包含任务名、运行时间、状态、影响范围和不可恢复的记录语义；初始焦点为取消，Escape 关闭并恢复触发按钮焦点。
- 提交期间禁用重复操作；失败保持列表、选择和详情并使用 `role="alert"`。
- 删除当前记录后优先选择原位置的下一条较旧记录，否则上一条较新记录；删除非当前记录保持选择；空列表清空详情。
- 成功后重新请求列表以补入原第 6 条，不只做前端过滤；慢响应不得污染已经切换的项目、Flow 或 execution。

### 3.4 共享只读 Diff

- `@flowweave/ui` 提供无第三方依赖的确定性 JSON Pointer diff 与只读视图。
- 对具有唯一 `id` 或 `name` 的对象数组按稳定标识匹配，其余数组按索引比较；总体按节点数线性遍历，不使用 LCS。
- 输出 `added / removed / changed`、路径、历史值和当前值；最多渲染 500 条，长值截断并明确提示。
- 两端比较前使用既有可移植合同生成安全展示副本；历史敏感字面量不得因 diff 扩大暴露。
- 版本选择时立即清空旧结果并加载；只有 requestId、projectId、flowId、versionId 全匹配且历史 `document.id === flowId` 时提交。
- 业务层只展示数量摘要，路径和值进入专业详情；无 textarea、contenteditable、保存按钮或写 API。

## 4. 依赖 DAG 与 worktree 轨道

```text
G0 路线锁、合同、计划与基线
  ├─ G1 path + repository 删除核心 + allocation 防护
  └─ G2 @flowweave/ui 共享只读 diff

G1 + G2
  ├─ G3 Studio IPC/service/renderer 删除 + diff
  └─ G4 Web 只读 diff + 版本竞态守卫

G3 + G4
  └─ G5 故障注入、真实 UI、Node 20/24、Judge、安全与 CI 会签
```

### G1：路径与删除核心（L3）

- 所有权：`packages/project-knowledge/**`、必要的 `packages/local-api/**` 分配入口测试。
- 交付：统一 ID/path guard、真实项目无副作用探测、原子隔离与事务删除、白名单清理、saveExecution 原子性。
- Local API 只验证安全分配与错误映射，明确不新增 destructive route。
- TDD 红灯覆盖 traversal、ghost project、跨项目、page snapshot 精确关联、symlink/特殊文件、兄弟 sentinel、DB 回滚、quarantine、重复删除。

### G2：共享只读 Diff（L2）

- 所有权：`packages/ui/**`。
- 交付：纯 diff、条目限制、值截断、文本状态、响应式只读视图与 `aria-pressed` 修正。
- TDD 红灯覆盖相同值、primitive、对象、数组、稳定顺序、标识数组、大输入和非颜色语义。

### G3：Studio 接入（L3）

- 所有权：`apps/studio/**`。
- 依赖 G1/G2 集成基线后创建 worktree。
- 交付：固定 IPC/preload/service、活动执行拒绝、缓存驱逐、确认对话框、选择恢复、execution / version 异步守卫与安全 diff。
- TDD 红灯覆盖 traversal、active execution、取消/成功/失败、当前/非当前/最后一条、第 6 条补位、A/B 乱序、跨项目慢响应和 flowId 不匹配。

### G4：Web 只读 Diff（L2）

- 所有权：`apps/web/**`。
- 依赖 G2 集成基线后创建 worktree；不修改 Local API 路由、不出现删除入口。
- 交付：安全 diff、版本/currentFlow/list 请求守卫、375×812 响应式与键盘可用性。

### G5：集成验收（L3）

- 所有权：根 E2E、文档和 `.codex/**`。
- 每轨先由独立 Judge 输出 `.codex/reviews/p2-7/<track>/scorecard.json` 与 `verdict.md`；REVISE/REJECT 必须退回原轨修复并复审。

## 5. 验收门禁

### 定向门禁

```bash
pnpm --filter @flowweave/project-knowledge test
pnpm --filter @flowweave/local-api test
pnpm --filter @flowweave/ui test
pnpm --filter @flowweave/app-studio test
pnpm --filter @flowweave/app-web test
pnpm --filter @flowweave/app-studio build
pnpm --filter @flowweave/app-web build
git diff --check
```

### 集成门禁

```bash
pnpm lint
CI=1 pnpm smoke
pnpm e2e:recorded-pages
pnpm e2e:portability
pnpm audit --prod --audit-level high --registry=https://registry.npmjs.org
```

- Node 24 执行完整本地门禁；Node 20.19.6 按 lockfile 重建后至少执行无缓存 typecheck / test / build 与关键 E2E。
- Studio 真机覆盖删除确认、成功、异常清理提示、列表补位和 diff；Web 浏览器覆盖 diff、键盘和 375×812 无横向溢出。
- 最终以集成分支和 main 的 Node 20 / 24 CI 双绿会签。
- coverage provider 未安装时不新增依赖，以关键分支/错误/边界合同和完整 smoke 替代并留痕。

## 6. Definition of Done

- [x] 无路径穿越、ghost project、symlink 跟随、递归删除或任意路径删除能力。
- [x] 单条 deletion 的 DB / FS 顺序可回滚，page snapshot 无精确已知悬挂，未知产物 fail closed。
- [x] Local API 与 Web 没有 destructive endpoint / capability；Studio 活动执行不能删除。
- [x] Studio 确认、失败、补位、空态和异步切换一致。
- [x] Studio / Web 共享有界安全只读 diff，语义为“历史 vN → 当前任务”。
- [x] 分轨 TDD、安全审查与 Judge 均 PASS，无未关闭 P0/P1。
- [ ] Node 24、Node 20、recorded replay `25/25`、portability、安全审计和远端双矩阵通过。
- [x] P3/P4、vNext、Flow / 项目 / 批量删除和可编辑 diff 未混入。
- [ ] worktree、分支、临时进程与 Agent 在验收后回收，留痕完整。

当前状态：G1-G5、独立总审、本地 Node 20/24、真实 Web/Studio、安全审计与 E2E 已通过；仅等待集成分支和 main 远端双矩阵，完成前不归档。

## 7. 回滚策略

- G1、G2、G3、G4 独立提交，可按轨 revert；删除不变更 schema。
- G1 若不能证明路径和回滚安全，整轨拒绝合入，产品保持只读。
- G3 可独立移除删除 IPC/UI，保留 repository 内部能力待后续重新会签。
- G2/G4 可独立回滚，不影响现有版本读取与恢复。
