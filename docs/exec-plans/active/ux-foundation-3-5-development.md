# UX Foundation 3-5 并行开发计划

## 1. 任务定位

- 生命周期：S5 开发落地 → S6 测试与问题处理 → S7 验收。
- 路线：`PROJECT_ROUTE_LOCK.md` 的 P2.5“非技术用户首次旅程闭环”。
- 基线：UX Foundation 1-2 已在 `6ad5ff4` 完成并通过 Node 20/24 CI；本计划从该提交继续。
- 阶段出口：非技术用户可在产品内明确控制录制边界，安全确认并运行任务，并用业务语言理解结果。
- 明确非目标：P3 深度 page/network intelligence、P4 AI 编排、云协作、技术栈替换、页面骨架重写。

## 2. 总体交付闭环

```text
Foundation 3 录制会话
  └─ 开始 → 暂停/继续 → 完成 → 预览/命名 → 确认保存

Foundation 4 安全运行
  └─ 影响摘要 → 高风险确认 → 第 N/M 步进度 → 可取消 → 明确结果

Foundation 5 业务视图
  └─ 项目/任务/结果主线 → 专业信息折叠 → Web 最近结果收口

三轨定向验收
  → 集成分支冲突收敛
  → Node 24 全量门禁
  → Node 20 兼容门禁
  → Electron/Extension/Web 真实界面验收
  → main 双版本 CI
```

## 3. 并行轨道与文件边界

### Track F3：录制会话与命名

- 分支：`codex/ux-foundation-3-recording-session`
- worktree：`/Volumes/2T/CODE/A_Mine/flowweave-worktrees/uxf3`
- 主责文件：
  - `apps/extension/entrypoints/**`
  - `apps/extension/lib/**`
  - 必要时 `packages/recorder/src/**`
- 禁止修改：`apps/studio/**`、`apps/web/**`、`packages/runtime/**`。
- 用户旅程：
  1. 初始状态不静默录制，用户点击“开始录制”。
  2. 暂停期间页面动作不进入会话；继续后沿用同一会话。
  3. 完成后进入预览，展示可读步骤与目标站点。
  4. 用户输入任务名后确认保存到 Studio。
  5. 清空前必须确认，并提供一次可恢复机会。
- 数据合同：会话状态采用 `idle | recording | paused | completed`；状态与事件保存在 `browser.storage.session`，service worker 重启后可恢复。
- TDD 门禁：background/content/sidepanel 合同先红后绿；扩展测试、typecheck、build 通过。

### Track F4：安全运行、进度与取消

- 分支：`codex/ux-foundation-4-safe-run`
- worktree：`/Volumes/2T/CODE/A_Mine/flowweave-worktrees/uxf4`
- 主责文件：
  - `packages/runtime/src/**`
  - `apps/studio/electron/**`
  - `apps/studio/src/shared/**`
  - 可新增独立进度/运行确认组件及其测试
- 集成边界：不重构 `apps/studio/src/App.tsx` 与 `styles.css`；由主代理在集成阶段接入，避免与 F5 冲突。
- 用户旅程：
  1. 运行前看到任务名、域名、环境、步骤数与风险动作摘要。
  2. 命中提交、删除、发送、保存等高风险动作时需要明确确认。
  3. 运行中收到 `started/step-started/step-finished/waiting/completed/cancelled` 进度事件。
  4. 用户可取消；runtime 关闭浏览器会话，执行以 `cancelled` 落库，不伪装为失败或成功。
- 技术合同：`executeFlow` 支持 `AbortSignal` 与进度回调；Electron 使用 executionId 维护 AbortController，IPC 仅暴露受控的订阅与取消接口。
- 安全门禁：取消必须幂等；输入和进度事件不得记录敏感变量；错误不向 UI 暴露秘密或堆栈。
- TDD 门禁：runtime、Electron service/main/preload、共享状态模型测试先红后绿；相关包 typecheck/lint/test/build 通过。

### Track F5：业务视图与 Web 收口

- 分支：`codex/ux-foundation-5-business-view`
- worktree：`/Volumes/2T/CODE/A_Mine/flowweave-worktrees/uxf5`
- 主责文件：
  - `apps/studio/src/App.tsx`
  - `apps/studio/src/styles.css`
  - Studio 展示组件与 copy/layout tests（不修改 Electron/runtime）
  - `apps/web/src/**`
- 用户旅程：
  1. 默认词汇统一为“项目 / 自动化任务 / 步骤 / 运行记录 / 成功 / 失败 / 已取消”。
  2. Studio 默认突出当前任务、目标站点、必要参数和最近结果。
  3. P2、UUID、Storage State、preflight、locator、原始 JSON/日志进入“高级设置/专业诊断”。
  4. Web 默认进入最近运行结果；空状态提供回到 Studio/录制的明确下一步。
  5. 失败先显示人话原因与一个主要建议，再展开专业详情。
- 前端门禁：不新增状态库；复用现有 API 与组件；保持键盘可访问、焦点可见和窄窗口可用。
- TDD 门禁：产品文案、默认 tab、空状态、结果摘要、专业信息折叠合同先红后绿；Studio/Web test、typecheck、build 通过。

## 4. 集成顺序

1. 以 `codex/ux-foundation-3-5-integration` 为唯一集成分支。
2. 先集成 F3；其文件边界与其他轨道互斥。
3. 再集成 F4 的 runtime/Electron/共享组件与合同。
4. 最后集成 F5 的 App/样式/Web 改造。
5. 主代理只做跨轨接线：把 F4 运行摘要、进度订阅与取消动作接入 F5 业务视图，不扩大功能范围。
6. 任一轨道未通过定向门禁不得集成；集成后失败由对应轨道优先修复。

## 5. 验收矩阵

### 定向验收

- F3：`pnpm --filter @flowweave/app-extension test && pnpm --filter @flowweave/app-extension typecheck && pnpm --filter @flowweave/app-extension build`
- F4：`pnpm --filter @flowweave/runtime test && pnpm --filter @flowweave/app-studio test && pnpm --filter @flowweave/app-studio typecheck`
- F5：`pnpm --filter @flowweave/app-studio test && pnpm --filter @flowweave/app-web test && pnpm --filter @flowweave/app-web typecheck`

### 集成验收

- Node 24：`pnpm lint`、`CI=1 pnpm smoke`、`pnpm e2e:recorded-pages`。
- Node 20：至少 `pnpm install --force --frozen-lockfile` 后 `CI=1 pnpm smoke`；完成后恢复 Node 24 依赖基线。
- 成品：Studio 目录包启动、本地 API 生命周期、Extension 生产构建、Web 生产构建。
- 真实旅程：开始/暂停/继续/完成/命名/保存 → Studio 自动发现 → 运行前确认 → 进度/取消 → Web 查看最近结果。
- 安全：敏感输入不落明文；取消后无残留浏览器；本地 API 来源限制不回退；变更文件敏感信息扫描通过。

## 6. 质量与回收规则

- 每轨必须提交代码、测试与简短验证证据；禁止只交付未提交工作区。
- 主代理审查 diff、测试覆盖、错误路径、安全边界和路线一致性。
- 验收合格后才合入集成分支，并立即回收对应 Agent；worktree 在提交已合入且工作区洁净后移除。
- 连续三次验证失败时停止扩写，回到合同与设计复盘。
- 不通过的轨道保持隔离，不得降低主线门禁或把失败包装为完成。

## 7. 完成定义

- Foundation 3、4、5 的退出门禁全部满足。
- Node 24 全量门禁和 Node 20 兼容门禁通过。
- Electron、Extension、Web 的首次用户旅程有可重复验收证据。
- `PROJECT_ROUTE_LOCK.md`、活跃计划、`.codex/operations-log.md` 与 `.codex/verification-report.md` 口径一致。
- 集成提交可 fast-forward 并入 `main`，远端 Node 20/24 CI 双绿。
- P3/P4 保持冻结，未混入额外需求。

## 8. 完成结果（2026-08-23）

- F3、F4、F5 均经独立 Reviewer 复审并关闭全部 P1；三个 Agent 与 worktree 已回收。
- 集成补齐运行前确认、高风险勾选、进度订阅、取消入口、终态保护和 HTTP fallback `cancelled` 映射。
- App 集成合同覆盖所有运行先确认、高风险二次确认、拿到 executionId 后才可取消、卸载清理订阅。
- Web 真实浏览器检查通过：默认最近结果、业务摘要、原生按钮 `aria-pressed`、375px 窄窗口无横向溢出。
- Electron `dev:studio` 可启动，`5173` 可访问且本地 API 由 Electron 监听；桌面 AX 自动化因本机缺少 `orca` 未取得窗口树证据，关键退出时序由主进程测试覆盖。
- 安全审计发现并修复 `drizzle-orm <0.45.2` High 漏洞；升级至 `0.45.2` 后官方 registry 审计为 0 个已知漏洞。
- Node 24：`CI=1 pnpm smoke`、recorded replay `25/25` 通过。
- Node 20.19.6：`pnpm install --force --frozen-lockfile` 后 `CI=1 pnpm smoke` 通过；随后已恢复 Node 24 依赖基线。
- 本计划已满足本地完成定义；归档后等待集成分支与 main 的远端 Node 20/24 CI 会签。
