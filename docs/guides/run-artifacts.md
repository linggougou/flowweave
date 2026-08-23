# 运行产物目录说明

每次 Flow 执行会在本地落盘调试产物，默认路径：

```text
~/.flowweave/projects/<projectId>/runs/<executionId>/
```

由 `@flowweave/project-knowledge` 的 `allocateRunDirectory` 创建，`@flowweave/runtime` 写入文件。

## 文件说明

| 文件 | 来源 | 用途 |
|------|------|------|
| `step-0.png`, `step-1.png`, … | Playwright 每步截图 | 回放失败时肉眼对比页面状态 |
| `page-0.json`, … | navigate 后 DOM 摘要 | 页面 URL、标题、表单/按钮/链接数量 |
| `network.har` | Chromium HAR（minimal） | 接口排查；**含敏感头，勿提交 Git** |

## 与知识库关系

- **SQLite**（`store.sqlite`）仅存：执行元数据、步骤状态、`screenshot_path` 等**路径字符串**，不存 BLOB。
- Studio renderer 不接收或展示这些绝对路径。用户可在 Studio 的“运行记录 → 专业诊断”中点击“步骤截图”，由 Electron 主进程根据项目、执行和步骤业务标识推导固定 `step-<N>.png`，完成归属、文件类型、大小、PNG 头和读取期间身份校验后，以短生命周期 Blob URL 只读内嵌预览。
- Web / Local API 不提供运行产物文件读取能力；页面摘要与诊断信息只以结构化数据展示，HAR 仍仅供本机人工排查。

## 清理

可手动删除整个 `runs/` 子目录释放空间；删除不影响 Flow 定义，仅丢失该次执行的调试文件。
