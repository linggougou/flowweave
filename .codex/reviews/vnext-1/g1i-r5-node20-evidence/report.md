# vNext-1 G1-I R5 Node 20 独立兼容证据

- 验证时间：2026-08-30 18:23:20 +0800
- 候选提交：`e25ce4093456907715aae098973af6110729b135`
- 分支：`codex/vnext-1-g1i-r5-node20`
- worktree：`/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext1-g1i-r5-node20`
- 验证范围：Node 20 冻结依赖下的全仓 typecheck/test/build、vNext 定向回归与登录 E2E
- 裁决：**PASS**

## 1. 运行时与依赖冻结

所有命令均把 `/Users/ling/.nvm/versions/node/v20.19.6/bin` 放在 `PATH` 最前。

| 检查                                          | 结果                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `node -v`                                     | `v20.19.6`                                                                                        |
| `node -p 'process.execPath'`                  | `/Users/ling/.nvm/versions/node/v20.19.6/bin/node`                                                |
| `pnpm -v`                                     | `9.15.4`                                                                                          |
| `CI=1 pnpm install --frozen-lockfile --force` | PASS，951 个包全部复用，耗时约 5.1 秒                                                             |
| Electron postinstall                          | PASS；仓库脚本重新解压官方 bundle、执行 ad-hoc 重签名并通过严格签名校验                           |
| `pnpm-lock.yaml`                              | 安装前后 SHA-256 均为 `b3416f39ff5fa8413c8503130028e3e0f9c833a627115a2fd16b0781aabcfb9a`，零 diff |

## 2. 无缓存全仓门禁

执行：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH \
  pnpm turbo typecheck test build --force --output-logs=full
```

结果：**PASS**；`39/39` tasks 成功，`0 cached`，耗时 `1m23.536s`。同一次完整日志直接保留逐包测试计数，共 `759/759` tests：

| 包                                |    测试 |
| --------------------------------- | ------: |
| `@flowweave/shared`               |     7/7 |
| `@flowweave/ui`                   |   14/14 |
| `@flowweave/network-intelligence` |     1/1 |
| `@flowweave/flow-dsl`             | 109/109 |
| `@flowweave/ai-orchestrator`      |     1/1 |
| `@flowweave/page-intelligence`    |   22/22 |
| `@flowweave/recorder`             |   54/54 |
| `@flowweave/app-extension`        |   79/79 |
| `@flowweave/project-knowledge`    | 154/154 |
| `@flowweave/local-api`            |   14/14 |
| `@flowweave/app-web`              |   33/33 |
| `@flowweave/app-studio`           | 219/219 |
| `@flowweave/runtime`              |   52/52 |

## 3. vNext 定向回归

完整门禁后再次独立执行下列套件，全部通过：

| 命令                                                                                     | 结果              | Vitest 总耗时 |
| ---------------------------------------------------------------------------------------- | ----------------- | ------------: |
| `pnpm --filter @flowweave/project-knowledge test`                                        | 6 files，154/154  |         1.94s |
| `pnpm --filter @flowweave/flow-dsl test`                                                 | 5 files，109/109  |         240ms |
| `pnpm --filter @flowweave/local-api test`                                                | 1 file，14/14     |         3.47s |
| `pnpm --filter @flowweave/runtime exec vitest run src/playwright-launch-options.test.ts` | 1 file，9/9       |         210ms |
| `pnpm --filter @flowweave/app-studio test`                                               | 40 files，219/219 |         1.54s |

Runtime guard 定向套件包含 v2 与畸形 `schemaVersion` 在运行副作用前的拒绝合同；Studio 全套包含 `electron/services.test.ts` 的运行入口 guard。上述计数是对全仓 `759/759` 的重复定向复验，不与全仓计数相加。

## 4. 登录 E2E

`pnpm e2e:login`：**PASS**。执行状态为 `success`，4 个步骤全部成功（4/4）：

- `s1` success（47ms）
- `s2` success（60ms）
- `s3` success（67ms）
- `s4` success（385ms）

## 5. 失败、重跑与完整性

- 产品验证失败：0。
- 环境验证失败：0。
- 因失败而重跑：0。
- 跳过项：0。
- 安装完成后及写证据前，`git status --short`、`git diff --name-only`、受保护路径 diff 与 lockfile diff 均为空。
- Electron bundle 修复与 E2E 本地运行产物均位于 Git 忽略路径或 `~/.flowweave/projects/`，没有改动候选产品代码、配置或 lockfile。
- 本证据提交只允许新增本目录的 `report.md` 与 `results.json`。

## 6. 结论与边界

候选 `e25ce4093456907715aae098973af6110729b135` 在真实 Node `20.19.6`、冻结 lockfile、强制重装、Turbo `--force` 且 `0 cached` 的条件下，通过 `39/39` 全仓 typecheck/test/build tasks、`759/759` tests、五组定向回归及登录 E2E 4/4。Node 20 兼容门禁裁决为 **PASS**。

本报告只提供 Node 20 兼容证据，不替代 Node 24/安全轨、最终集成 Judge、用户验收、发布或 vNext-2 路线解冻。
