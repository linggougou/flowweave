# ADR-0010: 主进程持有的可暂停 Runtime 输入会话

## 状态

提议采纳（vNext-0，2026-08-24；设计门禁通过前不实施）

## 背景

当前 Runtime 在一个 Promise 内按 `FlowDocument.steps[]` 顺序执行，并在函数 `finally` 中关闭 Playwright 资源；Electron 的 `runFlow` IPC 直到整条流程终态才返回。vNext schema 2 将新增 `type: "input"` 的输入节点：执行必须在节点处等待 Studio 提交，然后保留同一页面从下一节点继续。

该能力同时引入控制面与敏感数据风险：

- renderer 可能重复、迟到或跨窗口提交；
- 等待期间 Page、窗口、renderer、应用或主进程可能退出；
- 当前执行上下文会持久化 variables，runtime 默认可能产生 HAR、截图和诊断；
- Electron structured clone 与 JavaScript 字符串不能保证物理清零。

需要在实现前冻结会话所有权、状态机、IPC、幂等、资源和敏感值边界。

## 决策

1. **Electron 主进程独占会话。** 主进程生成并持有 `executionId + sessionId`、Runtime session、AbortController、当前 input request、sequence 与安全 snapshot。renderer 只通过 preload 的固定具名 API 发命令、收安全事件。
2. **Runtime 保存浏览器资源与顺序游标。** 到达 input 节点后进入 `waitingForInput`，保留同一个 BrowserContext/Page；合法输入一次性接受后完成该节点，并从下一节点继续。终态统一在 `finally` 关闭资源。
3. **严格身份绑定。** 输入命令同时绑定 sessionId、executionId、inputRequestId、inputNodeId 与 clientCommandId；inputNodeId 等于 DSL step.id，values 仅以 fieldId 为键。每个请求只接受一次，sequence 是事件顺序真源。
4. **严格 Electron 边界。** 所有新命令校验 owner window、webContents、main frame 和精确文档 URL；无动态 IPC channel，不把 Browser/Page、文件路径、session 恢复 token 或原始 ipcRenderer 暴露给 renderer。
5. **第一版单活跃会话。** 每个 Studio 应用最多一个活跃 session、每个 session 一个 pending input request；第二次 start fail closed。Local API/Web 不开放控制能力。
6. **不做持久化恢复。** 同一受信 webContents 的 renderer reload 可用不含输入值的安全 snapshot 重连；窗口关闭、renderer crash/OOM/killed、clean-exit 重连超时、应用退出或主进程崩溃都取消/失败。session、input request、Page 和输入值不落盘，关闭 Studio 后不能恢复。
7. **敏感值 fail closed。** `sensitive: true` 是唯一判定来源；敏感值不得进入 Flow、日志、错误、普通历史、最近值、步骤诊断或 artifact。Flow 声明任一敏感字段即从启动禁用 HAR；首次接受敏感值后永久禁用后续 screenshot、DOM/page snapshot。错误/诊断不得含插值后的 step、locator、URL 或输入值。Runtime 终态必须提供物理字段 `artifactSafety`（policyVersion、flowHasSensitiveFields、sensitiveValueAccepted、harCaptured、可选 sensitiveAcceptedAtStepIndex）；它只是可与 Flow 和实际 artifact refs 交叉校验的策略声明，不是内容无秘密的证明。声明或引用矛盾时 project-knowledge 拒绝落盘，最终仍以 canary 泄露扫描验收。
8. **只承诺逻辑清理。** renderer、preload、main 和 runtime 在 ACK/终态尽快删除引用并关闭 context；不宣称 V8/structured clone 的底层内存已物理覆写。

完整协议、故障矩阵和测试合同见 [`vnext-runtime-input-session.md`](../design-docs/vnext-runtime-input-session.md)。

## 后果

### 正向后果

- renderer 与网页执行内核继续隔离，输入请求不能凭 ID 被其他窗口接管。
- 页面无需重建，线性流程能在真实上下文中暂停后继续。
- sessionId 与 executionId 分离，控制身份不会进入普通执行历史。
- 单会话与一次性请求显著降低并发、幂等、backpressure 和资源争用复杂度。
- 敏感 artifact 策略在采集前关闭高风险通道，而不是依赖事后猜测脱敏。

### 成本与限制

- Runtime API 从一次性函数扩展为会话对象，需要维护状态、游标、timer 与资源所有权。
- Electron invoke 启动语义必须变为立即 ACK，并以事件/安全 snapshot 驱动后续 UI。
- 等待时网页自身仍可能变化，继续前必须重新检查 Page；不自动从头重跑。
- Studio 关闭后只能重启执行，不能断点恢复。
- 含敏感字段的流程失去 HAR，提交敏感值后失去截图/页面快照，诊断信息会更少。
- JavaScript 环境只能缩短秘密引用生命周期，不能提供安全内存保证。

## 被否决方案

### renderer 持有 Runtime 或 Playwright 对象

否决。它破坏 context isolation，扩大 XSS/renderer compromise 的权限，并无法可靠约束跨窗口提交和本地路径能力。

### 通过 Local API/HTTP 提交输入

否决。第一版是本机单人 Studio 能力；HTTP 会增加 origin、CSRF、认证、端口暴露和重放面，也让 Web 误获得控制权。

### 每到输入节点关闭浏览器，提交后重放到断点

否决。重放可能重复创建/修改业务实体，不能保证幂等，也丢失真实页面上下文。

### 把 continuation token、输入值和 Page 状态落盘以支持关闭后恢复

否决。Playwright 页面状态不能安全完整序列化；持久化敏感值和控制 token 扩大泄露面，且超出 vNext 第一版明确边界。

### 继续允许多个 active execution

否决。等待输入会放大浏览器资源、UI 归属、取消和事件排队复杂度；第一版先以单活跃会话获得可验收闭环。

### 采集后再对 HAR、截图和 DOM 做通用脱敏

否决。第一版没有可证明覆盖网页任意编码、图片像素、请求正文和动态 DOM 的脱敏管线；默认禁用是唯一可验证的安全策略。

## 实施门禁

- Runtime、Electron、Studio、persistence 和 E2E 测试合同全部通过；
- canary secret 对 SQLite/WAL、run artifacts、日志、错误、API、最近值和导出全扫描零命中；
- 子 frame、错误 origin、旧 renderer、跨窗口、重复/迟到提交全部 fail closed；
- renderer crash、窗口关闭、app quit 与 main crash 故障注入无敏感持久化；main crash 后无 Chromium 孤儿；
- 独立安全审查无未关闭 P0/P1。
