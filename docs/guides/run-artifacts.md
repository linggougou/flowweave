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
- Studio / Web 步骤表展示路径；Studio v1 支持点击路径用系统默认应用打开截图。

## 清理

可手动删除整个 `runs/` 子目录释放空间；删除不影响 Flow 定义，仅丢失该次执行的调试文件。
