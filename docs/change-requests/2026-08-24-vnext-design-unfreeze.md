# vNext 设计阶段解冻变更单

## 1. 变更请求

- 日期：2026-08-24
- 请求：解冻 vNext 设计阶段
- 用户原文：`可以,解冻vNext 设计阶段`
- 授权解释：允许进入 vNext-0 产品、UX 与技术协议设计；不自动授权业务代码、数据库迁移、P3 或 P4。

## 2. 现路线问题

P2.8 已完成并归档，现有 vNext 产品草案已经确认“交互式任务模板”方向，但仍缺少进入编码所必需的四类合同：

1. 输入节点与变量模型的唯一数据真源。
2. Flow schema 版本与旧 Flow 迁移、导入导出、回滚策略。
3. Studio 线性编辑、变量来源/消费与搜索后选择的交互合同。
4. Runtime / Electron 等待输入、继续、取消、失败和敏感值生命周期。

继续在旧路线下只维护 v1，无法合法产出这些 vNext 前置真源；直接编码又会绕过生命周期门禁。

## 3. 影响范围

本阶段只允许修改：

- `PROJECT_ROUTE_LOCK.md`
- `docs/change-requests/`
- `docs/exec-plans/`
- `docs/superpowers/specs/`
- `docs/design-docs/`
- `docs/adr/`
- `.codex/` 留痕与审查包

本阶段不得修改：

- `apps/`、`packages/`、数据库 migration、构建配置和生产协议实现
- P3 page/network intelligence 深度能力
- P4 AI orchestrator 与产品入口

## 4. 生命周期与里程碑变化

- 原状态：P2.8 S7 完成，下一阶段未开启。
- 新状态：vNext S1-S4 产品定义、体验设计和技术设计。
- 新里程碑：vNext-0 设计门禁。
- 阶段出口：设计真源、ADR、验收合同、风险台账与实施 DAG 经独立 Judge 判定 PASS。

## 5. 迁移与回滚

- 迁移：以 P2.8 已归档 main 为稳定基线，只新增/修订设计文档，不迁移用户数据。
- 回滚：若设计审查 REJECT 或用户撤回方向，删除未合入的设计分支/worktree，路线锁恢复为“下一阶段未开启”；业务代码与已有 Flow 不受影响。
- 后续：进入任何 vNext 实现前，必须基于冻结 DAG 再次更新路线锁。

## 6. 批准记录

用户已于 2026-08-24 明确批准解冻 vNext 设计阶段。本变更单不扩大该授权。
