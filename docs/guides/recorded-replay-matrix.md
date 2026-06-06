# Recorded Replay Smoke Matrix

`Recorded Replay Smoke Runner` 用来回答一个更具体的问题：当前主线里已经沉淀下来的 recorded replay 场景，今天还能不能直接从 `RecordedEvent -> buildFlowFromEvents() -> executeFlow()` 这条链路稳定跑通。

当前入口：

- `examples/recorded-replay-smoke.ts`
- `packages/runtime/src/recorded-replay-matrix.test.ts`
- `pnpm e2e:recorded-pages`

## 它证明什么

这条 smoke runner 当前覆盖 `12` 条 recorded replay 基线场景，既包含主线原有的 `7` 条 baseline，也包含 Wave 7 与 Wave 8 逐步纳入的 `5` 条高价值真实页面场景：

| 场景                         | 证明的链路                            |
| ---------------------------- | ------------------------------------- |
| `upload-form`                | 文件上传变量回放                      |
| `spa-route`                  | SPA 路由切换后的继续点击              |
| `filterable-list`            | 录制筛选变量与结果摘要定位            |
| `contenteditable-editor`     | `contenteditable` 填写与保存          |
| `session-expired-retry`      | `storageStatePath` 驱动的会话恢复重试 |
| `bulk-cross-page-selection`  | 跨页勾选与批量提交                    |
| `repeated-row-actions`       | `scopeText / scopeKind` 行级消歧      |
| `keyboard-command-palette`   | `fill -> ArrowDown -> Enter` 命令面板 |
| `linked-filters`             | 联动筛选与异步结果稳定命中            |
| `session-dashboard`          | 登录态仪表盘 recorded replay          |
| `drawer-double-save`         | 首次失败后修正并二次保存              |
| `placeholder-disambiguation` | placeholder hint 驱动的输入框消歧     |

Runner 输出的 summary 协议包含这些核心字段：

- `profile`
- `baseUrl`
- `workspaceDir`
- `results`
- `failed`
- `successCount`
- `failureCount`
- `totalDurationMs`
- `averageDurationMs`

其中每条 `result` 都会带：

- `name`
- `status`
- `stepCount`
- `durationMs`
- `artifactDir`
- `message`

## 和 `pnpm e2e:real-pages` 的区别

`pnpm e2e:real-pages` 的职责，是验证手写 `FlowDocument` 组成的真实页面 fixture 矩阵；它覆盖面更广，重点是“手写流程 + 本地页面夹具”的整体稳定性。

`pnpm e2e:recorded-pages` 的职责，则是把焦点缩到“已经录出来的 recorded events 是否还能被正常归一化并回放”。它不是要替代 `real-pages`，而是给 recorded replay 闭环提供一个独立、快速、可单跑的 smoke 入口。

## 运行方式

Wave 7 这条轨道要求统一使用 Node `20.19.6` 验证：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
```

## 运行组织方式

Runner 复用了 `examples/real-page-smoke.ts` 的本地组织思路：

- 启动一个仅服务 `examples/fixtures/` 的本地静态服务器
- 在临时工作目录里生成上传文件与 `storageState`
- 为每个 case 分配独立 `artifactDir`
- 在结束时汇总所有 case 的结果、耗时与失败列表

目前唯一的临时例外是 `placeholder-disambiguation`。因为它还没有进入 `examples/fixtures/`，runner 会在临时工作目录里生成一个一次性的本地 HTML fixture，再按同样的 recorded replay 链路执行。
