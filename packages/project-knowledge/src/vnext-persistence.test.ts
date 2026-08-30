import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import {
  previewFlowV1Upgrade,
  type FlowDocumentV1,
  type FlowDocumentV2,
} from "@flowweave/flow-dsl";
import { FLOW_SCHEMA_VERSION, FLOW_SCHEMA_VERSION_V2 } from "@flowweave/shared";
import { afterEach, describe, expect, it } from "vitest";

import { closeProjectDatabase, openProjectDatabase, resolveProjectStorePath } from "./db/client.js";
import { ProjectKnowledgeRepository } from "./repository.js";

const SECRET_CANARY = 'FLOWWEAVE_SECRET_CANARY_vnext_1b_7f4c1e"\\line\nnext';
const HISTORY_DELETED_CANARY = 'FLOWWEAVE_HISTORY_DELETED_vnext_1_91e2"\\line\nnext';
const HISTORY_RENAMED_CANARY = "FLOWWEAVE_HISTORY_RENAMED_vnext_1_3c7a";
const HISTORY_PASSWORD_LITERAL = "FLOWWEAVE_HISTORY_PASSWORD_LITERAL_vnext_1_62bd";
const HISTORY_UPLOAD_LITERAL = "/private/FLOWWEAVE_HISTORY_UPLOAD_vnext_1_807a.pdf";
const HISTORY_URL_LITERAL = 'FLOWWEAVE_HISTORY_URL_vnext_1_b1d4"\\line\nnext';
const HISTORY_URL_ENCODED = encodeURIComponent(HISTORY_URL_LITERAL);
const ORPHAN_EXECUTION_VARIABLES = {
  secret_orphan: 'FLOWWEAVE_ORPHAN_SECRET_vnext_1_1a2b"\\line\nnext',
  Secret_API_Key: 'FLOWWEAVE_ORPHAN_API_KEY_vnext_1_2b3c"\\line\nnext',
  "secret-password": 'FLOWWEAVE_ORPHAN_PASSWORD_DASH_vnext_1_3c4d"\\line\nnext',
  "SECRET.PASSWORD": 'FLOWWEAVE_ORPHAN_PASSWORD_DOT_vnext_1_4d5e"\\line\nnext',
  telemetryNote: 'FLOWWEAVE_ORPHAN_ORDINARY_NAME_vnext_1_5e6f"\\line\nnext',
} as const;
const ORPHAN_EXECUTION_CANARIES = Object.values(ORPHAN_EXECUTION_VARIABLES);

function assertNoValuesInPhysicalStore(storePath: string, values: readonly string[]): void {
  for (const path of [storePath, `${storePath}-wal`, `${storePath}-shm`]) {
    if (!existsSync(path)) {
      continue;
    }
    const bytes = readFileSync(path);
    for (const value of values) {
      const escapedValue = JSON.stringify(value).slice(1, -1);
      expect(bytes.includes(Buffer.from(value)), `${path} 含 raw ${value}`).toBe(false);
      expect(bytes.includes(Buffer.from(escapedValue)), `${path} 含 escaped ${value}`).toBe(
        false,
      );
    }
  }
}

function assertNoCanaryBytes(storePath: string): void {
  assertNoValuesInPhysicalStore(storePath, [SECRET_CANARY]);
}

function buildV1(projectId: string, flowId: string): FlowDocumentV1 {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: flowId,
    projectId,
    name: "带安全策略的旧流程",
    variables: [
      {
        name: "account",
        type: "string",
        required: true,
      },
      {
        name: "secret_password",
        type: "string",
        required: true,
        defaultValue: SECRET_CANARY,
      },
    ],
    steps: [
      {
        id: "fill_account",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#account" }] },
        value: "{{account}}",
      },
      {
        id: "fill_password",
        type: "fill",
        target: {
          strategies: [{ kind: "css", selector: "input[type=password]" }],
          hints: { inputType: "password" },
        },
        value: "{{secret_password}}",
      },
    ],
    meta: {
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      source: "recorded",
    },
  };
}

function prepareUpgrade(flow: FlowDocumentV1) {
  const first = previewFlowV1Upgrade(flow);
  const accountFieldId = first.fieldMappings.find(
    (mapping) => mapping.variableName === "account",
  )!.fieldId;
  const secretFieldId = first.fieldMappings.find(
    (mapping) => mapping.variableName === "secret_password",
  )!.fieldId;
  const rememberSelections = { [accountFieldId]: "lastValue" as const };
  const preview = previewFlowV1Upgrade(flow, { rememberSelections });
  if (!preview.candidate) {
    throw new Error("测试迁移候选生成失败");
  }
  return {
    accountFieldId,
    secretFieldId,
    rememberSelections,
    preview: preview as typeof preview & { candidate: FlowDocumentV2 },
  };
}

function prepareUpgradeWithoutRecentValues(flow: FlowDocumentV1) {
  const preview = previewFlowV1Upgrade(flow);
  if (!preview.candidate) {
    throw new Error("测试迁移候选生成失败");
  }
  return {
    rememberSelections: {},
    preview: preview as typeof preview & { candidate: FlowDocumentV2 },
  };
}

function createLegacyStore(dataDir: string, projectId: string): string {
  const storePath = resolveProjectStorePath(projectId, dataDir);
  mkdirSync(dirname(storePath), { recursive: true });
  const sqlite = new Database(storePath);
  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE flows (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      document_json TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE flow_versions (
      id TEXT PRIMARY KEY NOT NULL,
      flow_id TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      document_json TEXT NOT NULL,
      change_message TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const flow = buildV1(projectId, "flow_legacy_migration");
  sqlite
    .prepare("INSERT INTO projects VALUES (?, ?, ?, ?)")
    .run(projectId, "旧库", flow.meta.createdAt, flow.meta.updatedAt);
  sqlite
    .prepare("INSERT INTO flows VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(
      flow.id,
      projectId,
      flow.name,
      JSON.stringify(flow),
      flow.schemaVersion,
      flow.meta.createdAt,
      flow.meta.updatedAt,
    );
  sqlite.close();
  return storePath;
}

describe("vNext-1B Knowledge 数据基础", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("集中 migration 增量升级旧库且重复打开保持幂等", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-migration-"));
    const projectId = "project_legacy_migration";
    const storePath = createLegacyStore(dataDir, projectId);

    for (let index = 0; index < 2; index += 1) {
      const opened = openProjectDatabase(projectId, dataDir);
      closeProjectDatabase(opened.sqlite);
    }

    const sqlite = new Database(storePath, { readonly: true });
    const flowColumns = sqlite.pragma("table_info(flows)") as Array<{ name: string }>;
    const versionColumns = sqlite.pragma("table_info(flow_versions)") as Array<{ name: string }>;
    const recentTable = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("flow_field_recent_values");
    const revision = sqlite
      .prepare("SELECT revision FROM flows WHERE id = ?")
      .pluck()
      .get("flow_legacy_migration");
    sqlite.close();

    expect(flowColumns.map((column) => column.name)).toContain("revision");
    expect(versionColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["schema_version", "source_revision"]),
    );
    expect(recentTable).toBeTruthy();
    expect(revision).toBe(1);
  });

  it("新建 v1 Flow 的 revision 初始化为 1", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-revision-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("revision 初始化");
    const flow = buildV1(project.id, "flow_revision_initial");
    repo.saveFlow(project.id, flow);

    expect(repo.getFlowRevision(project.id, flow.id)).toMatchObject({
      revision: 1,
      document: { id: flow.id, schemaVersion: FLOW_SCHEMA_VERSION },
    });
  });

  it("两个相同 expectedRevision 仅第一个保存成功", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-cas-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("CAS");
    const flow = buildV1(project.id, "flow_revision_cas");
    repo.saveFlow(project.id, flow);

    const first = repo.saveFlowRevision({
      projectId: project.id,
      flowId: flow.id,
      document: { ...flow, name: "第一个写者" },
      expectedRevision: 1,
    });
    expect(first.revision).toBe(2);

    expect(() =>
      repo.saveFlowRevision({
        projectId: project.id,
        flowId: flow.id,
        document: { ...flow, name: "第二个写者" },
        expectedRevision: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "FLOW_REVISION_CONFLICT" }));
    expect(repo.getFlowRevision(project.id, flow.id)?.document.name).toBe("第一个写者");
  });

  it("legacy save 只能创建，rename 与 restore 必须使用调用方 expectedRevision", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-legacy-cas-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("legacy CAS");
    const flow = buildV1(project.id, "flow_legacy_cas");
    repo.saveFlow(project.id, flow);

    expect(() => repo.saveFlow(project.id, { ...flow, name: "静默覆盖" })).toThrowError(
      expect.objectContaining({ code: "FLOW_REVISION_CONFLICT" }),
    );
    expect(() => repo.renameFlow(project.id, flow.id, "陈旧重命名", 0)).toThrowError();

    const renamed = repo.renameFlow(project.id, flow.id, "CAS 重命名", 1);
    expect(renamed.name).toBe("CAS 重命名");
    expect(repo.getFlowRevision(project.id, flow.id)?.revision).toBe(2);
    expect(() => repo.renameFlow(project.id, flow.id, "陈旧重命名", 1)).toThrowError(
      expect.objectContaining({ code: "FLOW_REVISION_CONFLICT" }),
    );
    expect(repo.getFlowRevision(project.id, flow.id)?.document.name).toBe("CAS 重命名");
  });

  it("升级拒绝 stale fingerprint 与 stale revision 且零写入", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-upgrade-stale-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("升级冲突");
    const flow = buildV1(project.id, "flow_upgrade_stale");
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);

    expect(() =>
      repo.upgradeFlowToV2({
        projectId: project.id,
        flowId: flow.id,
        expectedRevision: 1,
        reportFingerprint: "0".repeat(64),
        rememberSelections: prepared.rememberSelections,
      }),
    ).toThrowError(expect.objectContaining({ code: "FLOW_UPGRADE_BLOCKED" }));
    expect(repo.getFlowRevision(project.id, flow.id)?.revision).toBe(1);
    expect(repo.listFlowVersions(project.id, flow.id)).toEqual([]);

    repo.saveFlowRevision({
      projectId: project.id,
      flowId: flow.id,
      document: { ...flow, name: "并发更新" },
      expectedRevision: 1,
    });
    expect(() =>
      repo.upgradeFlowToV2({
        projectId: project.id,
        flowId: flow.id,
        expectedRevision: 1,
        reportFingerprint: prepared.preview.reportFingerprint,
        rememberSelections: prepared.rememberSelections,
      }),
    ).toThrowError(expect.objectContaining({ code: "FLOW_REVISION_CONFLICT" }));
  });

  it("通用 revision 保存不能绕过升级或恢复命令跨 schema 覆盖", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-save-boundary-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("跨版本保存边界");
    const flow = buildV1(project.id, "flow_save_boundary");
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);

    expect(() =>
      repo.saveFlowRevision({
        projectId: project.id,
        flowId: flow.id,
        document: prepared.preview.candidate,
        expectedRevision: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "FLOW_SCHEMA_MISMATCH" }));
    expect(repo.getFlowRevision(project.id, flow.id)).toMatchObject({
      revision: 1,
      document: { schemaVersion: 1 },
    });
  });

  it.each([
    "upgrade:after-history-cleanup",
    "upgrade:after-safe-version",
    "upgrade:after-recent-cleanup",
    "upgrade:after-cas",
    "upgrade:after-physical-erasure-check",
  ])("事务故障点 %s 不会留下半版本、半清理或 revision 漂移", (faultStep) => {
    class FaultRepository extends ProjectKnowledgeRepository {
      protected override beforeVNextPersistenceStep(step: string): void {
        if (step === faultStep) {
          throw new Error("fault");
        }
      }
    }

    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-fault-"));
    const setupRepo = new ProjectKnowledgeRepository({ dataDir });
    const project = setupRepo.createProject("故障注入");
    const flow = buildV1(project.id, "flow_upgrade_fault");
    setupRepo.saveFlow(project.id, flow);
    setupRepo.saveExecution(project.id, {
      executionId: "exec_before_upgrade_fault",
      flowId: flow.id,
      status: "success",
      runContext: {
        variables: {
          secret_password: SECRET_CANARY,
          telemetryNote: ORPHAN_EXECUTION_VARIABLES.telemetryNote,
        },
      },
      steps: [],
    });
    const prepared = prepareUpgrade(flow);
    const repo = new FaultRepository({ dataDir });

    expect(() =>
      repo.upgradeFlowToV2({
        projectId: project.id,
        flowId: flow.id,
        expectedRevision: 1,
        reportFingerprint: prepared.preview.reportFingerprint,
        rememberSelections: prepared.rememberSelections,
      }),
    ).toThrowError(expect.objectContaining({ code: "FLOW_PERSISTENCE_FAILED" }));

    const afterFailure = repo.getFlowRevision(project.id, flow.id);
    expect(afterFailure).toMatchObject({
      revision: 1,
      document: { schemaVersion: FLOW_SCHEMA_VERSION },
    });
    expect(afterFailure?.document).toEqual(flow);
    expect(repo.listFlowVersions(project.id, flow.id)).toEqual([]);
    expect(repo.getExecution("exec_before_upgrade_fault")?.runContext?.variables).toEqual({
      secret_password: SECRET_CANARY,
      telemetryNote: ORPHAN_EXECUTION_VARIABLES.telemetryNote,
    });
  });

  it("升级会清除全部无历史定义来源的 execution variables 并保留已定义非敏感变量", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-orphan-execution-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("孤立 execution variables 清理");
    const flow = buildV1(project.id, "flow_orphan_execution_variables");
    repo.saveFlow(project.id, flow);
    repo.saveExecution(project.id, {
      executionId: "exec_orphan_execution_variables",
      flowId: flow.id,
      status: "success",
      runContext: {
        variables: {
          account: "alice",
          ...ORPHAN_EXECUTION_VARIABLES,
        },
      },
      steps: [],
    });
    const prepared = prepareUpgrade(flow);

    const upgraded = repo.upgradeFlowToV2({
      projectId: project.id,
      flowId: flow.id,
      expectedRevision: 1,
      reportFingerprint: prepared.preview.reportFingerprint,
      rememberSelections: prepared.rememberSelections,
    });
    expect(upgraded).toMatchObject({ revision: 2, document: { schemaVersion: 2 } });

    const versions = repo.listFlowVersions(project.id, flow.id);
    const apiEvidence = JSON.stringify({
      current: repo.getFlowRevision(project.id, flow.id),
      versions,
      versionDocuments: versions.map((version) =>
        repo.getFlowVersionInFlow(project.id, flow.id, version.id),
      ),
      execution: repo.getExecution("exec_orphan_execution_variables"),
    });
    for (const canary of ORPHAN_EXECUTION_CANARIES) {
      expect(apiEvidence).not.toContain(canary);
      expect(apiEvidence).not.toContain(JSON.stringify(canary).slice(1, -1));
    }
    expect(repo.getExecution("exec_orphan_execution_variables")?.runContext?.variables).toEqual({
      account: "alice",
    });

    assertNoValuesInPhysicalStore(
      resolveProjectStorePath(project.id, dataDir),
      ORPHAN_EXECUTION_CANARIES,
    );
  });

  it("历史已删除或改名的敏感字段、密码字面量、上传与 URL 会统一从历史和 execution 清除", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-history-sensitive-union-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("历史敏感识别并集");
    const base = buildV1(project.id, "flow_history_sensitive_union");
    const historical = {
      ...base,
      variables: [
        base.variables[0]!,
        {
          name: "legacy_password",
          type: "string" as const,
          required: true,
          defaultValue: HISTORY_DELETED_CANARY,
        },
      ],
      steps: [
        base.steps[0]!,
        {
          id: "fill_legacy_password",
          type: "fill" as const,
          target: {
            strategies: [{ kind: "css" as const, selector: "input[type=password]" }],
            hints: { inputType: "password" },
          },
          value: "{{legacy_password}}",
        },
        {
          id: "fill_literal_password",
          type: "fill" as const,
          target: {
            strategies: [{ kind: "css" as const, selector: "#literal-password" }],
            hints: { inputType: "password" },
          },
          value: HISTORY_PASSWORD_LITERAL,
        },
        {
          id: "upload_private_file",
          type: "upload" as const,
          target: {
            strategies: [{ kind: "css" as const, selector: "input[type=file]" }],
          },
          files: [HISTORY_UPLOAD_LITERAL],
        },
        {
          id: "navigate_sensitive_url",
          type: "navigate" as const,
          url: `https://example.test/callback?access_token=${HISTORY_URL_ENCODED}`,
        },
      ],
    } satisfies FlowDocumentV1;
    repo.saveFlow(project.id, historical);
    repo.saveExecution(project.id, {
      executionId: "exec_history_sensitive_union",
      flowId: historical.id,
      status: "success",
      flowSnapshot: historical,
      runContext: {
        variables: {
          legacy_password: HISTORY_DELETED_CANARY,
          renamed_password: HISTORY_RENAMED_CANARY,
        },
      },
      steps: [],
    });

    const renamed = {
      ...historical,
      variables: [
        historical.variables[0]!,
        {
          name: "renamed_password",
          type: "string" as const,
          required: true,
          defaultValue: HISTORY_RENAMED_CANARY,
        },
      ],
      steps: historical.steps.map((step) =>
        step.id === "fill_legacy_password" ? { ...step, value: "{{renamed_password}}" } : step,
      ),
    } satisfies FlowDocumentV1;
    repo.saveFlowRevision({
      projectId: project.id,
      flowId: historical.id,
      document: renamed,
      expectedRevision: 1,
    });

    const current = {
      ...base,
      id: historical.id,
      variables: [base.variables[0]!],
      steps: [base.steps[0]!],
    } satisfies FlowDocumentV1;
    repo.saveFlowRevision({
      projectId: project.id,
      flowId: historical.id,
      document: current,
      expectedRevision: 2,
    });
    const prepared = prepareUpgradeWithoutRecentValues(current);

    const upgraded = repo.upgradeFlowToV2({
      projectId: project.id,
      flowId: historical.id,
      expectedRevision: 3,
      reportFingerprint: prepared.preview.reportFingerprint,
      rememberSelections: prepared.rememberSelections,
    });
    expect(upgraded).toMatchObject({ revision: 4, document: { schemaVersion: 2 } });

    const canaries = [
      HISTORY_DELETED_CANARY,
      HISTORY_RENAMED_CANARY,
      HISTORY_PASSWORD_LITERAL,
      HISTORY_UPLOAD_LITERAL,
      HISTORY_URL_LITERAL,
      HISTORY_URL_ENCODED,
    ];
    const versions = repo.listFlowVersions(project.id, historical.id);
    const apiEvidence = JSON.stringify({
      versions,
      versionDocuments: versions.map((version) =>
        repo.getFlowVersionInFlow(project.id, historical.id, version.id),
      ),
      execution: repo.getExecution("exec_history_sensitive_union"),
    });
    for (const canary of canaries) {
      expect(apiEvidence).not.toContain(canary);
    }

    const storePath = resolveProjectStorePath(project.id, dataDir);
    for (const path of [storePath, `${storePath}-wal`, `${storePath}-shm`]) {
      if (!existsSync(path)) {
        continue;
      }
      const bytes = readFileSync(path);
      for (const canary of canaries) {
        const escaped = JSON.stringify(canary).slice(1, -1);
        expect(bytes.includes(Buffer.from(canary)), `${path} 含 raw ${canary}`).toBe(false);
        expect(bytes.includes(Buffer.from(escaped)), `${path} 含 escaped ${canary}`).toBe(false);
      }
    }
  });

  it("物理扫描失败发生在可回滚边界内且 current/version/recent/revision 全部不变", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-physical-scan-rollback-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject(`扫描探针 ${SECRET_CANARY}`);
    const flow = buildV1(project.id, "flow_physical_scan_rollback");
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);
    const storePath = resolveProjectStorePath(project.id, dataDir);
    const sqlite = new Database(storePath);
    sqlite
      .prepare(
        `INSERT INTO flow_field_recent_values (flow_id, field_id, value_json, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(flow.id, "preexisting_recent", JSON.stringify("keep-me"), flow.meta.updatedAt);
    const beforeRecent = sqlite
      .prepare(
        "SELECT flow_id, field_id, value_json, updated_at FROM flow_field_recent_values WHERE flow_id = ?",
      )
      .all(flow.id);
    sqlite.close();

    let thrown: unknown;
    try {
      repo.upgradeFlowToV2({
        projectId: project.id,
        flowId: flow.id,
        expectedRevision: 1,
        reportFingerprint: prepared.preview.reportFingerprint,
        rememberSelections: prepared.rememberSelections,
      });
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toEqual(expect.objectContaining({ code: "FLOW_PERSISTENCE_FAILED" }));
    expect(JSON.stringify(thrown)).not.toContain(SECRET_CANARY);
    const unchanged = repo.getFlowRevision(project.id, flow.id);
    expect(unchanged).toMatchObject({
      revision: 1,
      document: { schemaVersion: FLOW_SCHEMA_VERSION },
    });
    expect(unchanged?.document).toEqual(flow);
    expect(repo.listFlowVersions(project.id, flow.id)).toEqual([]);

    const verify = new Database(storePath, { readonly: true });
    const afterRecent = verify
      .prepare(
        "SELECT flow_id, field_id, value_json, updated_at FROM flow_field_recent_values WHERE flow_id = ?",
      )
      .all(flow.id);
    verify.close();
    expect(afterRecent).toEqual(beforeRecent);
  });

  it("升级与跨版本恢复都原子递增 revision 并记录安全版本元数据", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-restore-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("恢复");
    const flow = buildV1(project.id, "flow_upgrade_restore");
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);

    const upgraded = repo.upgradeFlowToV2({
      projectId: project.id,
      flowId: flow.id,
      expectedRevision: 1,
      reportFingerprint: prepared.preview.reportFingerprint,
      rememberSelections: prepared.rememberSelections,
    });
    expect(upgraded).toMatchObject({ revision: 2, document: { schemaVersion: 2 } });

    repo.saveFlowFieldRecentValues({
      projectId: project.id,
      flowId: flow.id,
      expectedRevision: 2,
      values: { [prepared.accountFieldId]: "restore-cleanup" },
    });

    const [safeV1Version] = repo.listFlowVersions(project.id, flow.id);
    expect(safeV1Version).toMatchObject({ schemaVersion: 1, sourceRevision: 1 });
    const restored = repo.restoreFlowRevision({
      projectId: project.id,
      flowId: flow.id,
      versionId: safeV1Version!.id,
      expectedRevision: 2,
    });
    expect(restored).toMatchObject({ revision: 3, document: { schemaVersion: 1 } });
    expect(JSON.stringify(restored.document)).not.toContain(SECRET_CANARY);
    expect(repo.getFlowFieldRecentValues(project.id, flow.id)).toEqual({});
  });

  it("正式历史读取支持 v2 且按 projectId、flowId、versionId 三重归属校验", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-version-owner-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("v2 历史归属");
    const otherProject = repo.createProject("其他项目");
    const flow = buildV1(project.id, "flow_v2_version_owner");
    const otherFlow = buildV1(project.id, "flow_other_owner");
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);
    const upgraded = repo.upgradeFlowToV2({
      projectId: project.id,
      flowId: flow.id,
      expectedRevision: 1,
      reportFingerprint: prepared.preview.reportFingerprint,
      rememberSelections: prepared.rememberSelections,
    });
    repo.saveFlow(project.id, otherFlow);
    repo.saveFlowRevision({
      projectId: project.id,
      flowId: flow.id,
      document: { ...upgraded.document, name: "当前 v2" },
      expectedRevision: 2,
    });
    const v2Version = repo
      .listFlowVersions(project.id, flow.id)
      .find((version) => version.schemaVersion === FLOW_SCHEMA_VERSION_V2)!;

    expect(repo.getFlowVersionInFlow(project.id, flow.id, v2Version.id)).toMatchObject({
      id: flow.id,
      projectId: project.id,
      schemaVersion: FLOW_SCHEMA_VERSION_V2,
    });
    expect(repo.getFlowVersionInFlow(project.id, otherFlow.id, v2Version.id)).toBeNull();
    expect(repo.getFlowVersionInFlow(otherProject.id, flow.id, v2Version.id)).toBeNull();
    expect(repo.getFlowVersionInFlow(project.id, flow.id, "missing_version")).toBeNull();
    expect(() => repo.getFlowVersion(project.id, v2Version.id)).toThrowError(
      expect.objectContaining({ code: "FLOW_SCHEMA_VERSION_UNSUPPORTED" }),
    );

    const restored = repo.restoreFlowRevision({
      projectId: project.id,
      flowId: flow.id,
      versionId: v2Version.id,
      expectedRevision: 3,
    });
    expect(restored).toMatchObject({
      revision: 4,
      document: { schemaVersion: FLOW_SCHEMA_VERSION_V2, name: upgraded.document.name },
    });
  });

  it("最近值只接受当前 v2 中非敏感且 remember:lastValue 的标量", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-recent-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("最近值");
    const flow = buildV1(project.id, "flow_recent_values");
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);
    repo.upgradeFlowToV2({
      projectId: project.id,
      flowId: flow.id,
      expectedRevision: 1,
      reportFingerprint: prepared.preview.reportFingerprint,
      rememberSelections: prepared.rememberSelections,
    });

    repo.saveFlowFieldRecentValues({
      projectId: project.id,
      flowId: flow.id,
      expectedRevision: 2,
      values: { [prepared.accountFieldId]: "alice" },
    });
    expect(repo.getFlowFieldRecentValues(project.id, flow.id)).toEqual({
      [prepared.accountFieldId]: "alice",
    });

    let sensitiveError: unknown;
    try {
      repo.saveFlowFieldRecentValues({
        projectId: project.id,
        flowId: flow.id,
        expectedRevision: 2,
        values: { [prepared.secretFieldId]: SECRET_CANARY },
      });
    } catch (error: unknown) {
      sensitiveError = error;
    }
    expect(sensitiveError).toEqual(
      expect.objectContaining({ code: "FLOW_SENSITIVE_POLICY_INVALID" }),
    );
    expect(JSON.stringify(sensitiveError)).not.toContain(SECRET_CANARY);
    expect(JSON.stringify(repo.getFlowFieldRecentValues(project.id, flow.id))).not.toContain(
      SECRET_CANARY,
    );
  });

  it("vNext-2 前 repository 在 execution 写入前拒绝 v2", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-execution-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("v2 execution 防线");
    const flow = buildV1(project.id, "flow_v2_execution_rejected");
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);
    repo.upgradeFlowToV2({
      projectId: project.id,
      flowId: flow.id,
      expectedRevision: 1,
      reportFingerprint: prepared.preview.reportFingerprint,
      rememberSelections: prepared.rememberSelections,
    });

    expect(() =>
      repo.saveExecution(project.id, {
        executionId: "exec_v2_rejected",
        flowId: flow.id,
        status: "success",
        flowSnapshot: prepared.preview.candidate as never,
        runContext: { variables: { [prepared.secretFieldId]: SECRET_CANARY } },
        steps: [],
      }),
    ).toThrowError(expect.objectContaining({ code: "FLOW_SCHEMA_VERSION_UNSUPPORTED" }));
    expect(repo.getExecution("exec_v2_rejected")).toBeNull();

    const sqlite = new Database(resolveProjectStorePath(project.id, dataDir));
    sqlite
      .prepare(
        `INSERT INTO executions
          (id, project_id, flow_id, status, flow_snapshot_json)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        "exec_v2_injected",
        project.id,
        flow.id,
        "success",
        JSON.stringify(prepared.preview.candidate),
      );
    sqlite.close();
    expect(() => repo.getExecution("exec_v2_injected")).toThrowError(
      expect.objectContaining({ code: "FLOW_SCHEMA_VERSION_UNSUPPORTED" }),
    );
  });

  it("成功升级后唯一敏感 canary 不出现在 SQLite、WAL 或 SHM", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-canary-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("canary");
    const flow = buildV1(project.id, "flow_upgrade_canary");
    repo.saveFlow(project.id, flow);
    repo.saveExecution(project.id, {
      executionId: "exec_canary_cleanup",
      flowId: flow.id,
      status: "success",
      flowSnapshot: { ...flow, description: `快照泄漏 ${SECRET_CANARY}` },
      runContext: {
        environmentName: `环境 ${SECRET_CANARY}`,
        baseUrl: `https://example.test/${SECRET_CANARY}`,
        storageStatePath: `/tmp/${SECRET_CANARY}.json`,
        variables: {
          secret_password: SECRET_CANARY,
          account: `嵌套残留 ${SECRET_CANARY}`,
        },
      },
      steps: [
        {
          stepIndex: 0,
          stepId: "fill_password",
          status: "failed",
          errorMessage: `错误 ${SECRET_CANARY}`,
          screenshotPath: `/tmp/${SECRET_CANARY}.png`,
          diagnosticPath: `/tmp/${SECRET_CANARY}.json`,
        },
      ],
    });
    const prepared = prepareUpgrade(flow);

    repo.upgradeFlowToV2({
      projectId: project.id,
      flowId: flow.id,
      expectedRevision: 1,
      reportFingerprint: prepared.preview.reportFingerprint,
      rememberSelections: prepared.rememberSelections,
    });

    const storePath = resolveProjectStorePath(project.id, dataDir);
    assertNoCanaryBytes(storePath);
    expect(JSON.stringify(repo.getExecution("exec_canary_cleanup"))).not.toContain(SECRET_CANARY);
  });

  it("候选 description 出现已识别秘密时 fail closed 且不生成 v2", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-candidate-secret-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("候选秘密防线");
    const flow = {
      ...buildV1(project.id, "flow_candidate_secret"),
      description: `不得迁移 ${SECRET_CANARY}`,
    };
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);

    expect(() =>
      repo.upgradeFlowToV2({
        projectId: project.id,
        flowId: flow.id,
        expectedRevision: 1,
        reportFingerprint: prepared.preview.reportFingerprint,
        rememberSelections: prepared.rememberSelections,
      }),
    ).toThrowError(expect.objectContaining({ code: "FLOW_UPGRADE_BLOCKED" }));
    expect(repo.getFlowRevision(project.id, flow.id)).toMatchObject({
      revision: 1,
      document: { schemaVersion: 1 },
    });
    expect(repo.listFlowVersions(project.id, flow.id)).toEqual([]);
  });

  it("活跃 reader 会在任何升级写入前触发维护锁失败", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-reader-lock-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("维护锁");
    const flow = buildV1(project.id, "flow_reader_lock");
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);
    const storePath = resolveProjectStorePath(project.id, dataDir);
    const reader = new Database(storePath, { readonly: true });
    reader.exec("BEGIN");
    reader.prepare("SELECT document_json FROM flows WHERE id = ?").get(flow.id);

    try {
      expect(() =>
        repo.upgradeFlowToV2({
          projectId: project.id,
          flowId: flow.id,
          expectedRevision: 1,
          reportFingerprint: prepared.preview.reportFingerprint,
          rememberSelections: prepared.rememberSelections,
        }),
      ).toThrowError(expect.objectContaining({ code: "FLOW_PERSISTENCE_FAILED" }));
      expect(repo.getFlowRevision(project.id, flow.id)).toMatchObject({
        revision: 1,
        document: { schemaVersion: 1 },
      });
      expect(repo.listFlowVersions(project.id, flow.id)).toEqual([]);
    } finally {
      reader.exec("ROLLBACK");
      reader.close();
    }
  });

  it("通用读取支持 v2，但 legacy getFlowInProject 继续 fail closed", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-vnext-read-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("分派读取");
    const flow = buildV1(project.id, "flow_v2_read");
    repo.saveFlow(project.id, flow);
    const prepared = prepareUpgrade(flow);
    repo.upgradeFlowToV2({
      projectId: project.id,
      flowId: flow.id,
      expectedRevision: 1,
      reportFingerprint: prepared.preview.reportFingerprint,
      rememberSelections: prepared.rememberSelections,
    });

    expect(repo.getFlowRevision(project.id, flow.id)?.document.schemaVersion).toBe(
      FLOW_SCHEMA_VERSION_V2,
    );
    expect(() => repo.getFlowInProject(project.id, flow.id)).toThrowError(
      expect.objectContaining({ code: "FLOW_SCHEMA_VERSION_UNSUPPORTED" }),
    );
    expect(() => repo.renameFlow(project.id, flow.id, "不得绕过", 2)).toThrowError(
      expect.objectContaining({ code: "FLOW_SCHEMA_VERSION_UNSUPPORTED" }),
    );
  });
});
