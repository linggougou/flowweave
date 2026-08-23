## 结论

PASS。G1 删除核心轨已经达到 P2.7 的高风险门禁，可以作为后续 Studio 接入的基础能力。

## 为什么

- 删除入口先做严格 ID 与真实项目探测，阻断 traversal、ghost project 和无副作用前置失败。
- 文件系统路径按 quarantine rename、数据库事务、白名单逐项清理执行，失败时能回滚或留下受控 quarantine。
- 未知文件、子目录、symlink、FIFO 都会在数据库变更前 fail closed。
- Local API 只收紧运行目录分配，没有引入任何破坏性 HTTP 能力。

## 必须修改

无。

## 证据

- 提交：`87f970e`
- 文件：`packages/project-knowledge/src/repository.ts`、`packages/project-knowledge/src/paths.ts`、`packages/project-knowledge/src/execution-deletion.test.ts`、`packages/local-api/src/index.ts`
- 验证：`pnpm --filter @flowweave/project-knowledge test`、`pnpm --filter @flowweave/project-knowledge typecheck`、`pnpm --filter @flowweave/local-api test`、`pnpm --filter @flowweave/local-api typecheck`
- 故障注入：事务失败回滚、身份漂移恢复、cleanup failure 保留 quarantine、未知产物 fail closed 均有定向用例
