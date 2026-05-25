# ADR-0005: SQLite 本地项目知识库

## 状态

已采纳（2026-05-25）

## 背景

MVP 以本地优先：项目、流程、执行索引、页面元数据需结构化查询；截图/HAR/DOM 快照体积大。

## 决策

- `@flowweave/project-knowledge` 使用 **SQLite + Drizzle ORM**。
- 大对象（截图、HAR、DOM）存 **文件系统**，数据库只存路径与哈希索引。
- 默认数据目录：`~/.flowweave/projects/<projectId>/`（可在 studio 配置）。

## 后果

- 单机部署简单，无需首期云服务。
- 同步、多用户协作需后续 ADR 扩展。

## 备选方案

- 纯 JSON 文件：查询与一致性差。
- Postgres：MVP 过重。
