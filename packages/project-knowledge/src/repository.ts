import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
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

import type {
  AnyFlowDocument,
  FlowDocument,
  FlowDocumentV1,
  FlowDocumentV2,
  InputFieldV2,
} from "@flowweave/flow-dsl";
import {
  createPortableFlowDocument,
  parseFlowDocument,
  parseFlowDocumentV1,
  parseFlowDocumentV2,
  previewFlowV1Upgrade,
} from "@flowweave/flow-dsl";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { FLOW_SCHEMA_VERSION, FlowWeaveError } from "@flowweave/shared";

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
  FlowRecentValue,
  FlowRevisionRecord,
  PageSnapshotRecord,
  ProjectEnvironment,
  ProjectRef,
  RestoreFlowRevisionInput,
  SaveFlowFieldRecentValuesInput,
  SaveFlowRevisionInput,
  StepLog,
  UpgradeFlowToV2Input,
} from "./types.js";

const EXECUTION_STATUSES = ["success", "failed", "cancelled"] as const;
const STEP_STATUSES = ["passed", "failed", "skipped"] as const;
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

function assertExpectedRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new FlowWeaveError("VALIDATION_FAILED", "expectedRevision 必须是正整数");
  }
}

function safeSchemaVersionDetail(value: unknown): number | "missing" | "invalid" {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return value === undefined ? "missing" : "invalid";
}

function assertFlowIdentity(
  document: AnyFlowDocument,
  projectId: string,
  flowId: string,
): void {
  if (document.projectId !== projectId || document.id !== flowId) {
    throw new FlowWeaveError("VALIDATION_FAILED", "Flow 路径身份与文档身份不一致");
  }
}

function parseStoredFlow(documentJson: string): AnyFlowDocument {
  try {
    return parseFlowDocument(JSON.parse(documentJson));
  } catch {
    throw new FlowWeaveError("FLOW_PERSISTENCE_FAILED", "Flow 持久化内容不可安全解析");
  }
}

function sanitizeV1Document(
  document: FlowDocumentV1,
  sensitiveVariableNames: ReadonlySet<string>,
): FlowDocumentV1 {
  return {
    ...document,
    variables: document.variables.map((variable) => {
      if (!sensitiveVariableNames.has(variable.name) || variable.defaultValue === undefined) {
        return variable;
      }
      const { defaultValue: _removed, ...safeVariable } = variable;
      return safeVariable;
    }),
  };
}

function scrubSensitiveString(
  value: string | null,
  sensitiveValues: ReadonlySet<string>,
): string | null {
  if (value === null) {
    return null;
  }
  let scrubbed = value;
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue.length > 0) {
      scrubbed = scrubbed.replaceAll(sensitiveValue, "[已清理]");
    }
  }
  return scrubbed;
}

function scrubSensitiveStructure(value: unknown, sensitiveValues: ReadonlySet<string>): unknown {
  if (typeof value === "string") {
    return scrubSensitiveString(value, sensitiveValues);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrubSensitiveStructure(entry, sensitiveValues));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        scrubSensitiveStructure(entry, sensitiveValues),
      ]),
    );
  }
  return value;
}

function containsSensitiveValue(value: unknown, sensitiveValues: ReadonlySet<string>): boolean {
  if (typeof value === "string") {
    return [...sensitiveValues].some(
      (sensitiveValue) => sensitiveValue.length > 0 && value.includes(sensitiveValue),
    );
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsSensitiveValue(entry, sensitiveValues));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => containsSensitiveValue(entry, sensitiveValues));
  }
  return false;
}

function collectStringValues(value: unknown, target: Set<string>): void {
  if (typeof value === "string") {
    if (value.length > 0) {
      target.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStringValues(entry, target);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectStringValues(entry, target);
    }
  }
}

function assertNoSensitiveValue(
  value: unknown,
  sensitiveValues: ReadonlySet<string>,
  message: string,
): void {
  if (containsSensitiveValue(value, sensitiveValues)) {
    throw new FlowWeaveError("FLOW_UPGRADE_BLOCKED", message);
  }
}

const PORTABLE_SENSITIVE_QUERY_KEY = /(token|secret|password|passwd|api[-_]?key|auth)/i;

function assertPortableV2Document(document: FlowDocumentV2): void {
  for (const step of document.steps) {
    if (step.type === "upload" && step.files.length > 0) {
      throw new FlowWeaveError(
        "VALIDATION_FAILED",
        "v2 Flow 包含不可安全导出的本地上传路径",
      );
    }
    if (step.type !== "navigate") {
      continue;
    }
    try {
      const url = new URL(step.url);
      if (
        url.username ||
        url.password ||
        [...url.searchParams.keys()].some((key) => PORTABLE_SENSITIVE_QUERY_KEY.test(key))
      ) {
        throw new FlowWeaveError(
          "VALIDATION_FAILED",
          "v2 Flow 包含不可安全导出的 URL 凭据",
        );
      }
    } catch (error: unknown) {
      if (error instanceof FlowWeaveError) {
        throw error;
      }
      // 相对 URL 不携带 authority；保留其同版本语义。
    }
  }
}

function collectV2Fields(document: FlowDocumentV2): Map<string, InputFieldV2> {
  const fields = new Map<string, InputFieldV2>();
  for (const step of document.steps) {
    if (step.type !== "input") {
      continue;
    }
    for (const field of step.fields) {
      fields.set(field.fieldId, field);
    }
  }
  return fields;
}

function isRecentValueCompatible(field: InputFieldV2, value: unknown): value is FlowRecentValue {
  return (
    !field.sensitive &&
    field.remember === "lastValue" &&
    typeof value === field.type &&
    (typeof value !== "number" || Number.isFinite(value))
  );
}

function persistenceFailure(error: unknown): never {
  if (error instanceof FlowWeaveError) {
    throw error;
  }
  throw new FlowWeaveError("FLOW_PERSISTENCE_FAILED", "Flow 原子持久化失败");
}

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

  let parsed: unknown;
  try {
    parsed = JSON.parse(flowSnapshotJson);
  } catch {
    return undefined;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    "schemaVersion" in parsed &&
    (parsed as { schemaVersion?: unknown }).schemaVersion !== FLOW_SCHEMA_VERSION
  ) {
    throw new FlowWeaveError(
      "FLOW_SCHEMA_VERSION_UNSUPPORTED",
      "vNext-2 前不能读取 v2 execution 快照",
      {
        schemaVersion: safeSchemaVersionDetail(
          (parsed as { schemaVersion?: unknown }).schemaVersion,
        ),
      },
    );
  }
  try {
    return parseFlowDocumentV1(parsed);
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

  /** @internal 仅供 vNext 原子事务故障注入测试。 */
  protected beforeVNextPersistenceStep(_step: string): void {}

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

  saveFlow(projectId: string, flow: FlowDocument, _changeMessage?: string): void {
    const parsed = parseFlowDocumentV1(flow);
    const document = {
      ...parsed,
      projectId,
    };
    const documentJson = JSON.stringify(document);

    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const saveTransaction = sqlite.transaction(() => {
        const now = new Date().toISOString();
        const existing = db
          .select()
          .from(dbSchema.flows)
          .where(eq(dbSchema.flows.id, document.id))
          .get();
        if (existing && existing.projectId !== projectId) {
          throw new FlowWeaveError("VALIDATION_FAILED", "Flow 不属于目标项目");
        }
        if (existing && existing.schemaVersion !== FLOW_SCHEMA_VERSION) {
          throw new FlowWeaveError(
            "FLOW_SCHEMA_VERSION_UNSUPPORTED",
            "legacy saveFlow 只允许保存 v1 Flow",
          );
        }
        if (existing) {
          throw new FlowWeaveError(
            "FLOW_REVISION_CONFLICT",
            "legacy saveFlow 仅允许新建；更新必须携带 expectedRevision",
            { currentRevision: existing.revision },
          );
        }
        db.insert(dbSchema.flows)
          .values({
            id: document.id,
            projectId,
            name: document.name,
            documentJson,
            schemaVersion: document.schemaVersion,
            revision: 1,
            createdAt: document.meta.createdAt,
            updatedAt: now,
          })
          .run();
      });
      saveTransaction.immediate();
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 通用 v1/v2 读取；旧消费者继续使用显式 v1 的 getFlowInProject。 */
  getFlowRevision(projectId: string, flowId: string): FlowRevisionRecord | null {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const row = db
        .select()
        .from(dbSchema.flows)
        .where(and(eq(dbSchema.flows.projectId, projectId), eq(dbSchema.flows.id, flowId)))
        .get();
      if (!row) {
        return null;
      }
      const document = parseStoredFlow(row.documentJson);
      assertFlowIdentity(document, projectId, flowId);
      if (document.schemaVersion !== row.schemaVersion) {
        throw new FlowWeaveError("FLOW_PERSISTENCE_FAILED", "Flow schema 元数据不一致");
      }
      return {
        document,
        revision: row.revision,
        updatedAt: row.updatedAt,
      };
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 使用 expectedRevision 保存 v1/v2；文档、版本、清理与 CAS 在同一事务。 */
  saveFlowRevision(input: SaveFlowRevisionInput): FlowRevisionRecord {
    assertExpectedRevision(input.expectedRevision);
    const document = parseFlowDocument(input.document);
    assertFlowIdentity(document, input.projectId, input.flowId);
    const documentJson = JSON.stringify(document);
    const { db, sqlite } = openProjectDatabase(
      input.projectId,
      this.dataDir,
      this.databaseOptions,
    );
    try {
      const saveTransaction = sqlite.transaction(() => {
        const existing = db
          .select()
          .from(dbSchema.flows)
          .where(
            and(
              eq(dbSchema.flows.projectId, input.projectId),
              eq(dbSchema.flows.id, input.flowId),
            ),
          )
          .get();
        if (!existing) {
          throw new FlowWeaveError("VALIDATION_FAILED", "Flow 不存在");
        }
        if (existing.revision !== input.expectedRevision) {
          throw new FlowWeaveError("FLOW_REVISION_CONFLICT", "Flow revision 已变化", {
            expectedRevision: input.expectedRevision,
            currentRevision: existing.revision,
          });
        }
        const currentDocument = parseStoredFlow(existing.documentJson);
        assertFlowIdentity(currentDocument, input.projectId, input.flowId);
        if (
          existing.schemaVersion !== currentDocument.schemaVersion ||
          currentDocument.schemaVersion !== document.schemaVersion
        ) {
          throw new FlowWeaveError(
            "FLOW_SCHEMA_MISMATCH",
            "跨 schema 保存必须使用升级或恢复命令",
          );
        }
        if (existing.documentJson === documentJson) {
          return {
            document,
            revision: existing.revision,
            updatedAt: existing.updatedAt,
          };
        }

        const now = new Date().toISOString();
        this.appendFlowVersion(db, {
          projectId: input.projectId,
          flowId: input.flowId,
          documentJson: existing.documentJson,
          schemaVersion: existing.schemaVersion,
          sourceRevision: existing.revision,
          changeMessage: input.changeMessage ?? "保存前自动快照",
          createdAt: now,
        });
        this.beforeVNextPersistenceStep("save:after-version");
        this.cleanRecentValues(db, input.flowId, document);
        this.beforeVNextPersistenceStep("save:after-recent-cleanup");

        const nextRevision = existing.revision + 1;
        const update = db
          .update(dbSchema.flows)
          .set({
            name: document.name,
            documentJson,
            schemaVersion: document.schemaVersion,
            revision: nextRevision,
            updatedAt: now,
          })
          .where(
            and(
              eq(dbSchema.flows.projectId, input.projectId),
              eq(dbSchema.flows.id, input.flowId),
              eq(dbSchema.flows.revision, input.expectedRevision),
            ),
          )
          .run();
        if (update.changes !== 1) {
          throw new FlowWeaveError("FLOW_REVISION_CONFLICT", "Flow revision 已变化", {
            expectedRevision: input.expectedRevision,
          });
        }
        return { document, revision: nextRevision, updatedAt: now };
      });
      return saveTransaction.immediate();
    } catch (error: unknown) {
      persistenceFailure(error);
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 在事务内重新预览并核对 fingerprint，禁止调用方直接提交未复核 candidate。 */
  upgradeFlowToV2(input: UpgradeFlowToV2Input): FlowRevisionRecord {
    assertExpectedRevision(input.expectedRevision);
    if (!/^[a-f0-9]{64}$/.test(input.reportFingerprint)) {
      throw new FlowWeaveError("FLOW_UPGRADE_BLOCKED", "迁移报告 fingerprint 无效");
    }
    const { db, sqlite } = openProjectDatabase(
      input.projectId,
      this.dataDir,
      this.databaseOptions,
    );
    try {
      sqlite.pragma("busy_timeout = 0");
      const checkpoint = sqlite.pragma("wal_checkpoint(TRUNCATE)") as Array<{
        busy?: number;
        log?: number;
        checkpointed?: number;
      }>;
      if (checkpoint.some((row) => (row.busy ?? 0) !== 0)) {
        throw new FlowWeaveError(
          "FLOW_PERSISTENCE_FAILED",
          "Flow 升级维护锁不可用",
        );
      }
      const journalMode = sqlite.pragma("journal_mode = DELETE", { simple: true });
      if (String(journalMode).toLowerCase() !== "delete") {
        throw new FlowWeaveError(
          "FLOW_PERSISTENCE_FAILED",
          "Flow 升级维护锁不可用",
        );
      }
      const upgradeTransaction = sqlite.transaction(() => {
        const existing = db
          .select()
          .from(dbSchema.flows)
          .where(
            and(
              eq(dbSchema.flows.projectId, input.projectId),
              eq(dbSchema.flows.id, input.flowId),
            ),
          )
          .get();
        if (!existing) {
          throw new FlowWeaveError("VALIDATION_FAILED", "Flow 不存在");
        }
        if (existing.revision !== input.expectedRevision) {
          throw new FlowWeaveError("FLOW_REVISION_CONFLICT", "Flow revision 已变化", {
            expectedRevision: input.expectedRevision,
            currentRevision: existing.revision,
          });
        }
        const currentV1 = parseFlowDocumentV1(JSON.parse(existing.documentJson));
        assertFlowIdentity(currentV1, input.projectId, input.flowId);
        const preview = previewFlowV1Upgrade(currentV1, {
          rememberSelections: input.rememberSelections,
        });
        if (
          preview.blockingIssues.length > 0 ||
          !preview.candidate ||
          preview.reportFingerprint !== input.reportFingerprint
        ) {
          throw new FlowWeaveError("FLOW_UPGRADE_BLOCKED", "迁移报告已变化或存在阻塞项", {
            reportFingerprint: preview.reportFingerprint,
          });
        }

        const sensitiveNames = new Set(
          preview.fieldMappings
            .filter((mapping) => mapping.sensitive)
            .map((mapping) => mapping.variableName),
        );
        const cleanup = this.sanitizeUpgradeHistory(
          db,
          input.projectId,
          input.flowId,
          currentV1,
          sensitiveNames,
        );
        assertNoSensitiveValue(
          preview.candidate,
          cleanup.sensitiveValues,
          "迁移候选仍包含已识别敏感值",
        );
        this.beforeVNextPersistenceStep("upgrade:after-history-cleanup");

        const now = new Date().toISOString();
        this.appendFlowVersion(db, {
          projectId: input.projectId,
          flowId: input.flowId,
          documentJson: JSON.stringify(cleanup.safeCurrent),
          schemaVersion: cleanup.safeCurrent.schemaVersion,
          sourceRevision: existing.revision,
          changeMessage: "升级到 Flow schema v2 前安全快照",
          createdAt: now,
        });
        this.beforeVNextPersistenceStep("upgrade:after-safe-version");
        db.delete(dbSchema.flowFieldRecentValues)
          .where(eq(dbSchema.flowFieldRecentValues.flowId, input.flowId))
          .run();
        this.beforeVNextPersistenceStep("upgrade:after-recent-cleanup");

        const candidate = parseFlowDocumentV2(preview.candidate);
        const nextRevision = existing.revision + 1;
        const update = db
          .update(dbSchema.flows)
          .set({
            name: candidate.name,
            documentJson: JSON.stringify(candidate),
            schemaVersion: candidate.schemaVersion,
            revision: nextRevision,
            updatedAt: now,
          })
          .where(
            and(
              eq(dbSchema.flows.projectId, input.projectId),
              eq(dbSchema.flows.id, input.flowId),
              eq(dbSchema.flows.revision, input.expectedRevision),
            ),
          )
          .run();
        if (update.changes !== 1) {
          throw new FlowWeaveError("FLOW_REVISION_CONFLICT", "Flow revision 已变化", {
            expectedRevision: input.expectedRevision,
          });
        }
        this.beforeVNextPersistenceStep("upgrade:after-cas");
        return {
          record: { document: candidate, revision: nextRevision, updatedAt: now },
          sensitiveValues: cleanup.sensitiveValues,
        };
      });
      const result = upgradeTransaction.exclusive();
      this.assertPhysicalSecretErasure(input.projectId, result.sensitiveValues);
      return result.record;
    } catch (error: unknown) {
      persistenceFailure(error);
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 跨 v1/v2 原子恢复；恢复本身也产生新的单调 revision。 */
  restoreFlowRevision(input: RestoreFlowRevisionInput): FlowRevisionRecord {
    assertExpectedRevision(input.expectedRevision);
    const { db, sqlite } = openProjectDatabase(
      input.projectId,
      this.dataDir,
      this.databaseOptions,
    );
    try {
      const restoreTransaction = sqlite.transaction(() => {
        const current = db
          .select()
          .from(dbSchema.flows)
          .where(
            and(
              eq(dbSchema.flows.projectId, input.projectId),
              eq(dbSchema.flows.id, input.flowId),
            ),
          )
          .get();
        if (!current) {
          throw new FlowWeaveError("VALIDATION_FAILED", "Flow 不存在");
        }
        if (current.revision !== input.expectedRevision) {
          throw new FlowWeaveError("FLOW_REVISION_CONFLICT", "Flow revision 已变化", {
            expectedRevision: input.expectedRevision,
            currentRevision: current.revision,
          });
        }
        const version = db
          .select()
          .from(dbSchema.flowVersions)
          .where(
            and(
              eq(dbSchema.flowVersions.projectId, input.projectId),
              eq(dbSchema.flowVersions.flowId, input.flowId),
              eq(dbSchema.flowVersions.id, input.versionId),
            ),
          )
          .get();
        if (!version) {
          throw new FlowWeaveError("VALIDATION_FAILED", "Flow 版本不存在或归属不匹配");
        }
        const target = parseStoredFlow(version.documentJson);
        assertFlowIdentity(target, input.projectId, input.flowId);
        if (target.schemaVersion !== version.schemaVersion) {
          throw new FlowWeaveError("FLOW_PERSISTENCE_FAILED", "Flow 版本 schema 元数据不一致");
        }
        const now = new Date().toISOString();
        this.appendFlowVersion(db, {
          projectId: input.projectId,
          flowId: input.flowId,
          documentJson: current.documentJson,
          schemaVersion: current.schemaVersion,
          sourceRevision: current.revision,
          changeMessage: input.changeMessage ?? "版本恢复前自动快照",
          createdAt: now,
        });
        this.beforeVNextPersistenceStep("restore:after-version");
        this.cleanRecentValues(db, input.flowId, target);
        this.beforeVNextPersistenceStep("restore:after-recent-cleanup");
        const nextRevision = current.revision + 1;
        const update = db
          .update(dbSchema.flows)
          .set({
            name: target.name,
            documentJson: JSON.stringify(target),
            schemaVersion: target.schemaVersion,
            revision: nextRevision,
            updatedAt: now,
          })
          .where(
            and(
              eq(dbSchema.flows.projectId, input.projectId),
              eq(dbSchema.flows.id, input.flowId),
              eq(dbSchema.flows.revision, input.expectedRevision),
            ),
          )
          .run();
        if (update.changes !== 1) {
          throw new FlowWeaveError("FLOW_REVISION_CONFLICT", "Flow revision 已变化", {
            expectedRevision: input.expectedRevision,
          });
        }
        return { document: target, revision: nextRevision, updatedAt: now };
      });
      return restoreTransaction.immediate();
    } catch (error: unknown) {
      persistenceFailure(error);
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 只保存当前 v2 明确允许 remember:lastValue 的非敏感标量。 */
  saveFlowFieldRecentValues(input: SaveFlowFieldRecentValuesInput): void {
    assertExpectedRevision(input.expectedRevision);
    const { db, sqlite } = openProjectDatabase(
      input.projectId,
      this.dataDir,
      this.databaseOptions,
    );
    try {
      const saveTransaction = sqlite.transaction(() => {
        const row = db
          .select()
          .from(dbSchema.flows)
          .where(
            and(
              eq(dbSchema.flows.projectId, input.projectId),
              eq(dbSchema.flows.id, input.flowId),
            ),
          )
          .get();
        if (!row) {
          throw new FlowWeaveError("VALIDATION_FAILED", "Flow 不存在");
        }
        if (row.revision !== input.expectedRevision) {
          throw new FlowWeaveError("FLOW_REVISION_CONFLICT", "Flow revision 已变化", {
            expectedRevision: input.expectedRevision,
            currentRevision: row.revision,
          });
        }
        const document = parseFlowDocumentV2(JSON.parse(row.documentJson));
        const fields = collectV2Fields(document);
        const entries = Object.entries(input.values);
        for (const [fieldId, value] of entries) {
          const field = fields.get(fieldId);
          if (!field || !isRecentValueCompatible(field, value)) {
            throw new FlowWeaveError(
              "FLOW_SENSITIVE_POLICY_INVALID",
              "字段不允许保存最近值",
            );
          }
        }
        const now = new Date().toISOString();
        for (const [fieldId, value] of entries) {
          db.insert(dbSchema.flowFieldRecentValues)
            .values({
              flowId: input.flowId,
              fieldId,
              valueJson: JSON.stringify(value),
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                dbSchema.flowFieldRecentValues.flowId,
                dbSchema.flowFieldRecentValues.fieldId,
              ],
              set: { valueJson: JSON.stringify(value), updatedAt: now },
            })
            .run();
        }
      });
      saveTransaction.immediate();
    } catch (error: unknown) {
      persistenceFailure(error);
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  getFlowFieldRecentValues(projectId: string, flowId: string): Record<string, FlowRecentValue> {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const row = db
        .select()
        .from(dbSchema.flows)
        .where(and(eq(dbSchema.flows.projectId, projectId), eq(dbSchema.flows.id, flowId)))
        .get();
      if (!row) {
        throw new FlowWeaveError("VALIDATION_FAILED", "Flow 不存在");
      }
      const parsed = parseStoredFlow(row.documentJson);
      if (parsed.schemaVersion === FLOW_SCHEMA_VERSION) {
        return {};
      }
      const document = parsed;
      const fields = collectV2Fields(document);
      const result: Record<string, FlowRecentValue> = {};
      for (const recent of db
        .select()
        .from(dbSchema.flowFieldRecentValues)
        .where(eq(dbSchema.flowFieldRecentValues.flowId, flowId))
        .all()) {
        let value: unknown;
        try {
          value = JSON.parse(recent.valueJson);
        } catch {
          continue;
        }
        const field = fields.get(recent.fieldId);
        if (field && isRecentValueCompatible(field, value)) {
          result[recent.fieldId] = value;
        }
      }
      return result;
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 导出同 schema 的可移植文档，不包含版本、最近值、执行或本机状态。 */
  exportFlow(projectId: string, flowId: string): AnyFlowDocument {
    const revision = this.getFlowRevision(projectId, flowId);
    if (!revision) {
      throw new FlowWeaveError("VALIDATION_FAILED", "Flow 不存在");
    }
    if (revision.document.schemaVersion === FLOW_SCHEMA_VERSION) {
      return createPortableFlowDocument(revision.document).document;
    }
    const document = parseFlowDocumentV2(
      JSON.parse(JSON.stringify(revision.document)) as unknown,
    );
    assertPortableV2Document(document);
    return document;
  }

  /** 将裸 v1/v2 FlowDocument 安全导入目标项目，每次都创建独立副本。 */
  importFlow(projectId: string, input: unknown): FlowImportResult {
    const projectExists = this.listProjects().some((project) => project.id === projectId);
    if (!projectExists) {
      throw new FlowWeaveError("PROJECT_NOT_FOUND", "目标项目不存在");
    }

    let portable: { document: AnyFlowDocument; warnings: FlowImportResult["warnings"] };
    try {
      const source = parseFlowDocument(input);
      if (source.schemaVersion === FLOW_SCHEMA_VERSION) {
        portable = createPortableFlowDocument(source);
      } else {
        assertPortableV2Document(source);
        portable = { document: source, warnings: [] };
      }
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
        const flow = parseFlowDocument({
          ...portable.document,
          id: randomUUID(),
          projectId,
          name,
          meta: { ...portable.document.meta, createdAt: now, updatedAt: now },
        });
        db.insert(dbSchema.flows)
          .values({
            id: flow.id,
            projectId,
            name: flow.name,
            documentJson: JSON.stringify(flow),
            schemaVersion: flow.schemaVersion,
            revision: 1,
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
        .where(and(eq(dbSchema.flows.projectId, projectId), eq(dbSchema.flows.id, flowId)))
        .get();
      if (!row) {
        return null;
      }
      if (row.schemaVersion !== FLOW_SCHEMA_VERSION) {
        throw new FlowWeaveError(
          "FLOW_SCHEMA_VERSION_UNSUPPORTED",
          "legacy getFlowInProject 只允许读取 v1 Flow",
          { schemaVersion: row.schemaVersion },
        );
      }
      return parseFlowDocumentV1(JSON.parse(row.documentJson));
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
      if (row.schemaVersion !== FLOW_SCHEMA_VERSION) {
        throw new FlowWeaveError(
          "FLOW_SCHEMA_VERSION_UNSUPPORTED",
          "legacy getFlowVersion 只允许读取 v1 Flow",
          { schemaVersion: row.schemaVersion },
        );
      }
      return parseFlowDocumentV1(JSON.parse(row.documentJson));
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 正式历史读取入口：支持 v1/v2，并按项目、Flow、版本三重归属校验。 */
  getFlowVersionInFlow(
    projectId: string,
    flowId: string,
    versionId: string,
  ): AnyFlowDocument | null {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const row = db
        .select()
        .from(dbSchema.flowVersions)
        .where(
          and(
            eq(dbSchema.flowVersions.projectId, projectId),
            eq(dbSchema.flowVersions.flowId, flowId),
            eq(dbSchema.flowVersions.id, versionId),
          ),
        )
        .get();
      if (!row) {
        return null;
      }
      const document = parseStoredFlow(row.documentJson);
      assertFlowIdentity(document, projectId, flowId);
      if (document.schemaVersion !== row.schemaVersion) {
        throw new FlowWeaveError("FLOW_PERSISTENCE_FAILED", "Flow 版本 schema 元数据不一致");
      }
      return document;
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  restoreFlowVersion(
    projectId: string,
    versionId: string,
    expectedRevision: number,
  ): FlowDocument {
    assertExpectedRevision(expectedRevision);
    const document = this.getFlowVersion(projectId, versionId);
    if (!document) {
      throw new Error(`未找到版本: ${versionId}`);
    }
    const restored = this.restoreFlowRevision({
      projectId,
      flowId: document.id,
      versionId,
      expectedRevision,
      changeMessage: "从版本恢复",
    });
    if (restored.document.schemaVersion !== FLOW_SCHEMA_VERSION) {
      throw new FlowWeaveError(
        "FLOW_SCHEMA_VERSION_UNSUPPORTED",
        "legacy restoreFlowVersion 只允许恢复 v1 Flow",
      );
    }
    return restored.document;
  }

  private appendFlowVersion(
    db: ReturnType<typeof openProjectDatabase>["db"],
    input: {
      projectId: string;
      flowId: string;
      documentJson: string;
      schemaVersion: number;
      sourceRevision: number;
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
        schemaVersion: input.schemaVersion,
        sourceRevision: input.sourceRevision,
        changeMessage: input.changeMessage ?? null,
        createdAt: input.createdAt,
      })
      .run();
  }

  private cleanRecentValues(
    db: ReturnType<typeof openProjectDatabase>["db"],
    flowId: string,
    document: AnyFlowDocument,
  ): void {
    if (document.schemaVersion === FLOW_SCHEMA_VERSION) {
      db.delete(dbSchema.flowFieldRecentValues)
        .where(eq(dbSchema.flowFieldRecentValues.flowId, flowId))
        .run();
      return;
    }

    const fields = collectV2Fields(document);
    const rows = db
      .select()
      .from(dbSchema.flowFieldRecentValues)
      .where(eq(dbSchema.flowFieldRecentValues.flowId, flowId))
      .all();
    for (const row of rows) {
      let value: unknown;
      try {
        value = JSON.parse(row.valueJson);
      } catch {
        value = undefined;
      }
      const field = fields.get(row.fieldId);
      if (!field || !isRecentValueCompatible(field, value)) {
        db.delete(dbSchema.flowFieldRecentValues)
          .where(
            and(
              eq(dbSchema.flowFieldRecentValues.flowId, flowId),
              eq(dbSchema.flowFieldRecentValues.fieldId, row.fieldId),
            ),
          )
          .run();
      }
    }
  }

  private sanitizeUpgradeHistory(
    db: ReturnType<typeof openProjectDatabase>["db"],
    projectId: string,
    flowId: string,
    current: FlowDocumentV1,
    sensitiveVariableNames: ReadonlySet<string>,
  ): { safeCurrent: FlowDocumentV1; sensitiveValues: ReadonlySet<string> } {
    const sensitiveValues = new Set<string>();
    const collectDefaults = (document: FlowDocumentV1) => {
      for (const variable of document.variables) {
        if (
          sensitiveVariableNames.has(variable.name) &&
          typeof variable.defaultValue === "string" &&
          variable.defaultValue.length > 0
        ) {
          sensitiveValues.add(variable.defaultValue);
        }
      }
    };
    collectDefaults(current);

    const versionRows = db
      .select()
      .from(dbSchema.flowVersions)
      .where(
        and(
          eq(dbSchema.flowVersions.projectId, projectId),
          eq(dbSchema.flowVersions.flowId, flowId),
        ),
      )
      .all();
    const parsedVersions = versionRows.map((row) => {
      const document = parseStoredFlow(row.documentJson);
      assertFlowIdentity(document, projectId, flowId);
      if (document.schemaVersion === FLOW_SCHEMA_VERSION) {
        collectDefaults(document);
      }
      return { row, document };
    });

    const executionRows = db
      .select()
      .from(dbSchema.executions)
      .where(
        and(
          eq(dbSchema.executions.projectId, projectId),
          eq(dbSchema.executions.flowId, flowId),
        ),
      )
      .all();
    const parsedExecutions = executionRows.map((row) => {
      let variables: Record<string, unknown> | undefined;
      if (row.variablesJson !== null) {
        try {
          const parsed = JSON.parse(row.variablesJson) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("invalid variables");
          }
          variables = { ...(parsed as Record<string, unknown>) };
        } catch {
          throw new FlowWeaveError(
            "FLOW_PERSISTENCE_FAILED",
            "历史执行上下文不可安全清理",
          );
        }
        for (const name of sensitiveVariableNames) {
          const value = variables[name];
          collectStringValues(value, sensitiveValues);
        }
      }

      let flowSnapshot: FlowDocumentV1 | undefined;
      if (row.flowSnapshotJson !== null) {
        const snapshot = parseStoredFlow(row.flowSnapshotJson);
        if (snapshot.schemaVersion !== FLOW_SCHEMA_VERSION) {
          throw new FlowWeaveError(
            "FLOW_SCHEMA_VERSION_UNSUPPORTED",
            "vNext-2 前不允许清理 v2 execution 快照",
          );
        }
        collectDefaults(snapshot);
        flowSnapshot = snapshot;
      }
      return { row, variables, flowSnapshot };
    });

    const safeCurrent = parseFlowDocumentV1(
      scrubSensitiveStructure(
        sanitizeV1Document(current, sensitiveVariableNames),
        sensitiveValues,
      ),
    );
    assertNoSensitiveValue(safeCurrent, sensitiveValues, "当前 Flow 安全快照清理失败");

    for (const entry of parsedVersions) {
      const withoutSensitiveDefaults =
        entry.document.schemaVersion === FLOW_SCHEMA_VERSION
          ? sanitizeV1Document(entry.document, sensitiveVariableNames)
          : entry.document;
      const safeDocument = parseFlowDocument(
        scrubSensitiveStructure(withoutSensitiveDefaults, sensitiveValues),
      );
      assertNoSensitiveValue(safeDocument, sensitiveValues, "历史 Flow 安全清理失败");
      const safeChangeMessage = scrubSensitiveString(entry.row.changeMessage, sensitiveValues);
      assertNoSensitiveValue(safeChangeMessage, sensitiveValues, "历史版本说明安全清理失败");
      db.update(dbSchema.flowVersions)
        .set({
          documentJson: JSON.stringify(safeDocument),
          schemaVersion: safeDocument.schemaVersion,
          changeMessage: safeChangeMessage,
        })
        .where(eq(dbSchema.flowVersions.id, entry.row.id))
        .run();
    }
    for (const entry of parsedExecutions) {
      const variables = entry.variables === undefined ? undefined : { ...entry.variables };
      if (variables) {
        for (const name of sensitiveVariableNames) {
          delete variables[name];
        }
      }
      const safeVariables =
        variables === undefined
          ? undefined
          : scrubSensitiveStructure(variables, sensitiveValues);
      assertNoSensitiveValue(safeVariables, sensitiveValues, "执行变量安全清理失败");
      const safeSnapshot =
        entry.flowSnapshot === undefined
          ? undefined
          : parseFlowDocumentV1(
              scrubSensitiveStructure(
                sanitizeV1Document(entry.flowSnapshot, sensitiveVariableNames),
                sensitiveValues,
              ),
            );
      assertNoSensitiveValue(safeSnapshot, sensitiveValues, "执行快照安全清理失败");
      const environmentName = scrubSensitiveString(
        entry.row.environmentName,
        sensitiveValues,
      );
      const baseUrl = scrubSensitiveString(entry.row.baseUrl, sensitiveValues);
      const storageStatePath = scrubSensitiveString(
        entry.row.storageStatePath,
        sensitiveValues,
      );
      assertNoSensitiveValue(
        { environmentName, baseUrl, storageStatePath },
        sensitiveValues,
        "执行上下文安全清理失败",
      );
      db.update(dbSchema.executions)
        .set({
          variablesJson: safeVariables === undefined ? null : JSON.stringify(safeVariables),
          flowSnapshotJson: safeSnapshot === undefined ? null : JSON.stringify(safeSnapshot),
          environmentName,
          baseUrl,
          storageStatePath,
        })
        .where(eq(dbSchema.executions.id, entry.row.id))
        .run();

      const stepRows = db
        .select()
        .from(dbSchema.executionSteps)
        .where(eq(dbSchema.executionSteps.executionId, entry.row.id))
        .all();
      for (const step of stepRows) {
        const errorMessage = scrubSensitiveString(step.errorMessage, sensitiveValues);
        const screenshotPath = scrubSensitiveString(step.screenshotPath, sensitiveValues);
        const diagnosticPath = scrubSensitiveString(step.diagnosticPath, sensitiveValues);
        assertNoSensitiveValue(
          { errorMessage, screenshotPath, diagnosticPath },
          sensitiveValues,
          "执行步骤元数据安全清理失败",
        );
        db.update(dbSchema.executionSteps)
          .set({
            errorMessage,
            screenshotPath,
            diagnosticPath,
          })
          .where(eq(dbSchema.executionSteps.id, step.id))
          .run();
      }
    }
    return { safeCurrent, sensitiveValues };
  }

  private assertPhysicalSecretErasure(
    projectId: string,
    sensitiveValues: ReadonlySet<string>,
  ): void {
    const storePath = resolveProjectStorePath(projectId, this.dataDir);
    for (const path of [storePath, `${storePath}-wal`, `${storePath}-shm`]) {
      if (!existsSync(path)) {
        continue;
      }
      const bytes = readFileSync(path);
      for (const sensitiveValue of sensitiveValues) {
        if (!sensitiveValue) {
          continue;
        }
        const escaped = JSON.stringify(sensitiveValue).slice(1, -1);
        if (
          bytes.includes(Buffer.from(sensitiveValue)) ||
          bytes.includes(Buffer.from(escaped))
        ) {
          throw new FlowWeaveError(
            "FLOW_PERSISTENCE_FAILED",
            "Flow 升级后的物理存储安全验证失败",
          );
        }
      }
    }
  }

  private toFlowVersionRecord(
    row: typeof dbSchema.flowVersions.$inferSelect,
  ): FlowVersionRecord {
    const doc = parseStoredFlow(row.documentJson);
    if (doc.schemaVersion !== row.schemaVersion) {
      throw new FlowWeaveError("FLOW_PERSISTENCE_FAILED", "Flow 版本 schema 元数据不一致");
    }
    return {
      id: row.id,
      flowId: row.flowId,
      projectId: row.projectId,
      version: row.version,
      name: doc.name,
      stepCount: doc.steps.length,
      schemaVersion: doc.schemaVersion,
      sourceRevision: row.sourceRevision,
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
      const saveTransaction = sqlite.transaction(() => {
        const flow = db
          .select({
            id: dbSchema.flows.id,
            projectId: dbSchema.flows.projectId,
            schemaVersion: dbSchema.flows.schemaVersion,
            documentJson: dbSchema.flows.documentJson,
          })
          .from(dbSchema.flows)
          .where(
            and(
              eq(dbSchema.flows.projectId, projectId),
              eq(dbSchema.flows.id, result.flowId),
            ),
          )
          .get();
        if (!flow) {
          throw new FlowWeaveError("VALIDATION_FAILED", "执行引用的 Flow 不存在");
        }
        if (flow.schemaVersion !== FLOW_SCHEMA_VERSION) {
          throw new FlowWeaveError(
            "FLOW_SCHEMA_VERSION_UNSUPPORTED",
            "vNext-2 前不能保存 v2 execution",
            { schemaVersion: flow.schemaVersion },
          );
        }
        const storedFlow = parseFlowDocumentV1(JSON.parse(flow.documentJson));
        if (storedFlow.id !== result.flowId || storedFlow.projectId !== projectId) {
          throw new FlowWeaveError("FLOW_PERSISTENCE_FAILED", "execution 引用的 Flow 身份不一致");
        }
        if (result.flowSnapshot) {
          const snapshot = parseFlowDocumentV1(result.flowSnapshot);
          if (snapshot.id !== result.flowId || snapshot.projectId !== projectId) {
            throw new FlowWeaveError("VALIDATION_FAILED", "execution 快照身份不一致");
          }
        }
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

  listFlows(projectId: string): Array<{
    id: string;
    name: string;
    createdAt: string;
    revision: number;
    schemaVersion: number;
  }> {
    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      return db
        .select({
          id: dbSchema.flows.id,
          name: dbSchema.flows.name,
          createdAt: dbSchema.flows.createdAt,
          revision: dbSchema.flows.revision,
          schemaVersion: dbSchema.flows.schemaVersion,
        })
        .from(dbSchema.flows)
        .where(eq(dbSchema.flows.projectId, projectId))
        .orderBy(desc(dbSchema.flows.createdAt))
        .all();
    } finally {
      closeProjectDatabase(sqlite);
    }
  }

  /** 仅更新 Flow 名称（不新增版本快照） */
  renameFlow(
    projectId: string,
    flowId: string,
    name: string,
    expectedRevision: number,
  ): FlowDocument {
    assertExpectedRevision(expectedRevision);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Flow 名称不能为空");
    }

    const { db, sqlite } = openProjectDatabase(projectId, this.dataDir, this.databaseOptions);
    try {
      const row = db
        .select()
        .from(dbSchema.flows)
        .where(and(eq(dbSchema.flows.projectId, projectId), eq(dbSchema.flows.id, flowId)))
        .get();
      if (!row) {
        throw new Error("Flow 不存在");
      }
      if (row.revision !== expectedRevision) {
        throw new FlowWeaveError("FLOW_REVISION_CONFLICT", "Flow revision 已变化", {
          expectedRevision,
          currentRevision: row.revision,
        });
      }

      if (row.schemaVersion !== FLOW_SCHEMA_VERSION) {
        throw new FlowWeaveError(
          "FLOW_SCHEMA_VERSION_UNSUPPORTED",
          "legacy renameFlow 只允许更新 v1 Flow",
          { schemaVersion: row.schemaVersion },
        );
      }

      const document = parseFlowDocumentV1(JSON.parse(row.documentJson));
      const now = new Date().toISOString();
      const updated: FlowDocument = {
        ...document,
        name: trimmed,
        meta: {
          ...document.meta,
          updatedAt: now,
        },
      };

      const update = db.update(dbSchema.flows)
        .set({
          name: trimmed,
          documentJson: JSON.stringify(updated),
          revision: row.revision + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(dbSchema.flows.projectId, projectId),
            eq(dbSchema.flows.id, flowId),
            eq(dbSchema.flows.revision, expectedRevision),
          ),
        )
        .run();
      if (update.changes !== 1) {
          throw new FlowWeaveError("FLOW_REVISION_CONFLICT", "Flow revision 已变化", {
          expectedRevision,
        });
      }

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
          if (row.schemaVersion !== FLOW_SCHEMA_VERSION) {
            throw new FlowWeaveError(
              "FLOW_SCHEMA_VERSION_UNSUPPORTED",
              "legacy getFlow 只允许读取 v1 Flow",
              { schemaVersion: row.schemaVersion },
            );
          }
          return parseFlowDocumentV1(JSON.parse(row.documentJson));
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
