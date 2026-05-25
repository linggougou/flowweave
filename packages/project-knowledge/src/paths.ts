import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expandHomePath } from "./db/client.js";

/** 默认项目数据根目录 */
export function getDefaultDataDir(): string {
  return "~/.flowweave/projects";
}

/** 单次执行的运行产物目录：`<dataDir>/<projectId>/runs/<executionId>/` */
export function resolveRunDirectory(
  dataDir: string,
  projectId: string,
  executionId: string,
): string {
  const root = expandHomePath(dataDir);
  return join(root, projectId, "runs", executionId);
}

/** 创建运行目录并返回绝对路径 */
export function ensureRunDirectory(
  dataDir: string,
  projectId: string,
  executionId: string,
): string {
  const dir = resolveRunDirectory(dataDir, projectId, executionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}
