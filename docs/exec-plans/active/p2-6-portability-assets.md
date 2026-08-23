# P2.6 Flow 可移植性与低风险资产维护执行计划

## 1. 路线与阶段

- 生命周期：S4 里程碑计划 → S5 开发落地 → S6 验证 → S7 会签。
- 路线：`PROJECT_ROUTE_LOCK.md` 的 P2.6“Flow 可移植性与低风险资产维护”。
- 用户授权：2026-08-23 在 P2.5 完成交付后明确回复“继续”。
- 主闭环：安全导出 → Studio 受控导入为新副本 → 补齐输入 → 运行；并补齐 Web 任务重命名。
- 明确非目标：Flow / execution 删除、`runs/` 清理、版本 diff、vNext 输入节点与暂停继续、P3/P4、云协作、技术栈替换。

## 2. 用户旅程与验收故事

1. 作为任务作者，我可以把当前任务导出为普通 JSON，并清楚知道系统处理了哪些已识别风险。
2. 作为另一项目的使用者，我可以在 Studio 中选择 JSON 文件，校验后导入为新任务，且不会覆盖任何现有任务。
3. 作为扩展用户，我导出的新文件与 Studio 使用同一安全合同，过去导出的裸 `FlowDocument` 仍可导入。
4. 作为 Web 查看者，我可以重命名当前任务；提交失败或快速切换上下文时不会出现错名。

## 3. 冻结合同

### 3.1 文件格式

- P2.6 继续使用 `schemaVersion: 1` 的裸 `FlowDocument` JSON，不新增复杂 envelope，不升级 schemaVersion。
- 导入使用 `flowDocumentSchema` / `parseFlowDocument` 校验；未知字段按既有 Zod 行为处理。
- 历史扩展导出的裸 JSON 是兼容输入。
- Studio 单文件导入上限为 1 MiB；非法 JSON、版本不兼容或超限均不得写入数据库。

### 3.2 已知风险处理

- 移除名称符合 `secret_*` 规则的变量 `defaultValue`。
- 密码输入目标若仍含字面值，替换为必填 `secret_*` 变量占位符，并清理可能泄露值的提示字段。
- `upload.files` 中非模板化的本机绝对路径替换为必填文件变量。
- URL 用户名/密码和明显 token、key、secret、password、auth 类查询参数移除或变量化。
- Cookie、Header、HAR、Storage State 不属于当前 `FlowDocument` schema；本阶段不导出这些资产，也不宣称对未知业务文本“完全脱敏”。
- 导出 API 同时返回结构化 warnings，UI 必须展示实际处理摘要。

### 3.3 导入语义

- 每次导入都生成新 `flowId`、覆盖目标 `projectId` 并刷新 createdAt/updatedAt。
- 导入前必须确认目标项目已存在，不得为未经验证的 `projectId` 创建目录或数据库。
- 同名时生成稳定可理解的“（导入）”/序号名称；绝不调用普通 upsert 覆盖原 Flow。
- 写入失败不得留下 Flow 或版本半成品。

### 3.4 文件系统安全

- Renderer 不得把任意读写路径传给主进程。
- 主进程通过 Electron `showOpenDialog` / `showSaveDialog` 取得路径并执行有限读写。
- 用户取消选择属于成功取消态，不显示错误、不写入数据。

## 4. 依赖 DAG 与 worktree 轨道

```text
G0 路线锁、合同与执行计划
  └─ G1 flow-dsl 可移植/安全合同（先红后绿）
       ├─ G2 knowledge + local-api 导入新副本
       ├─ G3 extension 导出复用合同
       └─ G4 Web 重命名 UI（与 G1 低耦合，可并行）

G2 完成
  └─ G5 Studio 文件对话框、IPC、导入导出 UI

G2 + G3 + G4 + G5
  └─ G6 往返验收、文档、Node 20/24、CI
```

### Track G1：可移植合同

- 文件所有权：`packages/flow-dsl/**`，必要时仅使用 `@flowweave/shared` 已有工具。
- 先写失败测试覆盖敏感默认值、密码字面量、上传绝对路径、URL 凭据、普通业务文本保留和幂等性。
- 交付稳定公开 API、warnings 类型和裸 JSON 序列化结果。

### Track G2：导入新副本与 API

- 文件所有权：`packages/project-knowledge/**`、`packages/local-api/**`。
- 依赖 G1 的公开合同；导入始终新 ID，名称冲突可理解，目标项目必须存在，失败无副作用。
- 补真实 SQLite、真实 HTTP 合同与错误状态测试。

### Track G3：扩展导出接线

- 文件所有权：`apps/extension/**`。
- 扩展 `MSG_EXPORT_FLOW` 复用 G1；下载文件仍为裸 `FlowDocument`。
- UI 显示 warnings 摘要，不破坏录制状态机与现有命名合同。

### Track G4：Web 任务重命名

- 文件所有权：`apps/web/**`。
- 复用现有 PATCH API；使用并列原生交互元素，不嵌套 button。
- 空名称、失败回滚、成功持久化、快速切换上下文旧响应隔离均有测试。

### Track G5：Studio 文件交互

- 文件所有权：`apps/studio/**`。
- Electron 主进程独占文件路径；preload 只暴露业务方法和结构化结果。
- 覆盖取消、超限、非法 JSON、导入成功刷新并选中新任务、导出 warnings。

## 5. TDD 与集成策略

1. 每轨先提交失败合同或保留可复现红灯命令，再实现最小绿灯。
2. 分轨提交必须通过对应 test、typecheck、lint、build 和 `git diff --check`。
3. 主代理仅在共同合同稳定后集成；不得让 UI worktree 自行修改其他轨所有文件。
4. 每轨独立审查 P0/P1；发现 P1 退回原 Agent 修复并复审。
5. 未安装 coverage provider 时不新增依赖，以修改逻辑的分支/错误/边界合同与全量 smoke 替代，并写入留痕。

## 6. 验收门禁

### 定向门禁

```bash
pnpm --filter @flowweave/flow-dsl test
pnpm --filter @flowweave/project-knowledge test
pnpm --filter @flowweave/local-api test
pnpm --filter @flowweave/app-extension test
pnpm --filter @flowweave/app-extension build
pnpm --filter @flowweave/app-web test
pnpm --filter @flowweave/app-web build
pnpm --filter @flowweave/app-studio test
pnpm --filter @flowweave/app-studio build
```

### 集成门禁

```bash
pnpm lint
CI=1 pnpm smoke
pnpm e2e:recorded-pages
pnpm audit --prod --audit-level high --registry=https://registry.npmjs.org
git diff --check
```

- Node 24 本地完整执行；Node 20.19.6 冻结安装后至少执行 smoke。
- 浏览器验证 Web 重命名与响应式状态。
- Electron 验证导出/导入真实文件、取消选择和失败提示；若桌面自动化工具缺失，记录替代证据。
- 最终以 main Node 20/24 CI 双绿会签。

## 7. Definition of Done

- [ ] 当前与历史扩展裸 JSON 均可校验导入。
- [ ] 导入始终为新副本，无静默覆盖和半写入。
- [ ] 已知敏感默认值、本机路径与明显 URL 凭据按合同处理并返回 warnings。
- [ ] Studio 文件交互不暴露任意路径能力，取消/非法/超限均无副作用。
- [ ] 扩展与 Studio 共享导出合同。
- [ ] Web 重命名持久化且无异步串选。
- [ ] 导出 → 空项目导入 → 运行闭环通过。
- [ ] recorded replay 保持 `25/25`，Node 20/24 与安全门禁通过。
- [ ] P3/P4、vNext 和破坏性删除能力未被混入。
- [ ] 所有 Agent、worktree 与临时进程已回收。

## 8. 回滚策略

- 每轨独立提交，可按轨 revert；G1 公共合同在下游合入前单独验证。
- 导入只新增副本，不改变来源任务；回滚 UI/API 不需要迁移既有 Flow schema。
- 不变更数据库 schema；若集成失败，保留现有导出、同步、运行与 Web 查看主线。
