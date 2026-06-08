# Recorded Replay Smoke Matrix

`Recorded Replay Smoke Runner` 用来回答一个更具体的问题：当前主线里已经沉淀下来的 recorded replay 场景，今天还能不能继续从 `RecordedEvent -> buildFlowFromEvents() -> executeFlow()` 这条链路稳定跑通。

当前入口：

- `examples/recorded-replay-smoke.ts`
- `packages/runtime/src/recorded-replay-matrix.test.ts`
- `pnpm e2e:recorded-pages`

## 当前权威口径

当前 recorded replay catalog 以 `examples/recorded-replay-smoke.ts#getRecordedReplayCaseCatalog()` 和 `packages/runtime/src/recorded-replay-matrix.test.ts` 为准：

- 总数固定为 `25`
- 其中 `23` 条为真实 fixture case
- 其中 `2` 条为 runtime-generated case

| 分类 | 数量 | 来源 | 说明 |
| --- | ---: | --- | --- |
| `fixture` | `23` | `examples/fixtures/*.html` | 既属于 recorded replay baseline，也属于 Benchmarks fixture 体系 |
| `runtime-generated` | `2` | 运行期写入 `workspaceDir` 的临时 HTML | 只服务 recorded replay 合同验证，不计入 fixture 总数 |

这 `23` 条真实 fixture case 按当前固定顺序为：

`checkbox-select`、`delayed-panel`、`upload-form`、`spa-route`、`session-dashboard`、`keyboard-command-palette`、`async-command-palette`、`filterable-list`、`modal-bulk-action`、`session-expired-dashboard`、`paginated-list`、`drawer-edit-form`、`toast-popconfirm`、`tabbed-workspace`、`contenteditable-editor`、`empty-results-retry`、`linked-filters`、`session-expired-retry`、`bulk-cross-page-selection`、`drawer-double-save`、`repeated-row-actions`、`rerender-action-panel`、`dialog-save-surface`

额外的 `2` 条 runtime-generated case 为：

| 场景 | 步数 | 运行期资产 | 它证明的合同 |
| --- | ---: | --- | --- |
| `placeholder-disambiguation` | `4` | `workspaceDir/placeholder-disambiguation.html` | 当录制事件只剩宽选择器时，runtime 仍能结合 `placeholder` hint 命中正确输入框 |
| `scroll-runtime-contract` | `5` | `workspaceDir/scroll-runtime-contract.html` | recorded replay 链路中的 `scroll` 事件会被正确归一化、执行并产生可断言的滚动结果 |

## Fixture 与 Runtime-Generated 的区别

`fixture` case 有仓库内的长期 HTML 真源，`getRecordedReplayCaseCatalog()` 会为它们返回 `fixtureFile: ${name}.html`，因此它们天然能和 `docs/guides/fixture-matrix.md`、`pnpm e2e:real-pages` 的 Benchmarks 体系互相对齐。

`runtime-generated` case 则没有仓库内 fixture 文件。runner 会在当前 `workspaceDir` 临时生成页面，再把录制事件喂给同一条 recorded replay 执行链路。它们的职责不是扩充 fixture 矩阵，而是补齐那些更适合用运行期合同表达的回放能力。

## 两条 Runtime-Generated 合同

### `placeholder-disambiguation`

这个 case 使用一张运行期生成的简化表单页，页面里有两个 `input[type="text"]`。录制事件故意只保留宽选择器，但额外携带 `placeholder: "归档原因"` hint。回放成功的标准不是“任意输入框被填上值”，而是只把值写进目标字段，并让 `#submit-status[data-state="matched"]` 命中成功态。

它验证的是 recorded replay 在真实录制信息不够精确时，是否还能利用输入框语义 hint 完成消歧。

### `scroll-runtime-contract`

这个 case 使用一张运行期生成的长页面，录制事件显式包含一次 `scroll` 动作，目标坐标为 `x=0, y=480`。回放链路必须先把页面滚到正确位置，再命中 `#page-scroll-status[data-ready='true'][data-x='0'][data-y='480']`，随后点击“确认滚动完成”，最终命中 `#scroll-result[data-ready='true']`。

它验证的是 recorded replay 不只是“能录点击和输入”，还要对 `scroll` 这类页面级交互保持稳定合同。

## 它证明什么

这条 smoke runner 当前证明的是：

1. recorded event 仍能被 `buildFlowFromEvents()` 正常归一化为可执行 flow。
2. 真实 fixture 上的 `23` 条 recorded replay 基线仍可全量回放。
3. 两条不适合落仓库 fixture 的运行期合同，仍能沿同一执行链路跑通。
4. runner 输出的 `results` 顺序、步数和 `getRecordedReplayCaseCatalog()` 保持一致。

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

`pnpm e2e:real-pages` 的职责，是验证手写 `FlowDocument` 组成的真实页面 fixture 矩阵；当前最新档位是 `p8`，覆盖 `23` 条真实 fixture。

`pnpm e2e:recorded-pages` 的职责，则是验证 recorded replay 闭环本身。它会复用同一批 `23` 条真实 fixture，再额外补 `2` 条 runtime-generated 合同，因此当前总数是 `25`，不是 `23`，也不是旧文档里的 `13`。

## 运行方式

当前统一使用 Node `20.19.6` 验证：

```bash
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/runtime test -- recorded-replay-matrix.test.ts
PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm e2e:recorded-pages
```

## 运行组织方式

Runner 当前组织方式如下：

1. 启动一个仅服务 `examples/fixtures/` 的本地静态服务器。
2. 在临时 `workspaceDir` 中生成上传测试文件与 `storageState`。
3. 在同一个 `workspaceDir` 中额外生成：
   - `placeholder-disambiguation.html`
   - `scroll-runtime-contract.html`
4. 为每个 case 分配独立 `artifactDir`。
5. 汇总所有 case 的结果、耗时、失败列表，并按“真实 fixture 数 + runtime-generated 数”打印摘要。
