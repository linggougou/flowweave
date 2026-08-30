# vNext-1 G1-I Node 20 独立验证报告

- 验证日期：2026-08-30
- 候选提交：`cccd818aadee53f090caf7bf6c0f265d9e8beb8f`
- 分支：`codex/vnext-1-g1i-node20`
- worktree：`/Volumes/2T/CODE/A_Mine/flowweave-worktrees/vnext1-g1i-node20`
- 裁决：**PASS**

## 1. 运行时与依赖冻结证明

所有验证命令都把 `/Users/ling/.nvm/versions/node/v20.19.6/bin` 放在 `PATH` 最前。

| 检查 | 结果 |
| --- | --- |
| `node -v` | `v20.19.6` |
| `node -p 'process.execPath'` | `/Users/ling/.nvm/versions/node/v20.19.6/bin/node` |
| `pnpm --version` | `9.15.4` |
| `pnpm install --frozen-lockfile --force` | PASS，951 个包全部复用，约 4.6 秒 |
| Electron postinstall | PASS，官方 zip 重新解压、ad-hoc 重签名及严格签名校验均成功 |
| lockfile 一致性 | PASS，工作树与 `HEAD` 的 `pnpm-lock.yaml` hash 均为 `e44abecd39109efc23b635c979b345ec31a745ab` |

## 2. Fresh 全仓门禁

执行：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH \
  pnpm turbo typecheck test build --force --output-logs=errors-only
```

结果：**PASS**。`39/39` tasks 成功，`0` cache，耗时 `1m27.576s`。这次运行同时覆盖全仓 typecheck、test、build，且 `--force` 保证没有用 Turbo 缓存代替执行。

为提取测试计数，额外执行一次 fresh 测试证据命令：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH \
  pnpm turbo test --force --output-logs=full
```

结果：**PASS**，`21/21` tasks，`0` cache，`663/663` tests，耗时 `1m25.384s`。第二次测试不是失败重跑，仅用于保留逐包测试计数。

逐包测试计数：

| 包 | 测试 |
| --- | ---: |
| `@flowweave/shared` | 7/7 |
| `@flowweave/ui` | 14/14 |
| `@flowweave/network-intelligence` | 1/1 |
| `@flowweave/flow-dsl` | 61/61 |
| `@flowweave/ai-orchestrator` | 1/1 |
| `@flowweave/page-intelligence` | 22/22 |
| `@flowweave/recorder` | 54/54 |
| `@flowweave/app-extension` | 79/79 |
| `@flowweave/project-knowledge` | 106/106 |
| `@flowweave/local-api` | 14/14 |
| `@flowweave/app-web` | 33/33 |
| `@flowweave/app-studio` | 219/219 |
| `@flowweave/runtime` | 52/52 |

## 3. 指定定向套件

以下套件在 fresh 全仓门禁后再次独立执行，全部通过：

| 命令 | 结果 | Vitest 耗时 |
| --- | --- | ---: |
| `pnpm --filter @flowweave/project-knowledge test` | 6 files，106/106 | 1.89s |
| `pnpm --filter @flowweave/local-api test` | 1 file，14/14 | 554ms |
| `pnpm --filter @flowweave/app-studio test` | 40 files，219/219 | 1.85s |
| `pnpm --filter @flowweave/app-web test` | 9 files，33/33 | 841ms |
| `pnpm --filter @flowweave/app-extension test` | 7 files，79/79 | 374ms |

定向套件合计 `451/451` tests。这里的计数是全仓 `663/663` 的重复定向复验，不与全仓计数相加。

## 4. 关键 E2E 与 recorded replay

| 命令 | 结果 | 关键计数/耗时 |
| --- | --- | --- |
| `pnpm e2e:login` | PASS | 4/4 steps，执行状态 `success` |
| `pnpm e2e:portability` | PASS | 10 steps，4 warnings，smoke 1437ms |
| `pnpm e2e:recorded-pages` | PASS | 25/25 场景（23 个真实 fixture + 2 个运行期临时页），0 失败，总耗时 51175ms |

recorded replay 覆盖 baseline 档位，包含 `scroll-runtime-contract`、`placeholder-disambiguation`、`async-command-palette`、`upload-form` 等全部 25 个当前基准场景。计划要求的登录、portability 与 recorded replay 在 Node 20 环境均可运行，因此没有跳过项。

## 5. 失败、重跑与工作树完整性

- 产品验证失败：0。
- 环境验证失败：0。
- 因失败而重跑：0。
- `pnpm install --force` 的 Electron postinstall 发现当前 worktree 的 bundle symlink 缺失，并按仓库脚本完成重新解压与重签名；命令最终成功，未改候选代码或 lockfile。
- 写证据前：`git diff --name-only` 为 0，`git diff --cached --name-only` 为 0，`git diff --check` 通过，`git status --porcelain=v1` 为空。
- 写证据后只允许本目录的 `report.md` 与 `results.json` 出现在提交中；候选代码、配置与 lockfile 保持零改动。

## 6. 结论

候选提交在真实 Node `20.19.6`、冻结 lockfile、fresh/force 安装与零 Turbo cache 条件下，通过全仓 typecheck/test/build、`663/663` 测试、五个指定定向套件，以及登录、portability、recorded replay 三条关键 E2E。Node 20 兼容门禁裁决为 **PASS**。
