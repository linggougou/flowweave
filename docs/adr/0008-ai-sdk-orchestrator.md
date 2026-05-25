# ADR-0008: Vercel AI SDK 编排层

## 状态

已采纳（2026-05-25）

## 背景

`ai-orchestrator` 需：自然语言生成 Flow、基于知识库优化建议、结构化输出。需支持多模型与后续 Gateway。

## 决策

- 使用 **Vercel AI SDK** 作为 LLM 调用层。
- 输出必须经过 Zod 校验，再写入 `flow-dsl` 结构。
- **P4 阶段**再实现；P1–P3 不阻塞主链路。

## 后果

- 与现有 Vercel 技能栈一致。
- API Key 仅存本机配置，不入仓库。

## 备选方案

- 直接调用 OpenAI SDK：多模型路由需自研。
