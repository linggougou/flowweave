# Electron Bundle Integrity 上下文摘要

## 任务定位

- 日期：2026-06-09
- 轨道：Electron Bundle Integrity
- worktree：`/Users/ling/codeHome/A_Mine/flowweave/.worktrees/codex-real-page-residual-electron-bundle`
- 分支：`codex/real-page-residual-electron-bundle`
- 生命周期阶段：S5 开发落地
- 等价路线真源：仓库根缺少物理 `PROJECT_ROUTE_LOCK.md`，本轮按项目 `AGENTS.md` 指向的 `docs/superpowers/plans/2026-05-26-run-first-roadmap.md` 作为当前主线依据
- 当前阶段出口：维持 Studio 本地可启动链路，并把 Electron bundle 残余完整性风险收束为可验证、可解释、可复现的状态
- 最小可验收闭环：`ensure-electron-dist.mjs` 能在 Node 20 下处理 bundle symlink 缺失和 residual signature 风险，且 `codesign --verify --deep --strict .../Electron.app` 可得到明确结果
- 明确非目标：
  - 不改动共享 `.codex/operations-log.md`
  - 不处理其他轨道源码
  - 不把 Electron ABI、知识库 API 或 UI 行为问题混入本次源码修复

## 文件边界

- 允许修改：
  - `apps/studio/scripts/ensure-electron-dist.mjs`
  - `apps/studio/package.json`（本轮未改）
  - `.codex/context-summary-electron-bundle-integrity.md`
- 禁止修改：
  - 其他源码、共享留痕文件、其他 worktree 轨道文件

## 根因审计结论

1. 当前脚本原本只修 `Electron Framework.framework/Electron Framework` symlink 缺失。
2. 在 `Node 20 + pnpm install --frozen-lockfile` 后，脚本可成功重解压官方 Electron 33.4.11 包并恢复 symlink。
3. 但官方 zip 重新解压后的 `Electron.app` 仍会在本机稳定触发：
   - `codesign --verify --deep --strict .../Electron.app`
   - 输出：`code has no resources but signature indicates they must be present`
4. 该问题不是仓库内 symlink 修复失败导致：
   - 临时目录中直接用 `@electron/get` 下载官方 zip，再 `ditto -x -k` 解压，得到同样的严格校验失败。
5. 该问题可以通过本机 ad-hoc 重签名稳定修复：
   - `codesign --force --deep --sign - Electron.app`
   - 重签名后会生成顶层 app、helper app、framework 的 `_CodeSignature/CodeResources`
   - 随后 `codesign --verify --deep --strict Electron.app` 通过

## 实施决策

- 结论：residual risk 可以在仓库脚本内做最小可靠修复，不必退化为“仅告警不修”
- 修复策略：
  1. 保留现有 symlink 缺失检测与官方 zip 重解压逻辑
  2. 无论 symlink 是否原本正常，都追加一次严格签名校验
  3. 仅在校验输出命中已确认根因 `code has no resources but signature indicates they must be present` 时，执行本地 ad-hoc 重签名
  4. 重签名后再次严格校验
  5. 若命中其他未知签名错误，直接失败，不做 ad-hoc 重签名
  6. 若脚本已经判定需要 ad-hoc 重签名，则重签名失败和重签名后复验失败都直接失败，显式反馈给 `postinstall` / `build` / `dev`

## ad-hoc 重签名边界

- 该副作用只用于命中已确认 residual error 的本机 Electron bundle。
- 它不是通用兜底，不负责处理任意 `codesign --verify` 异常。
- 对未知签名错误、未知 bundle 损坏、路径异常、权限异常或其他 `codesign` 失败，脚本不会尝试 ad-hoc 重签名，而是直接失败，把前置条件问题暴露给调用方。
- 因此当前脚本中的 ad-hoc 重签名属于“定向本机修复”，不是“发现任何签名问题都试着改一遍”的广义恢复机制。

## 代码改动摘要

- `apps/studio/scripts/ensure-electron-dist.mjs`
  - 新增严格签名校验函数
  - 新增命令错误输出格式化
  - 新增针对 residual signature 的按需 ad-hoc 重签名逻辑
  - 调整主流程：不再因 symlink 正常而提前退出，而是继续做 bundle 完整性校验
  - 审查收紧：未知签名错误直接失败；ad-hoc 重签名失败和重签名后复验失败也直接失败

## 验证记录

### 与 bundle 修复直接相关

- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm install --frozen-lockfile`
  - 结果：通过；`postinstall` 已跑新脚本
- `rm -rf node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist && PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH node apps/studio/scripts/ensure-electron-dist.mjs`
  - 结果：先重解压恢复 symlink，再自动执行 ad-hoc 重签名，最终严格校验通过
- `codesign --verify --deep --strict node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/Electron.app`
  - 修改前：失败，`code has no resources but signature indicates they must be present`
  - 修改后：通过
- 一次性失败分支取证：
  - 人为篡改 `Info.plist` 形成未知签名错误时，旧脚本只告警并返回 `EXIT_STATUS=0`
  - 用临时 `fake codesign` 模拟 ad-hoc 重签名失败时，旧脚本同样只告警并返回 `EXIT_STATUS=0`
  - 本轮已将这两类情况收紧为显式失败

### 用户要求的验证命令

- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm --filter @flowweave/app-studio build`
  - 结果：通过；脚本输出 `Electron Framework symlink 正常` 与 `Electron bundle 严格签名校验通过`
- `PATH=/Users/ling/.nvm/versions/node/v20.19.6/bin:$PATH pnpm exec electron .`
  - 在仓库根执行：失败，`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "electron" not found`，因为 `electron` 仅声明在 `apps/studio`
  - 在 `apps/studio` 目录执行同一命令：Electron 主进程可启动；补齐 `better-sqlite3` Electron ABI 前会报 `ERR_DLOPEN_FAILED`，补齐后进程可持续运行，但本 worktree 下未观测到实际窗口标题
- `codesign --verify --deep --strict node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/Electron.app`
  - 结果：通过

## 当前结论

- `Electron Bundle Integrity` 本身已从“未收口 residual signature 风险”推进到“脚本可定向修复已确认 residual error，并对未知异常显式失败”
- 当前剩余风险不在 bundle 完整性，而在本 worktree 的 Electron 启动上下文仍受其他前提影响：
  - 根目录没有可直接 `pnpm exec electron` 的二进制暴露
  - `better-sqlite3` 需要 Electron ABI 对应二进制
  - 即使 ABI 已补齐，本 worktree 下仍未稳定复现可见窗口
- 上述剩余项未通过本轮源码修改引入，也不属于本轨唯一允许的改动范围
