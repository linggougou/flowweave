# 织流 / FlowWeave

织流是一个通用网页流程自动化与页面智能分析平台。

它的目标不是简单录制网页点击，而是把网页项目逐步沉淀为可执行、可维护、可诊断、可优化的自动化资产。平台会围绕录制引擎、执行引擎、页面理解、接口理解、AI 编排和项目知识库持续扩展。

## 当前仓库结构

```text
flowweave/
├── apps/                 # 面向用户的应用入口
│   ├── studio/           # 桌面工作台
│   ├── extension/        # 浏览器扩展
│   └── web/              # Web 控制台
├── packages/             # 核心能力包
│   ├── recorder/
│   ├── runtime/
│   ├── page-intelligence/
│   ├── ai-orchestrator/
│   ├── project-knowledge/
│   └── shared/
├── docs/                 # 设计、计划与产品文档
├── examples/             # 示例与演示素材
├── scripts/              # 工具脚本
└── .codex/               # 任务上下文、操作日志与验证记录
```

## 已有文档

1. 产品设计文档：`docs/superpowers/specs/2026-05-25-web-automation-platform-design.md`
2. 初始化计划：`docs/superpowers/plans/2026-05-25-flowweave-bootstrap-plan.md`

## 下一步讨论建议

1. 完整功能地图
2. 产品信息架构
3. 核心页面与交互流
4. 技术栈与首批工程约束
