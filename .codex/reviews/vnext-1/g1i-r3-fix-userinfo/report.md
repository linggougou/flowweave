# vNext-1 G1-I R3 v1 URL userinfo 变量敏感识别报告

日期：2026-08-30
基线：`7b7180fbc2526b7c01c36f2bba92d21927200738`
分支：`codex/vnext-1-g1i-r3-userinfo`
结论：**PASS**

## 产品修复

- 在 Flow DSL 唯一纯安全 helper 中新增 `inspectUrlUserInfo(value)`：
  - 只返回去除 userinfo 后的 URL、是否移除、模板变量名；不返回用户名或密码字面值。
  - 对 authority 中的 userinfo 至多进行两轮 percent decode。
  - 同时识别 username/password 两侧、单变量与多变量。
- portability 在删除 userinfo 前收集 helper 返回的全部变量名，将普通命名变量也视为敏感引用：移除 default，并强制 `required=true`。
- upgrade 复用相同 helper，将对应 field mapping 标为 `sensitive=true`，不把 default 放入 candidate 或报告。
- raw mixed URL 继续遵循既有 v2 规则返回 blocking；单/双编码模板保持既有合法预览语义，但 default canary 不进入 candidate/report。
- literal userinfo 继续删除；无 userinfo 与普通 query 变量不误判。
- 未修改 Project Knowledge repository/事务、Runtime/UI、依赖或 lockfile。

## TDD RED

首次执行因新 worktree 缺少 `vitest` 被环境阻塞，不计业务 RED；随后使用 Node `v24.14.0`、pnpm `9.15.4` 完成 `CI=1 pnpm install --frozen-lockfile` 后获取正式红灯。

1. Flow DSL focused Judge：**14 failed / 43 passed / 57 total**。
   - helper 合同 8 个失败：raw username、raw password、raw multi、一层编码、两层编码、三个无 userinfo 对照。
   - portability 1 个失败：userinfo 变量 default 仍保留且未设为 required。
   - upgrade 5 个失败：navigate/wait 的 raw/编码 userinfo mapping 均未标敏感。
2. Knowledge v1 public export/import Judge：**1 failed / 46 passed / 47 total**。
   - export/import 结果仍保留 username/password default canary。

## GREEN 与安全证据

- Flow DSL focused：**57/57**。
- Knowledge import-flow：**47/47**。
- Flow DSL 全量：**92/92**。
- Project Knowledge 全量：**151/151**。
- Local API 全量：**14/14**。
- 三包合计：**257/257**。
- 全仓测试：**739/739，21/21 tasks**。

安全断言：

- 覆盖 navigate.url 与 wait.urlIncludes。
- 覆盖 username/password 两侧、单变量、多变量、raw、一层和两层 percent 编码。
- portability 文档、warnings、upgrade candidate/report 均同时验证 raw canary 与 JSON-escaped canary 零回显。
- v1 repository export/import 返回值与 warnings 均无 raw/escaped canary。
- 目标项目 SQLite、WAL、SHM 对 raw/escaped canary 均为零命中。
- literal userinfo 被删除；无 userinfo 与普通 query 变量保持非敏感。

## 完整门禁

| 命令 | 结果 |
|---|---:|
| `CI=1 pnpm install --frozen-lockfile` | PASS，lockfile 未变化 |
| `pnpm --filter @flowweave/flow-dsl --filter @flowweave/project-knowledge --filter @flowweave/local-api test` | PASS，257/257 |
| `pnpm typecheck` | PASS，21/21 tasks |
| `pnpm lint` | PASS，13/13 tasks |
| `pnpm test` | PASS，739/739，21/21 tasks |
| `pnpm build` | PASS，13/13 tasks |
| `git diff --check` | PASS |

Node 20 复审按任务边界留给最终独立复审执行。

## 残余风险

- userinfo 模板识别明确限制为两轮 percent decode；更深编码不会被识别，若未来产品需要扩大上限，必须更新统一 helper 合同与攻击测试，不能由消费者各自追加解码。
- helper 保留既有绝对 URL authority 范围；协议相对 URL 或非 authority scheme 不在本次产品 P1 扩展范围内。
