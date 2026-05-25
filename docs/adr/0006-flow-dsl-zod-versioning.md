# ADR-0006: Flow DSL 与 Zod 版本化

## 状态

已采纳（2026-05-25）

## 背景

流程资产需长期存储、AI 生成、导出与迁移；npm 版本与 DSL 结构版本生命周期不同。

## 决策

- 独立包 `@flowweave/flow-dsl` 定义 **NormalizedStep**、**ExecutablePlan**、**Flow**。
- 每个 Flow 文档含 `schemaVersion`（整数，从 `1` 起）。
- 使用 **Zod** 校验；破坏性变更递增 `schemaVersion` 并提供迁移函数。
- 详见 [flow-dsl.md](../domain/flow-dsl.md)。

## 后果

- recorder / runtime / ai-orchestrator 均依赖同一契约。
- 需维护 `migrateFlowVnToVm` 测试。

## 备选方案

- JSON Schema only：TS 侧体验差。
- 无版本字段：升级困难。
