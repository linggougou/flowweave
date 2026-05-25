# FlowWeave 初始化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/Users/ling/codeHome/A_Mine/flowweave` 初始化“织流”项目的目录骨架、基础说明文件与 Git 仓库。

**Architecture:** 使用 monorepo 作为根结构，先划分 `apps`、`packages`、`docs`、`examples`、`scripts` 与 `.codex` 六类目录，保证后续可以容纳插件端、桌面端、网页端、核心引擎与文档体系。初始化阶段只创建最小但清晰的骨架，不预设具体业务代码。

**Tech Stack:** Git、Markdown、Node.js workspace 目录约定

---

### Task 1: 创建项目根目录与顶层骨架

**Files:**
- Create: `/Users/ling/codeHome/A_Mine/flowweave/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/apps/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/packages/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/docs/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/examples/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/scripts/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/.codex/`

- [ ] **Step 1: 创建顶层目录**

Run: `mkdir -p /Users/ling/codeHome/A_Mine/flowweave/{apps,packages,docs,examples,scripts,.codex}`
Expected: 命令成功，无报错

- [ ] **Step 2: 初始化 Git 仓库**

Run: `git init /Users/ling/codeHome/A_Mine/flowweave`
Expected: 输出 `Initialized empty Git repository`

### Task 2: 创建子模块目录

**Files:**
- Create: `/Users/ling/codeHome/A_Mine/flowweave/apps/studio/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/apps/extension/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/apps/web/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/packages/recorder/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/packages/runtime/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/packages/page-intelligence/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/packages/ai-orchestrator/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/packages/project-knowledge/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/packages/shared/`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/docs/superpowers/specs/`

- [ ] **Step 1: 创建应用与包目录**

Run: `mkdir -p /Users/ling/codeHome/A_Mine/flowweave/apps/{studio,extension,web} /Users/ling/codeHome/A_Mine/flowweave/packages/{recorder,runtime,page-intelligence,ai-orchestrator,project-knowledge,shared} /Users/ling/codeHome/A_Mine/flowweave/docs/superpowers/specs`
Expected: 命令成功，无报错

### Task 3: 写入基础说明文件

**Files:**
- Create: `/Users/ling/codeHome/A_Mine/flowweave/README.md`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/.gitignore`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/package.json`
- Create: `/Users/ling/codeHome/A_Mine/flowweave/.codex/operations-log.md`

- [ ] **Step 1: 写入 README**

内容需要说明项目名称“织流 / FlowWeave”、产品定位、目录结构和下一步讨论入口。

- [ ] **Step 2: 写入 `.gitignore`**

内容至少覆盖 `node_modules/`、`dist/`、`.DS_Store`、`.env*`、日志文件和构建缓存。

- [ ] **Step 3: 写入 `package.json`**

内容使用最小 workspace 结构，声明：

```json
{
  "name": "flowweave",
  "private": true,
  "version": "0.1.0",
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

- [ ] **Step 4: 写入操作日志**

记录本次初始化动作，以及当前环境中 `sequential-thinking`、`desktop-commander` 不可直接调用，改用本地命令完成的说明。

### Task 4: 验证初始化结果

**Files:**
- Verify: `/Users/ling/codeHome/A_Mine/flowweave/`

- [ ] **Step 1: 查看目录树**

Run: `find /Users/ling/codeHome/A_Mine/flowweave -maxdepth 3 -type d | sort`
Expected: 能看到 `apps`、`packages`、`docs/superpowers/specs`、`.codex` 等目录

- [ ] **Step 2: 检查 Git 状态**

Run: `git -C /Users/ling/codeHome/A_Mine/flowweave status --short`
Expected: 输出新建文件列表，且无报错
