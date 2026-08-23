import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { FlowWeaveError } from "@flowweave/shared";

import { expandHomePath } from "./db/client.js";

const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** 破坏性或路径相关能力共用的单段标识校验。 */
export function assertSafeResourceId(
  value: unknown,
  label = "资源标识",
): asserts value is string {
  if (typeof value !== "string" || !RESOURCE_ID_PATTERN.test(value)) {
    throw new FlowWeaveError("VALIDATION_FAILED", `${label}格式无效`);
  }
}

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
  assertSafeResourceId(projectId, "项目标识");
  assertSafeResourceId(executionId, "执行标识");
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
