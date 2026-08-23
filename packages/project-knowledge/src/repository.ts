import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  type Dirent,
  type Stats,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { FlowDocument } from "@flowweave/flow-dsl";
import { createPortableFlowDocument, parseFlowDocument } from "@flowweave/flow-dsl";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { FlowWeaveError } from "@flowweave/shared";

import {
  closeProjectDatabase,
  expandHomePath,
  openExistingProjectDatabaseReadOnly,
  openProjectDatabase,
  type ProjectDatabaseNativeOptions,
  resolveProjectStorePath,
} from "./db/client.js";
import { assertSafeResourceId, resolveRunDirectory } from "./paths.js";
import * as dbSchema from "./db/schema.js";
import type { PageSnapshotSummary } from "@flowweave/page-intelligence";

import type {
  ExecutionRunContext,
  ExecutionResult,
  ExecutionDeletionResult,
  ExecutionScreenshotPreviewResult,
  ExecutionWithProject,
  FlowImportResult,
  FlowVersionRecord,
  PageSnapshotRecord,
  ProjectEnvironment,
  ProjectRef,
  StepLog,
} from "./types.js";

const EXECUTION_STATUSES = ["success", "failed", "cancelled"] as const;
const STEP_STATUSES = ["passed", "failed", "skipped"] as const;
const PROJECT_ENVIRONMENT_STORAGE_STATE_COLUMN = "storage_state_path";
const EXECUTION_STEP_DIAGNOSTIC_PATH_COLUMN = "diagnostic_path";
const EXECUTION_FLOW_SNAPSHOT_JSON_COLUMN = "flow_snapshot_json";
const EXECUTION_ENVIRONMENT_NAME_COLUMN = "environment_name";
const EXECUTION_BASE_URL_COLUMN = "base_url";
const EXECUTION_STORAGE_STATE_PATH_COLUMN = "storage_state_path";
const EXECUTION_VARIABLES_JSON_COLUMN = "variables_json";
const RUN_ARTIFACT_NAME_PATTERNS = [
  /^network\.har$/,
  /^step-\d+\.png$/,
  /^page-\d+\.json$/,
  /^step-\d+-diagnostic\.json$/,
] as const;
const PAGE_SNAPSHOT_NAME_PATTERN = /^page-\d+\.json$/;
const EXECUTION_SCREENSHOT_MAX_STEP_INDEX = 1_000_000;
const EXECUTION_SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
const EXECUTION_SCREENSHOT_MAX_DIMENSION = 8192;
const EXECUTION_SCREENSHOT_MAX_PIXELS = 40_000_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

type FileIdentity = {
  dev: number;
  ino: number;
  mode: number;
};

type ScreenshotFileIdentity = FileIdentity & {
  size: number;
  nlink: number;
  mtimeMs: number;
  ctimeMs: number;
};

class MissingLocalPathError extends Error {}

function isMissingPathError(error: unknown): boolean {
  return error instanceof MissingLocalPathError;
}

function invalidLocalAsset(message: string): FlowWeaveError {
  return new FlowWeaveError("VALIDATION_FAILED", message);
}

function assertDirectoryWithoutSymlink(path: string, label: string): FileIdentity {
  let stats: Stats;
  try {
    stats = lstatSync(path);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new MissingLocalPathError();
    }
    throw new FlowWeaveError("UNKNOWN", `${label}不可访问`);
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw invalidLocalAsset(`${label}结构不安全`);
  }
  return { dev: stats.dev, ino: stats.ino, mode: stats.mode };
}

function assertRegularFileWithoutSymlink(path: string, label: string): FileIdentity {
  let stats: Stats;
  try {
    stats = lstatSync(path);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new MissingLocalPathError();
    }
    throw new FlowWeaveError("UNKNOWN", `${label}不可访问`);
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw invalidLocalAsset(`${label}结构不安全`);
  }
  return { dev: stats.dev, ino: stats.ino, mode: stats.mode };
}

function assertSameDirectoryIdentity(path: string, expected: FileIdentity, label: string): void {
  const actual = assertDirectoryWithoutSymlink(path, label);
  if (
    actual.dev !== expected.dev ||
    actual.ino !== expected.ino ||
    actual.mode !== expected.mode
  ) {
    throw invalidLocalAsset(`${label}在维护期间发生变化`);
  }
}

function assertSameFileIdentity(path: string, expected: FileIdentity, label: string): void {
  const actual = assertRegularFileWithoutSymlink(path, label);
  if (
    actual.dev !== expected.dev ||
    actual.ino !== expected.ino ||
    actual.mode !== expected.mode
  ) {
    throw invalidLocalAsset(`${label}在维护期间发生变化`);
  }
}

function toScreenshotFileIdentity(stats: Stats): ScreenshotFileIdentity {
  return {
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    size: stats.size,
    nlink: stats.nlink,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
  };
}

function sameScreenshotFileIdentity(
  actual: ScreenshotFileIdentity,
  expected: ScreenshotFileIdentity,
): boolean {
  return (
    actual.dev === expected.dev &&
    actual.ino === expected.ino &&
    actual.mode === expected.mode &&
    actual.size === expected.size &&
    actual.nlink === expected.nlink &&
    actual.mtimeMs === expected.mtimeMs &&
    actual.ctimeMs === expected.ctimeMs
  );
}

function assertScreenshotFileStats(stats: Stats): ScreenshotFileIdentity {
  if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1) {
    throw invalidLocalAsset("执行截图结构不安全");
  }
  if (
    !Number.isSafeInteger(stats.size) ||
    stats.size < 0 ||
    stats.size > EXECUTION_SCREENSHOT_MAX_BYTES
  ) {
    throw invalidLocalAsset("执行截图大小无效");
  }
  return toScreenshotFileIdentity(stats);
}

function lstatExecutionScreenshot(path: string): ScreenshotFileIdentity {
  let stats: Stats;
  try {
    stats = lstatSync(path);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new MissingLocalPathError();
    }
    throw new FlowWeaveError("UNKNOWN", "执行截图不可访问");
  }
  return assertScreenshotFileStats(stats);
}

function parsePngDimensions(bytes: Buffer): { width: number; height: number } {
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw invalidLocalAsset("执行截图不是有效的 PNG");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (
    width === 0 ||
    height === 0 ||
    width > EXECUTION_SCREENSHOT_MAX_DIMENSION ||
    height > EXECUTION_SCREENSHOT_MAX_DIMENSION ||
    width * height > EXECUTION_SCREENSHOT_MAX_PIXELS
  ) {
    throw invalidLocalAsset("执行截图尺寸无效");
  }
  return { width, height };
}

function assertSafeRunArtifacts(runDirectory: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(runDirectory, { withFileTypes: true });
  } catch {
    throw invalidLocalAsset("运行产物在维护期间发生变化，已停止删除");
  }
  for (const entry of entries) {
    if (!RUN_ARTIFACT_NAME_PATTERNS.some((pattern) => pattern.test(entry.name))) {
      throw invalidLocalAsset("运行产物包含未识别条目，已停止删除");
    }
    let stats: Stats;
    try {
      stats = lstatSync(join(runDirectory, entry.name));
    } catch {
      throw invalidLocalAsset("运行产物在维护期间发生变化，已停止删除");
    }
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw invalidLocalAsset("运行产物包含非普通文件，已停止删除");
    }
  }
}

function snapshotBelongsToRun(snapshotPath: string | null, runDirectory: string): boolean {
  if (!snapshotPath) {
    return false;
  }
  const normalized = resolve(snapshotPath);
  return (
    dirname(normalized) === runDirectory &&
    PAGE_SNAPSHOT_NAME_PATTERN.test(basename(normalized))
  );
}

function parseExecutionStatus(status: string): ExecutionResult["status"] {
  return EXECUTION_STATUSES.includes(status as ExecutionResult["status"])
    ? (status as ExecutionResult["status"])
    : "failed";
}

function parseStepStatus(status: string): StepLog["status"] {
  return STEP_STATUSES.includes(status as StepLog["status"])
    ? (status as StepLog["status"])
    : "failed";
}

function ensureProjectEnvironmentStorageStateColumn(
  sqlite: Parameters<typeof closeProjectDatabase>[0],
): void {
  const columns = sqlite.pragma("table_info(project_environments)") as Array<{ name: string }>;
  if (columns.some((column) => column.name === PROJECT_ENVIRONMENT_STORAGE_STATE_COLUMN)) {
    return;
  }
  sqlite.exec(`
    ALTER TABLE project_environments
    ADD COLUMN storage_state_path TEXT
  `);
}

function ensureExecutionStepDiagnosticPathColumn(
  sqlite: Parameters<typeof closeProjectDatabase>[0],
): void {
  const columns = sqlite.pragma("table_info(execution_steps)") as Array<{ name: string }>;
  if (columns.some((column) => column.name === EXECUTION_STEP_DIAGNOSTIC_PATH_COLUMN)) {
    return;
  }
  sqlite.exec(`
    ALTER TABLE execution_steps
    ADD COLUMN diagnostic_path TEXT
  `);
}

function ensureExecutionRunContextColumns(
  sqlite: Parameters<typeof closeProjectDatabase>[0],
): void {
  const columns = sqlite.pragma("table_info(executions)") as Array<{ name: string }>;
  if (!columns.some((column) => column.name === EXECUTION_FLOW_SNAPSHOT_JSON_COLUMN)) {
    sqlite.exec(`
      ALTER TABLE executions
      ADD COLUMN flow_snapshot_json TEXT
    `);
  }
  if (!columns.some((column) => column.name === EXECUTION_ENVIRONMENT_NAME_COLUMN)) {
    sqlite.exec(`
      ALTER TABLE executions
      ADD COLUMN environment_name TEXT
    `);
  }
  if (!columns.some((column) => column.name === EXECUTION_BASE_URL_COLUMN)) {
    sqlite.exec(`
      ALTER TABLE executions
      ADD COLUMN base_url TEXT
    `);
  }
  if (!columns.some((column) => column.name === EXECUTION_STORAGE_STATE_PATH_COLUMN)) {
    sqlite.exec(`
      ALTER TABLE executions
      ADD COLUMN storage_state_path TEXT
    `);
  }
  if (!columns.some((column) => column.name === EXECUTION_VARIABLES_JSON_COLUMN)) {
    sqlite.exec(`
      ALTER TABLE executions
      ADD COLUMN variables_json TEXT
    `);
  }
}

function serializeExecutionVariables(
  variables: ExecutionRunContext["variables"],
): string | null {
  if (variables === undefined) {
    return null;
  }
  return JSON.stringify(variables);
}

function serializeExecutionFlowSnapshot(
  flowSnapshot: ExecutionResult["flowSnapshot"],
): string | null {
  if (!flowSnapshot) {
    return null;
  }
  return JSON.stringify(flowSnapshot);
}

function parseExecutionVariables(
  variablesJson: string | null | undefined,
): ExecutionRunContext["variables"] {
  if (!variablesJson) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(variablesJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const entries = Object.entries(parsed).filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      );
    });

    return Object.fromEntries(entries);
  } catch {
    return undefined;
  }
}

function parseExecutionFlowSnapshot(
  flowSnapshotJson: string | null | undefined,
): ExecutionResult["flowSnapshot"] {
  if (!flowSnapshotJson) {
    return undefined;
  }

  try {
    return parseFlowDocument(JSON.parse(flowSnapshotJson));
  } catch {
    return undefined;
  }
}

function parseExecutionRunContext(
  row: typeof dbSchema.executions.$inferSelect,
): ExecutionRunContext | undefined {
  const variables = parseExecutionVariables(row.variablesJson);
  if (
    row.environmentName == null &&
    row.baseUrl == null &&
    row.storageStatePath == null &&
    variables === undefined
  ) {
    return undefined;
  }

  return {
    environmentName: row.environmentName ?? undefined,
    baseUrl: row.baseUrl ?? undefined,
    storageStatePath: row.storageStatePath ?? undefined,
    variables,
  };
}

export type ProjectKnowledgeRepositoryOptions = {
  /** 覆盖默认数据目录，测试时传入临时目录 */
  dataDir?: string;
  /** 显式指定 better-sqlite3 原生模块路径，供 Electron 等特殊 ABI 使用 */
  nativeBinding?: string;
};

export class ProjectKnowledgeRepository {
  private readonly dataDir: string;
  private readonly databaseOptions: ProjectDatabaseNativeOptions;

  constructor(options: ProjectKnowledgeRepositoryOptions = {}) {
    this.dataDir = resolve(expandHomePath(options.dataDir ?? "~/.flowweave/projects"));
    this.databaseOptions = {
      nativeBinding: options.nativeBinding,
    };
  }

  /** @internal 仅供故障注入测试覆盖 rename 后身份漂移。 */
  protected verifyQuarantinedRunIdentity(path: string, expected: FileIdentity): void {
    assertSameDirectoryIdentity(path, expected, "隔离运行目录");
  }

  /** @internal 仅供故障注入测试覆盖提交后的清理失败。 */
  protected beforeQuarantinedArtifactCleanup(): void {}

  /** @internal 仅供故障注入测试模拟截图读取后的路径身份漂移。 */
  protected beforeExecutionScreenshotFileRevalidation(): void {}

  /** 为单次执行创建 `runs/<executionId>/` 目录 */
  allocateRunDirectory(projectId: string, executionId: string): string {
    assertSafeResourceId(projectId, "项目标识");
    assertSafeResourceId(executionId, "执行标识");
    const { projectDirectory, projectIdentity } = this.assertExistingProject(projectId);
    const runsDirectory = join(projectDirectory, "runs");

    try {
      assertDirectoryWithoutSymlink(runsDirectory, "运行目录根");
    } catch (error: unknown) {
      if (!isMissingPathError(error)) {
        throw error;
      }
      assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
      try {
        mkdirSync(runsDirectory);
      } catch {
        throw new FlowWeaveError("UNKNOWN", "创建运行目录根失败");
      }
    }

    assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
    assertDirectoryWithoutSymlink(runsDirectory, "运行目录根");
    const runDirectory = resolveRunDirectory(this.dataDir, projectId, executionId);
    try {
      mkdirSync(runDirectory);
    } catch (error: unknown) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EEXIST"
      )) {
        throw new FlowWeaveError("UNKNOWN", "创建单次运行目录失败");
      }
    }
    assertDirectoryWithoutSymlink(runDirectory, "单次运行目录");
    return runDirectory;
  }

  private assertExistingProject(projectId: string): {
    projectDirectory: string;
    projectIdentity: FileIdentity;
    storePath: string;
    storeIdentity: FileIdentity;
  } {
    assertSafeResourceId(projectId, "项目标识");
    const projectDirectory = dirname(resolveProjectStorePath(projectId, this.dataDir));
    const storePath = resolveProjectStorePath(projectId, this.dataDir);

    let projectIdentity: FileIdentity;
    let storeIdentity: FileIdentity;
    try {
      projectIdentity = assertDirectoryWithoutSymlink(projectDirectory, "项目目录");
      storeIdentity = assertRegularFileWithoutSymlink(storePath, "项目数据文件");
    } catch (error: unknown) {
      if (isMissingPathError(error)) {
        throw new FlowWeaveError("PROJECT_NOT_FOUND", "目标项目不存在");
      }
      throw error;
    }

    let readonlyDatabase: ReturnType<typeof openExistingProjectDatabaseReadOnly> | undefined;
    try {
      readonlyDatabase = openExistingProjectDatabaseReadOnly(
        projectId,
        this.dataDir,
        this.databaseOptions,
      );
      assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
      assertSameFileIdentity(storePath, storeIdentity, "项目数据文件");
      const row = readonlyDatabase.db
        .select({ id: dbSchema.projects.id })
        .from(dbSchema.projects)
        .where(eq(dbSchema.projects.id, projectId))
        .get();
      if (!row) {
        throw new FlowWeaveError("PROJECT_NOT_FOUND", "目标项目不存在");
      }
      return { projectDirectory, projectIdentity, storePath, storeIdentity };
    } catch (error: unknown) {
      if (error instanceof FlowWeaveError) {
        throw error;
      }
      throw new FlowWeaveError("UNKNOWN", "项目数据不可用");
    } finally {
      if (readonlyDatabase) {
        closeProjectDatabase(readonlyDatabase.sqlite);
      }
    }
  }

  createProject(name: string): ProjectRef {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { db, sqlite } = openProjectDatabase(id, this.dataDir, this.databaseOptions);

    try {
      db.insert(dbSchema.projects)
        .values({
          id,
          name,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } finally {
      closeProjectDatabase(sqlite);
    }

    this.ensureDefaultEnvironment(id, "默认环境", "https://example.com");
    return { id, name, createdAt: now };
  }

  ensureDefaultEnvironment(projectId: string, name: string, baseUrl: string): ProjectEnvironment {
    const existing = this.getDefaultEnvironment(projectId);
    if (existing) {
      return existing;
    }
    return this.saveEnvironment(projectId, name, baseUrl, true);
  }

  saveEnvironment(
    projectId: string,
    name: string,
    baseUrl: string,
    isDefault = false,
    storageStatePath?: string,
  ): ProjectEnvironment {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      ensureProjectEnvironmentStorageStateColumn(sqlite);
      if (isDefault) {
        db.update(dbSchema.projectEnvironments)
          .set({ isDefault: 0 })
          .where(eq(dbSchema.projectEnvironments.projectId, projectId))
          .run();
      }
      db.insert(dbSchema.projectEnvironments)
        .values({
          id,
          projectId,
          name,
          baseUrl,
          storageStatePath: storageStatePath ?? null,
          isDefault: isDefault ? 1 : 0,
          createdAt: now,
        })
        .run();
    } finally {
      closeProjectDatabase(sqlite);
    }
    return {
      id,
      projectId,
      name,
      baseUrl,
      isDefault,
      storageStatePath,
    };
  }

  getDefaultEnvironment(projectId: string): ProjectEnvironment | null {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      ensureProjectEnvironmentStorageStateColumn(sqlite);
      const row =
        db
          .select()
          .from(dbSchema.projectEnvironments)
          .where(
            and(
              eq(dbSchema.projectEnvironments.projectId, projectId),
              eq(dbSchema.projectEnvironments.isDefault, 1),
            ),
          )
          .get() ?? null;
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        projectId: row.projectId,
        name: row.name,
        baseUrl: row.baseUrl,
        isDefault: row.isDefault === 1,
        storageStatePath: row.storageStatePath ?? undefined,
      };
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  savePageSnapshot(
    projectId: string,
    summary: PageSnapshotSummary,
    snapshotPath?: string,
  ): PageSnapshotRecord {
    const id = randomUUID();
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      db.insert(dbSchema.pageSnapshots)
        .values({
          id,
          projectId,
          url: summary.url,
          title: summary.title,
          summaryJson: JSON.stringify(summary),
          snapshotPath: snapshotPath ?? null,
          capturedAt: summary.capturedAt,
        })
        .run();
    } finally {
      closeProjectDatabase(sqlite);
    }
    return {
      id,
      projectId,
      url: summary.url,
      title: summary.title,
      snapshotPath,
      capturedAt: summary.capturedAt,
    };
  }

  listPageSnapshots(projectId: string, limit = 20): PageSnapshotRecord[] {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      return db
        .select()
        .from(dbSchema.pageSnapshots)
        .where(eq(dbSchema.pageSnapshots.projectId, projectId))
        .orderBy(desc(dbSchema.pageSnapshots.capturedAt))
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          projectId: row.projectId,
          url: row.url,
          title: row.title ?? undefined,
          snapshotPath: row.snapshotPath ?? undefined,
          capturedAt: row.capturedAt,
        }));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  saveFlow(projectId: string, flow: FlowDocument, changeMessage?: string): void {
    const parsed = parseFlowDocument(flow);
    const document = {
      ...parsed,
      projectId,
    };
    const documentJson = JSON.stringify(document);

    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const now = new Date().toISOString();
      const row = {
        id: document.id,
        projectId,
        name: document.name,
        documentJson,
        schemaVersion: document.schemaVersion,
        createdAt: document.meta.createdAt,
        updatedAt: now,
      };

      const existing = db
        .select()
        .from(dbSchema.flows)
        .where(eq(dbSchema.flows.id, document.id))
        .get();

      if (existing) {
        if (existing.documentJson !== documentJson) {
          this.appendFlowVersion(db, {
            projectId,
            flowId: document.id,
            documentJson: existing.documentJson,
            changeMessage: changeMessage ?? "保存前自动快照",
            createdAt: now,
          });
        }
        db.update(dbSchema.flows).set(row).where(eq(dbSchema.flows.id, document.id)).run();
      } else {
        db.insert(dbSchema.flows).values(row).run();
      }
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 将裸 FlowDocument 安全导入目标项目，每次都创建独立副本。 */
  importFlow(projectId: string, input: unknown): FlowImportResult {
    const projectExists = this.listProjects().some((project) => project.id === projectId);
    if (!projectExists) {
      throw new FlowWeaveError("PROJECT_NOT_FOUND", "目标项目不存在");
    }

    let portable: ReturnType<typeof createPortableFlowDocument>;
    try {
      portable = createPortableFlowDocument(input);
    } catch {
      throw new FlowWeaveError("VALIDATION_FAILED", "Flow 文档格式无效");
    }

    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const importTransaction = sqlite.transaction(() => {
        const existingNames = new Set(
          db
            .select({ name: dbSchema.flows.name })
            .from(dbSchema.flows)
            .where(eq(dbSchema.flows.projectId, projectId))
            .all()
            .map((row) => row.name),
        );
        const name = this.allocateImportedFlowName(portable.document.name, existingNames);
        const now = new Date().toISOString();
        const flow: FlowDocument = {
          ...portable.document,
          id: randomUUID(),
          projectId,
          name,
          meta: {
            ...portable.document.meta,
            createdAt: now,
            updatedAt: now,
          },
        };
        db.insert(dbSchema.flows)
          .values({
            id: flow.id,
            projectId,
            name: flow.name,
            documentJson: JSON.stringify(flow),
            schemaVersion: flow.schemaVersion,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        return flow;
      });

      return {
        flow: importTransaction.immediate(),
        warnings: portable.warnings,
      };
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  private allocateImportedFlowName(sourceName: string, existingNames: Set<string>): string {
    const firstCandidate = `${sourceName}（导入）`;
    if (!existingNames.has(firstCandidate)) {
      return firstCandidate;
    }

    let sequence = 2;
    while (existingNames.has(`${sourceName}（导入 ${sequence}）`)) {
      sequence += 1;
    }
    return `${sourceName}（导入 ${sequence}）`;
  }

  getFlowInProject(projectId: string, flowId: string): FlowDocument | null {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const row = db
        .select()
        .from(dbSchema.flows)
        .where(eq(dbSchema.flows.id, flowId))
        .get();
      if (!row) {
        return null;
      }
      return parseFlowDocument(JSON.parse(row.documentJson));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  listFlowVersions(projectId: string, flowId: string, limit = 50): FlowVersionRecord[] {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      return db
        .select()
        .from(dbSchema.flowVersions)
        .where(
          and(
            eq(dbSchema.flowVersions.projectId, projectId),
            eq(dbSchema.flowVersions.flowId, flowId),
          ),
        )
        .orderBy(desc(dbSchema.flowVersions.version))
        .limit(limit)
        .all()
        .map((row) => this.toFlowVersionRecord(row));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  getFlowVersion(projectId: string, versionId: string): FlowDocument | null {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const row = db
        .select()
        .from(dbSchema.flowVersions)
        .where(
          and(
            eq(dbSchema.flowVersions.projectId, projectId),
            eq(dbSchema.flowVersions.id, versionId),
          ),
        )
        .get();
      if (!row) {
        return null;
      }
      return parseFlowDocument(JSON.parse(row.documentJson));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  restoreFlowVersion(projectId: string, versionId: string): FlowDocument {
    const document = this.getFlowVersion(projectId, versionId);
    if (!document) {
      throw new Error(`未找到版本: ${versionId}`);
    }
    this.saveFlow(projectId, document, "从版本恢复");
    return document;
  }

  private appendFlowVersion(
    db: ReturnType<typeof openProjectDatabase>["db"],
    input: {
      projectId: string;
      flowId: string;
      documentJson: string;
      changeMessage?: string;
      createdAt: string;
    },
  ): void {
    const maxRow = db
      .select({ value: max(dbSchema.flowVersions.version) })
      .from(dbSchema.flowVersions)
      .where(eq(dbSchema.flowVersions.flowId, input.flowId))
      .get();
    const nextVersion = (maxRow?.value ?? 0) + 1;

    db.insert(dbSchema.flowVersions)
      .values({
        id: randomUUID(),
        flowId: input.flowId,
        projectId: input.projectId,
        version: nextVersion,
        documentJson: input.documentJson,
        changeMessage: input.changeMessage ?? null,
        createdAt: input.createdAt,
      })
      .run();
  }

  private toFlowVersionRecord(
    row: typeof dbSchema.flowVersions.$inferSelect,
  ): FlowVersionRecord {
    const doc = parseFlowDocument(JSON.parse(row.documentJson));
    return {
      id: row.id,
      flowId: row.flowId,
      projectId: row.projectId,
      version: row.version,
      name: doc.name,
      stepCount: doc.steps.length,
      createdAt: row.createdAt,
      changeMessage: row.changeMessage ?? undefined,
    };
  }

  saveExecution(projectId: string, result: ExecutionResult): void {
    assertSafeResourceId(projectId, "项目标识");
    assertSafeResourceId(result.executionId, "执行标识");
    this.assertExistingProject(projectId);
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      ensureExecutionRunContextColumns(sqlite);
      ensureExecutionStepDiagnosticPathColumn(sqlite);
      const saveTransaction = sqlite.transaction(() => {
        db.insert(dbSchema.executions)
          .values({
            id: result.executionId,
            projectId,
            flowId: result.flowId,
            status: result.status,
            flowSnapshotJson: serializeExecutionFlowSnapshot(result.flowSnapshot),
            environmentName: result.runContext?.environmentName ?? null,
            baseUrl: result.runContext?.baseUrl ?? null,
            storageStatePath: result.runContext?.storageStatePath ?? null,
            variablesJson: serializeExecutionVariables(result.runContext?.variables),
            startedAt: result.startedAt ?? null,
            finishedAt: result.finishedAt ?? null,
          })
          .run();

        if (result.steps.length > 0) {
          db.insert(dbSchema.executionSteps)
            .values(
              result.steps.map((step) => ({
                id: randomUUID(),
                executionId: result.executionId,
                stepIndex: step.stepIndex,
                stepId: step.stepId,
                status: step.status,
                durationMs: step.durationMs ?? null,
                errorMessage: step.errorMessage ?? null,
                screenshotPath: step.screenshotPath ?? null,
                diagnosticPath: step.diagnosticPath ?? null,
              })),
            )
            .run();
        }
      });
      saveTransaction.immediate();
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /**
   * 按业务标识读取受控运行目录中的 PNG，不信任数据库内保存的截图路径。
   * 返回值不会携带文件名或绝对路径。
   */
  getExecutionScreenshotPreview(
    projectId: string,
    executionId: string,
    stepIndex: number,
  ): ExecutionScreenshotPreviewResult {
    assertSafeResourceId(projectId, "项目标识");
    assertSafeResourceId(executionId, "执行标识");
    if (
      !Number.isSafeInteger(stepIndex) ||
      stepIndex < 0 ||
      stepIndex > EXECUTION_SCREENSHOT_MAX_STEP_INDEX
    ) {
      throw new FlowWeaveError("VALIDATION_FAILED", "步骤序号格式无效");
    }

    let dataDirectoryIdentity: FileIdentity;
    try {
      dataDirectoryIdentity = assertDirectoryWithoutSymlink(this.dataDir, "项目数据根");
    } catch (error: unknown) {
      if (isMissingPathError(error)) {
        throw new FlowWeaveError("PROJECT_NOT_FOUND", "目标项目不存在");
      }
      throw error;
    }
    const { projectDirectory, projectIdentity, storePath, storeIdentity } =
      this.assertExistingProject(projectId);
    let readonlyDatabase: ReturnType<typeof openExistingProjectDatabaseReadOnly> | undefined;
    try {
      readonlyDatabase = openExistingProjectDatabaseReadOnly(
        projectId,
        this.dataDir,
        this.databaseOptions,
      );
      const execution = readonlyDatabase.db
        .select({ id: dbSchema.executions.id })
        .from(dbSchema.executions)
        .where(
          and(
            eq(dbSchema.executions.id, executionId),
            eq(dbSchema.executions.projectId, projectId),
          ),
        )
        .get();
      if (!execution) {
        throw invalidLocalAsset("执行记录不存在或不属于目标项目");
      }
      const step = readonlyDatabase.db
        .select({ id: dbSchema.executionSteps.id })
        .from(dbSchema.executionSteps)
        .where(
          and(
            eq(dbSchema.executionSteps.executionId, executionId),
            eq(dbSchema.executionSteps.stepIndex, stepIndex),
          ),
        )
        .get();
      if (!step) {
        throw invalidLocalAsset("执行步骤不存在");
      }
      assertSameDirectoryIdentity(this.dataDir, dataDirectoryIdentity, "项目数据根");
      assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
      assertSameFileIdentity(storePath, storeIdentity, "项目数据文件");
    } catch (error: unknown) {
      if (error instanceof FlowWeaveError) {
        throw error;
      }
      throw new FlowWeaveError("UNKNOWN", "读取执行记录失败");
    } finally {
      if (readonlyDatabase) {
        closeProjectDatabase(readonlyDatabase.sqlite);
      }
    }

    const runsDirectory = join(projectDirectory, "runs");
    const runDirectory = resolveRunDirectory(this.dataDir, projectId, executionId);
    const screenshotPath = join(runDirectory, `step-${stepIndex}.png`);
    let runsIdentity: FileIdentity;
    let runIdentity: FileIdentity;
    let screenshotIdentity: ScreenshotFileIdentity;
    try {
      runsIdentity = assertDirectoryWithoutSymlink(runsDirectory, "运行目录根");
      runIdentity = assertDirectoryWithoutSymlink(runDirectory, "单次运行目录");
      screenshotIdentity = lstatExecutionScreenshot(screenshotPath);
    } catch (error: unknown) {
      if (isMissingPathError(error)) {
        return { status: "absent" };
      }
      throw error;
    }

    assertSameDirectoryIdentity(this.dataDir, dataDirectoryIdentity, "项目数据根");
    assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
    assertSameFileIdentity(storePath, storeIdentity, "项目数据文件");
    assertSameDirectoryIdentity(runsDirectory, runsIdentity, "运行目录根");
    assertSameDirectoryIdentity(runDirectory, runIdentity, "单次运行目录");

    let descriptor: number | undefined;
    let contents: Buffer;
    try {
      const noFollowFlag = constants.O_NOFOLLOW ?? 0;
      try {
        descriptor = openSync(
          screenshotPath,
          constants.O_RDONLY | constants.O_NONBLOCK | noFollowFlag,
        );
      } catch {
        throw invalidLocalAsset("执行截图在读取期间发生变化");
      }

      const openedIdentity = assertScreenshotFileStats(fstatSync(descriptor));
      if (!sameScreenshotFileIdentity(openedIdentity, screenshotIdentity)) {
        throw invalidLocalAsset("执行截图在读取期间发生变化");
      }

      contents = Buffer.allocUnsafe(openedIdentity.size);
      let offset = 0;
      while (offset < contents.length) {
        const bytesRead = readSync(descriptor, contents, offset, contents.length - offset, offset);
        if (bytesRead === 0) {
          throw invalidLocalAsset("执行截图在读取期间发生变化");
        }
        offset += bytesRead;
      }

      this.beforeExecutionScreenshotFileRevalidation();

      const finalDescriptorIdentity = assertScreenshotFileStats(fstatSync(descriptor));
      if (!sameScreenshotFileIdentity(finalDescriptorIdentity, screenshotIdentity)) {
        throw invalidLocalAsset("执行截图在读取期间发生变化");
      }
      let finalPathIdentity: ScreenshotFileIdentity;
      try {
        finalPathIdentity = lstatExecutionScreenshot(screenshotPath);
      } catch {
        throw invalidLocalAsset("执行截图在读取期间发生变化");
      }
      if (!sameScreenshotFileIdentity(finalPathIdentity, screenshotIdentity)) {
        throw invalidLocalAsset("执行截图在读取期间发生变化");
      }
      assertSameDirectoryIdentity(this.dataDir, dataDirectoryIdentity, "项目数据根");
      assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
      assertSameFileIdentity(storePath, storeIdentity, "项目数据文件");
      assertSameDirectoryIdentity(runsDirectory, runsIdentity, "运行目录根");
      assertSameDirectoryIdentity(runDirectory, runIdentity, "单次运行目录");
    } catch (error: unknown) {
      if (error instanceof FlowWeaveError) {
        throw error;
      }
      throw new FlowWeaveError("UNKNOWN", "执行截图读取失败");
    } finally {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor);
        } catch {
          // 读取结果仍由前述身份校验决定；关闭失败不暴露文件路径。
        }
      }
    }

    const { width, height } = parsePngDimensions(contents);
    return {
      status: "available",
      mediaType: "image/png",
      bytes: new Uint8Array(contents),
      width,
      height,
    };
  }

  /** 安全删除单条已落库 execution，并只清理其受控直属运行产物。 */
  deleteExecution(projectId: string, executionId: string): ExecutionDeletionResult {
    assertSafeResourceId(projectId, "项目标识");
    assertSafeResourceId(executionId, "执行标识");
    const { projectDirectory, projectIdentity, storePath, storeIdentity } =
      this.assertExistingProject(projectId);

    let readonlyDatabase: ReturnType<typeof openExistingProjectDatabaseReadOnly> | undefined;
    try {
      readonlyDatabase = openExistingProjectDatabaseReadOnly(
        projectId,
        this.dataDir,
        this.databaseOptions,
      );
      const execution = readonlyDatabase.db
        .select({ id: dbSchema.executions.id })
        .from(dbSchema.executions)
        .where(
          and(
            eq(dbSchema.executions.id, executionId),
            eq(dbSchema.executions.projectId, projectId),
          ),
        )
        .get();
      if (!execution) {
        return {
          projectId,
          executionId,
          status: "already-absent",
          artifacts: "untouched",
        };
      }
    } catch (error: unknown) {
      if (error instanceof FlowWeaveError) {
        throw error;
      }
      throw new FlowWeaveError("UNKNOWN", "读取执行记录失败");
    } finally {
      if (readonlyDatabase) {
        closeProjectDatabase(readonlyDatabase.sqlite);
      }
    }

    const runsDirectory = join(projectDirectory, "runs");
    const runDirectory = resolveRunDirectory(this.dataDir, projectId, executionId);
    let runIdentity: FileIdentity | undefined;
    let runsIdentity: FileIdentity | undefined;
    try {
      runsIdentity = assertDirectoryWithoutSymlink(runsDirectory, "运行目录根");
      runIdentity = assertDirectoryWithoutSymlink(runDirectory, "单次运行目录");
      assertSafeRunArtifacts(runDirectory);
    } catch (error: unknown) {
      if (!isMissingPathError(error)) {
        throw error;
      }
      runIdentity = undefined;
    }

    let quarantineDirectory: string | undefined;
    if (runIdentity && runsIdentity) {
      assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
      assertSameDirectoryIdentity(runsDirectory, runsIdentity, "运行目录根");
      assertSameDirectoryIdentity(runDirectory, runIdentity, "单次运行目录");
      assertSafeRunArtifacts(runDirectory);

      quarantineDirectory = join(
        runsDirectory,
        `.execution-quarantine-${randomUUID()}`,
      );
      try {
        renameSync(runDirectory, quarantineDirectory);
      } catch {
        throw new FlowWeaveError("UNKNOWN", "隔离运行产物失败，未删除执行记录");
      }
      try {
        this.verifyQuarantinedRunIdentity(quarantineDirectory, runIdentity);
        assertSafeRunArtifacts(quarantineDirectory);
      } catch (error: unknown) {
        this.restoreQuarantinedRun({
          quarantineDirectory,
          runDirectory,
          runIdentity,
          runsDirectory,
          runsIdentity,
          projectDirectory,
          projectIdentity,
        });
        throw error;
      }
    }

    if (!runIdentity) {
      assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
      try {
        assertDirectoryWithoutSymlink(runsDirectory, "运行目录根");
        assertDirectoryWithoutSymlink(runDirectory, "单次运行目录");
        throw invalidLocalAsset("单次运行目录在维护期间发生变化，已停止删除");
      } catch (error: unknown) {
        if (!isMissingPathError(error)) {
          throw error;
        }
      }
    }

    let writableDatabase: ReturnType<typeof openProjectDatabase> | undefined;
    try {
      assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
      assertSameFileIdentity(storePath, storeIdentity, "项目数据文件");
      writableDatabase = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
      assertSameDirectoryIdentity(projectDirectory, projectIdentity, "项目目录");
      assertSameFileIdentity(storePath, storeIdentity, "项目数据文件");
      const { db, sqlite } = writableDatabase;
      const deleteTransaction = sqlite.transaction(() => {
        const snapshotRows = db
          .select({
            id: dbSchema.pageSnapshots.id,
            snapshotPath: dbSchema.pageSnapshots.snapshotPath,
          })
          .from(dbSchema.pageSnapshots)
          .where(eq(dbSchema.pageSnapshots.projectId, projectId))
          .all();
        for (const snapshot of snapshotRows) {
          if (snapshotBelongsToRun(snapshot.snapshotPath, runDirectory)) {
            db.delete(dbSchema.pageSnapshots)
              .where(
                and(
                  eq(dbSchema.pageSnapshots.id, snapshot.id),
                  eq(dbSchema.pageSnapshots.projectId, projectId),
                ),
              )
              .run();
          }
        }

        const deletion = db
          .delete(dbSchema.executions)
          .where(
            and(
              eq(dbSchema.executions.id, executionId),
              eq(dbSchema.executions.projectId, projectId),
            ),
          )
          .run();
        if (deletion.changes !== 1) {
          throw new Error("execution ownership changed");
        }
      });
      deleteTransaction.immediate();
    } catch {
      if (quarantineDirectory) {
        this.restoreQuarantinedRun({
          quarantineDirectory,
          runDirectory,
          runIdentity: runIdentity!,
          runsDirectory,
          runsIdentity: runsIdentity!,
          projectDirectory,
          projectIdentity,
        });
        throw new FlowWeaveError("UNKNOWN", "删除执行记录失败，运行产物已恢复");
      }
      throw new FlowWeaveError("UNKNOWN", "删除执行记录失败，未变更运行产物");
    } finally {
      if (writableDatabase) {
        closeProjectDatabase(writableDatabase.sqlite);
      }
    }

    if (!quarantineDirectory) {
      return { projectId, executionId, status: "deleted", artifacts: "absent" };
    }

    try {
      this.verifyQuarantinedRunIdentity(quarantineDirectory, runIdentity!);
      assertSafeRunArtifacts(quarantineDirectory);
      this.beforeQuarantinedArtifactCleanup();
      for (const entry of readdirSync(quarantineDirectory, { withFileTypes: true })) {
        unlinkSync(join(quarantineDirectory, entry.name));
      }
      rmdirSync(quarantineDirectory);
      return { projectId, executionId, status: "deleted", artifacts: "deleted" };
    } catch {
      return { projectId, executionId, status: "deleted", artifacts: "quarantined" };
    }
  }

  private restoreQuarantinedRun(input: {
    quarantineDirectory: string;
    runDirectory: string;
    runIdentity: FileIdentity;
    runsDirectory: string;
    runsIdentity: FileIdentity;
    projectDirectory: string;
    projectIdentity: FileIdentity;
  }): void {
    try {
      assertSameDirectoryIdentity(input.projectDirectory, input.projectIdentity, "项目目录");
      assertSameDirectoryIdentity(input.runsDirectory, input.runsIdentity, "运行目录根");
      assertSameDirectoryIdentity(
        input.quarantineDirectory,
        input.runIdentity,
        "隔离运行目录",
      );

      let destinationIsMissing = false;
      try {
        assertDirectoryWithoutSymlink(input.runDirectory, "单次运行目录");
      } catch (error: unknown) {
        if (isMissingPathError(error)) {
          destinationIsMissing = true;
        } else {
          throw error;
        }
      }
      if (!destinationIsMissing) {
        throw invalidLocalAsset("原运行目录已被占用");
      }

      assertSameDirectoryIdentity(input.projectDirectory, input.projectIdentity, "项目目录");
      assertSameDirectoryIdentity(input.runsDirectory, input.runsIdentity, "运行目录根");
      assertSameDirectoryIdentity(
        input.quarantineDirectory,
        input.runIdentity,
        "隔离运行目录",
      );
      renameSync(input.quarantineDirectory, input.runDirectory);
      assertSameDirectoryIdentity(input.runDirectory, input.runIdentity, "单次运行目录");
    } catch {
      throw new FlowWeaveError(
        "UNKNOWN",
        "删除执行记录失败且运行产物恢复失败，请立即停止相关维护操作",
      );
    }
  }

  listProjects(): ProjectRef[] {
    let entries: string[];
    try {
      entries = readdirSync(this.dataDir);
    } catch {
      return [];
    }

    const projects: ProjectRef[] = [];
    for (const entry of entries) {
      const storePath = resolveProjectStorePath(entry, this.dataDir);
      try {
        statSync(storePath);
      } catch {
        continue;
      }

      const { db, sqlite } = openProjectDatabase(entry, this.dataDir, this.databaseOptions);
      try {
        const row = db.select().from(dbSchema.projects).get();
        if (row) {
          projects.push({
            id: row.id,
            name: row.name,
            createdAt: row.createdAt,
          });
        }
      } finally {
        closeProjectDatabase(sqlite);
      }
    }

    return projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  listFlows(projectId: string): Array<{ id: string; name: string; createdAt: string }> {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      return db
        .select({
          id: dbSchema.flows.id,
          name: dbSchema.flows.name,
          createdAt: dbSchema.flows.createdAt,
        })
        .from(dbSchema.flows)
        .orderBy(desc(dbSchema.flows.createdAt))
        .all();
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 仅更新 Flow 名称（不新增版本快照） */
  renameFlow(projectId: string, flowId: string, name: string): FlowDocument {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Flow 名称不能为空");
    }

    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const row = db
        .select()
        .from(dbSchema.flows)
        .where(eq(dbSchema.flows.id, flowId))
        .get();
      if (!row) {
        throw new Error("Flow 不存在");
      }

      const document = parseFlowDocument(JSON.parse(row.documentJson));
      const now = new Date().toISOString();
      const updated: FlowDocument = {
        ...document,
        name: trimmed,
        meta: {
          ...document.meta,
          updatedAt: now,
        },
      };

      db.update(dbSchema.flows)
        .set({
          name: trimmed,
          documentJson: JSON.stringify(updated),
          updatedAt: now,
        })
        .where(eq(dbSchema.flows.id, flowId))
        .run();

      return updated;
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  getFlow(flowId: string): FlowDocument | null {
    let entries: string[];
    try {
      entries = readdirSync(this.dataDir);
    } catch {
      return null;
    }

    for (const entry of entries) {
      const storePath = resolveProjectStorePath(entry, this.dataDir);
      try {
        statSync(storePath);
      } catch {
        continue;
      }

      const { db, sqlite } = openProjectDatabase(entry, this.dataDir, this.databaseOptions);
      try {
        const row = db
          .select()
          .from(dbSchema.flows)
          .where(eq(dbSchema.flows.id, flowId))
          .get();
        if (row) {
          return parseFlowDocument(JSON.parse(row.documentJson));
        }
      } finally {
        closeProjectDatabase(sqlite);
      }
    }

    return null;
  }

  listExecutions(projectId: string, limit = 50): ExecutionResult[] {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      ensureExecutionRunContextColumns(sqlite);
      ensureExecutionStepDiagnosticPathColumn(sqlite);
      const rows = db
        .select()
        .from(dbSchema.executions)
        .where(eq(dbSchema.executions.projectId, projectId))
        .orderBy(desc(dbSchema.executions.startedAt), desc(dbSchema.executions.finishedAt))
        .limit(limit)
        .all();

      return rows.map((row) => this.assembleExecution(db, row));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  getLatestExecutionForFlow(projectId: string, flowId: string): ExecutionResult | null {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      ensureExecutionRunContextColumns(sqlite);
      ensureExecutionStepDiagnosticPathColumn(sqlite);
      const row = db
        .select()
        .from(dbSchema.executions)
        .where(
          and(
            eq(dbSchema.executions.projectId, projectId),
            eq(dbSchema.executions.flowId, flowId),
          ),
        )
        .orderBy(desc(dbSchema.executions.startedAt), desc(dbSchema.executions.finishedAt))
        .limit(1)
        .get();
      return row ? this.assembleExecution(db, row) : null;
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  getExecution(executionId: string): ExecutionWithProject | null {
    let entries: string[];
    try {
      entries = readdirSync(this.dataDir);
    } catch {
      return null;
    }

    for (const entry of entries) {
      const storePath = resolveProjectStorePath(entry, this.dataDir);
      try {
        statSync(storePath);
      } catch {
        continue;
      }

      const { db, sqlite } = openProjectDatabase(entry, this.dataDir, this.databaseOptions);
      try {
        ensureExecutionRunContextColumns(sqlite);
        ensureExecutionStepDiagnosticPathColumn(sqlite);
        const row = db
          .select()
          .from(dbSchema.executions)
          .where(eq(dbSchema.executions.id, executionId))
          .get();
        if (row) {
          return {
            projectId: row.projectId,
            ...this.assembleExecution(db, row),
          };
        }
      } finally {
        closeProjectDatabase(sqlite);
      }
    }

    return null;
  }

  private assembleExecution(
    db: ReturnType<typeof openProjectDatabase>["db"],
    executionRow: typeof dbSchema.executions.$inferSelect,
  ): ExecutionResult {
    const stepRows = db
      .select()
      .from(dbSchema.executionSteps)
      .where(eq(dbSchema.executionSteps.executionId, executionRow.id))
      .orderBy(asc(dbSchema.executionSteps.stepIndex))
      .all();

    return {
      executionId: executionRow.id,
      flowId: executionRow.flowId,
      status: parseExecutionStatus(executionRow.status),
      startedAt: executionRow.startedAt ?? undefined,
      finishedAt: executionRow.finishedAt ?? undefined,
      flowSnapshot: parseExecutionFlowSnapshot(executionRow.flowSnapshotJson),
      runContext: parseExecutionRunContext(executionRow),
      steps: stepRows.map((step) => ({
        stepIndex: step.stepIndex,
        stepId: step.stepId,
        status: parseStepStatus(step.status),
        durationMs: step.durationMs ?? undefined,
        errorMessage: step.errorMessage ?? undefined,
        screenshotPath: step.screenshotPath ?? undefined,
        diagnosticPath: step.diagnosticPath ?? undefined,
      })),
    };
  }
}
