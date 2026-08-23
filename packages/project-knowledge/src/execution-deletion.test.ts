import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { FLOW_SCHEMA_VERSION, FlowWeaveError } from "@flowweave/shared";
import { afterEach, describe, expect, it } from "vitest";

import { resolveProjectStorePath } from "./db/client.js";
import { ProjectKnowledgeRepository } from "./repository.js";

function sampleFlow(projectId: string, flowId: string) {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: flowId,
    projectId,
    name: "删除测试流程",
    variables: [],
    steps: [{ id: "open", type: "navigate" as const, url: "https://example.com" }],
    meta: {
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
      source: "recorded" as const,
    },
  };
}

describe("执行记录安全删除", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  function prepareExecution(executionId = "exec_delete_1") {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-delete-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("删除测试项目");
    const flowId = "flow_delete_1";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));
    repo.saveExecution(project.id, {
      executionId,
      flowId,
      status: "success",
      startedAt: "2026-08-23T00:00:00.000Z",
      finishedAt: "2026-08-23T00:00:01.000Z",
      steps: [{ stepIndex: 0, stepId: "open", status: "passed" }],
    });
    return { repo, project, flowId };
  }

  it.each(["", ".", "..", "../escape", "a/b", "a\\b", "bad%2Fid", "bad\u0000id", "a".repeat(129)])(
    "在任何副作用前拒绝非法 executionId：%j",
    (executionId) => {
      dataDir = join(tmpdir(), `flowweave-invalid-${Date.now()}-${Math.random()}`);
      const repo = new ProjectKnowledgeRepository({ dataDir });

      expect(() => repo.allocateRunDirectory("ghost_project", executionId)).toThrow(
        FlowWeaveError,
      );
      expect(existsSync(dataDir)).toBe(false);
    },
  );

  it.each(["", ".", "..", "../escape", "a/b", "a\\b", "bad%2Fid", "bad\u0000id", "a".repeat(129)])(
    "deleteExecution 直接拒绝非法 projectId：%j",
    (projectId) => {
      dataDir = join(tmpdir(), `flowweave-invalid-project-${Date.now()}-${Math.random()}`);
      const repo = new ProjectKnowledgeRepository({ dataDir });
      expect(() => repo.deleteExecution(projectId, "exec_safe")).toThrow(FlowWeaveError);
      expect(existsSync(dataDir)).toBe(false);
    },
  );

  it("不存在项目不创建 ghost 目录或 store.sqlite", () => {
    dataDir = join(tmpdir(), `flowweave-ghost-${Date.now()}-${Math.random()}`);
    const repo = new ProjectKnowledgeRepository({ dataDir });

    expect(() => repo.allocateRunDirectory("ghost_project", "exec_safe_1")).toThrowError(
      expect.objectContaining({ code: "PROJECT_NOT_FOUND" }),
    );
    expect(existsSync(dataDir)).toBe(false);
  });

  it("allocation 拒绝 project 或 runs symlink", () => {
    const { repo, project } = prepareExecution();
    const projectDir = dirname(resolveProjectStorePath(project.id, dataDir));
    const realProjectDir = `${projectDir}-real`;
    rmSync(join(projectDir, "runs"), { recursive: true, force: true });
    mkdirSync(join(projectDir, "runs-target"));
    symlinkSync(join(projectDir, "runs-target"), join(projectDir, "runs"));

    expect(() => repo.allocateRunDirectory(project.id, "exec_symlink")).toThrow(
      FlowWeaveError,
    );

    rmSync(join(projectDir, "runs"));
    rmSync(join(projectDir, "runs-target"), { recursive: true });
    renameProject(projectDir, realProjectDir);
    symlinkSync(realProjectDir, projectDir);
    expect(() => repo.allocateRunDirectory(project.id, "exec_project_link")).toThrow(
      FlowWeaveError,
    );
  });

  it("删除精确归属记录、步骤、快照与白名单产物，同时保留兄弟 sentinel", () => {
    const { repo, project } = prepareExecution();
    const runDir = repo.allocateRunDirectory(project.id, "exec_delete_1");
    for (const name of [
      "network.har",
      "step-0.png",
      "page-0.json",
      "step-0-diagnostic.json",
    ]) {
      writeFileSync(join(runDir, name), name);
    }
    const sentinel = join(dirname(runDir), "sibling-sentinel.txt");
    writeFileSync(sentinel, "keep");
    const exactSnapshot = repo.savePageSnapshot(
      project.id,
      snapshotSummary("https://example.com/exact"),
      join(runDir, "page-0.json"),
    );
    const prefixSiblingDir = `${runDir}-sibling`;
    mkdirSync(prefixSiblingDir);
    const siblingSnapshot = repo.savePageSnapshot(
      project.id,
      snapshotSummary("https://example.com/sibling"),
      join(prefixSiblingDir, "page-0.json"),
    );

    const result = repo.deleteExecution(project.id, "exec_delete_1");

    expect(result).toEqual({
      projectId: project.id,
      executionId: "exec_delete_1",
      status: "deleted",
      artifacts: "deleted",
    });
    expect(repo.getExecution("exec_delete_1")).toBeNull();
    expect(existsSync(runDir)).toBe(false);
    expect(readFileSync(sentinel, "utf8")).toBe("keep");
    const snapshotIds = repo.listPageSnapshots(project.id).map((item) => item.id);
    expect(snapshotIds).not.toContain(exactSnapshot.id);
    expect(snapshotIds).toContain(siblingSnapshot.id);
    expect(readdirSync(dirname(runDir)).some((name) => name.includes("quarantine"))).toBe(false);
  });

  it("缺失 execution 幂等返回 untouched，绝不检查或清理同名目录", () => {
    const { repo, project } = prepareExecution();
    const missingDir = repo.allocateRunDirectory(project.id, "exec_missing");
    writeFileSync(join(missingDir, "unknown-secret.bin"), "keep");

    const result = repo.deleteExecution(project.id, "exec_missing");

    expect(result).toEqual({
      projectId: project.id,
      executionId: "exec_missing",
      status: "already-absent",
      artifacts: "untouched",
    });
    expect(readFileSync(join(missingDir, "unknown-secret.bin"), "utf8")).toBe("keep");
  });

  it("runDir 不存在时删除数据库记录并返回 artifacts absent，重复删除保持幂等", () => {
    const { repo, project } = prepareExecution();

    expect(repo.deleteExecution(project.id, "exec_delete_1")).toEqual({
      projectId: project.id,
      executionId: "exec_delete_1",
      status: "deleted",
      artifacts: "absent",
    });
    expect(repo.deleteExecution(project.id, "exec_delete_1")).toEqual({
      projectId: project.id,
      executionId: "exec_delete_1",
      status: "already-absent",
      artifacts: "untouched",
    });
  });

  it("不读取或删除 execution_steps 中伪造的外部产物路径", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-delete-external-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("外部路径项目");
    const flowId = "flow_external";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));
    const externalDir = join(dataDir, "external-sentinel");
    mkdirSync(externalDir);
    const screenshot = join(externalDir, "step-0.png");
    const diagnostic = join(externalDir, "step-0-diagnostic.json");
    writeFileSync(screenshot, "screenshot-keep");
    writeFileSync(diagnostic, "diagnostic-keep");
    repo.saveExecution(project.id, {
      executionId: "exec_external",
      flowId,
      status: "failed",
      steps: [
        {
          stepIndex: 0,
          stepId: "open",
          status: "failed",
          screenshotPath: screenshot,
          diagnosticPath: diagnostic,
        },
      ],
    });

    expect(repo.deleteExecution(project.id, "exec_external").artifacts).toBe("absent");
    expect(readFileSync(screenshot, "utf8")).toBe("screenshot-keep");
    expect(readFileSync(diagnostic, "utf8")).toBe("diagnostic-keep");
  });

  it("严格按 projectId + executionId 归属，跨项目调用不触碰目录", () => {
    const { repo, project } = prepareExecution();
    const other = repo.createProject("另一个项目");
    const runDir = repo.allocateRunDirectory(other.id, "exec_delete_1");
    writeFileSync(join(runDir, "network.har"), "keep");

    const result = repo.deleteExecution(other.id, "exec_delete_1");

    expect(result.status).toBe("already-absent");
    expect(readFileSync(join(runDir, "network.har"), "utf8")).toBe("keep");
    expect(repo.getExecution("exec_delete_1")?.projectId).toBe(project.id);
  });

  it.each([
    ["未知文件", (runDir: string) => writeFileSync(join(runDir, "unknown.bin"), "x")],
    ["子目录", (runDir: string) => mkdirSync(join(runDir, "nested"))],
    ["symlink", (runDir: string) => symlinkSync(join(runDir, "network.har"), join(runDir, "step-1.png"))],
    ["FIFO", (runDir: string) => execFileSync("mkfifo", [join(runDir, "step-2.png")])],
  ])("遇到%s时在数据库变更前 fail closed", (_label, arrange) => {
    const { repo, project } = prepareExecution();
    const runDir = repo.allocateRunDirectory(project.id, "exec_delete_1");
    writeFileSync(join(runDir, "network.har"), "keep");
    arrange(runDir);

    expect(() => repo.deleteExecution(project.id, "exec_delete_1")).toThrow(FlowWeaveError);
    expect(repo.getExecution("exec_delete_1")).not.toBeNull();
    expect(existsSync(runDir)).toBe(true);
  });

  it("拒绝 runDir symlink 且不跟随目标", () => {
    const { repo, project } = prepareExecution();
    const runsDir = join(dirname(resolveProjectStorePath(project.id, dataDir)), "runs");
    const runDir = join(runsDir, "exec_delete_1");
    const target = join(runsDir, "external-target");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "network.har"), "keep");
    symlinkSync(target, runDir);

    expect(() => repo.deleteExecution(project.id, "exec_delete_1")).toThrow(FlowWeaveError);
    expect(readFileSync(join(target, "network.har"), "utf8")).toBe("keep");
    expect(repo.getExecution("exec_delete_1")).not.toBeNull();
  });

  it("数据库事务失败时恢复原运行目录与执行记录", () => {
    const { repo, project } = prepareExecution();
    const runDir = repo.allocateRunDirectory(project.id, "exec_delete_1");
    writeFileSync(join(runDir, "network.har"), "keep");
    const sqlite = new Database(resolveProjectStorePath(project.id, dataDir));
    sqlite.exec(`
      CREATE TRIGGER fail_execution_delete
      BEFORE DELETE ON executions
      BEGIN
        SELECT RAISE(ABORT, 'injected failure');
      END;
    `);
    sqlite.close();

    expect(() => repo.deleteExecution(project.id, "exec_delete_1")).toThrowError(
      expect.objectContaining({ code: "UNKNOWN" }),
    );
    expect(repo.getExecution("exec_delete_1")).not.toBeNull();
    expect(readFileSync(join(runDir, "network.har"), "utf8")).toBe("keep");
    expect(lstatSync(runDir).isDirectory()).toBe(true);
  });

  it("无运行目录的数据库失败不会声称已恢复产物", () => {
    const { repo, project } = prepareExecution();
    const sqlite = new Database(resolveProjectStorePath(project.id, dataDir));
    sqlite.exec(`
      CREATE TRIGGER fail_execution_delete_without_run
      BEFORE DELETE ON executions
      BEGIN
        SELECT RAISE(ABORT, 'injected failure');
      END;
    `);
    sqlite.close();

    expect(() => repo.deleteExecution(project.id, "exec_delete_1")).toThrowError(
      expect.objectContaining({ message: "删除执行记录失败，未变更运行产物" }),
    );
    expect(repo.getExecution("exec_delete_1")).not.toBeNull();
  });

  it("回滚前发现原 runDir 被并发占用时停止恢复可疑对象", () => {
    class OccupiedRollbackRepository extends ProjectKnowledgeRepository {
      runDirectory = "";
      private injected = false;

      protected override verifyQuarantinedRunIdentity(
        path: string,
        expected: { dev: number; ino: number; mode: number },
      ): void {
        super.verifyQuarantinedRunIdentity(path, expected);
        if (!this.injected) {
          this.injected = true;
          mkdirSync(this.runDirectory);
          writeFileSync(join(this.runDirectory, "network.har"), "concurrent");
        }
      }
    }

    dataDir = mkdtempSync(join(tmpdir(), "flowweave-rollback-occupied-"));
    const repo = new OccupiedRollbackRepository({ dataDir });
    const project = repo.createProject("并发占位项目");
    const flowId = "flow_rollback_occupied";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));
    repo.saveExecution(project.id, {
      executionId: "exec_rollback_occupied",
      flowId,
      status: "success",
      steps: [],
    });
    repo.runDirectory = repo.allocateRunDirectory(project.id, "exec_rollback_occupied");
    writeFileSync(join(repo.runDirectory, "network.har"), "original");
    const sqlite = new Database(resolveProjectStorePath(project.id, dataDir));
    sqlite.exec(`
      CREATE TRIGGER fail_execution_delete_occupied
      BEFORE DELETE ON executions
      BEGIN
        SELECT RAISE(ABORT, 'injected failure');
      END;
    `);
    sqlite.close();

    expect(() => repo.deleteExecution(project.id, "exec_rollback_occupied")).toThrowError(
      expect.objectContaining({
        message: "删除执行记录失败且运行产物恢复失败，请立即停止相关维护操作",
      }),
    );
    expect(repo.getExecution("exec_rollback_occupied")).not.toBeNull();
    expect(readFileSync(join(repo.runDirectory, "network.har"), "utf8")).toBe("concurrent");
    const quarantine = readdirSync(dirname(repo.runDirectory)).find((name) =>
      name.startsWith(".execution-quarantine-"),
    );
    expect(quarantine).toBeTruthy();
    expect(readFileSync(join(dirname(repo.runDirectory), quarantine!, "network.har"), "utf8")).toBe(
      "original",
    );
  });

  it("rename 后身份校验失败时恢复原目录并拒绝数据库变更", () => {
    class IdentityDriftRepository extends ProjectKnowledgeRepository {
      protected override verifyQuarantinedRunIdentity(): void {
        throw new FlowWeaveError("VALIDATION_FAILED", "测试注入身份漂移");
      }
    }

    dataDir = mkdtempSync(join(tmpdir(), "flowweave-identity-drift-"));
    const repo = new IdentityDriftRepository({ dataDir });
    const project = repo.createProject("身份漂移项目");
    const flowId = "flow_identity_drift";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));
    repo.saveExecution(project.id, {
      executionId: "exec_identity_drift",
      flowId,
      status: "success",
      steps: [],
    });
    const runDir = repo.allocateRunDirectory(project.id, "exec_identity_drift");
    writeFileSync(join(runDir, "network.har"), "keep");

    expect(() => repo.deleteExecution(project.id, "exec_identity_drift")).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    expect(repo.getExecution("exec_identity_drift")).not.toBeNull();
    expect(readFileSync(join(runDir, "network.har"), "utf8")).toBe("keep");
  });

  it("提交后 unlink/rmdir 故障保留受控 quarantine，数据库仍已删除", () => {
    class CleanupFailureRepository extends ProjectKnowledgeRepository {
      protected override beforeQuarantinedArtifactCleanup(): void {
        throw new Error("测试注入清理失败");
      }
    }

    dataDir = mkdtempSync(join(tmpdir(), "flowweave-cleanup-failure-"));
    const repo = new CleanupFailureRepository({ dataDir });
    const project = repo.createProject("清理失败项目");
    const flowId = "flow_cleanup_failure";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));
    repo.saveExecution(project.id, {
      executionId: "exec_cleanup_failure",
      flowId,
      status: "success",
      steps: [],
    });
    const runDir = repo.allocateRunDirectory(project.id, "exec_cleanup_failure");
    writeFileSync(join(runDir, "network.har"), "keep");

    expect(repo.deleteExecution(project.id, "exec_cleanup_failure")).toEqual({
      projectId: project.id,
      executionId: "exec_cleanup_failure",
      status: "deleted",
      artifacts: "quarantined",
    });
    expect(repo.getExecution("exec_cleanup_failure")).toBeNull();
    expect(existsSync(runDir)).toBe(false);
    const runsDirectory = dirname(runDir);
    const quarantineNames = readdirSync(runsDirectory).filter((name) =>
      /^\.execution-quarantine-[0-9a-f-]{36}$/.test(name),
    );
    expect(quarantineNames).toHaveLength(1);
    expect(readFileSync(join(runsDirectory, quarantineNames[0]!, "network.har"), "utf8")).toBe(
      "keep",
    );
  });

  it("saveExecution 将 execution 与 steps 放在同一事务", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-save-atomic-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("原子保存项目");
    const flowId = "flow_atomic";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));
    const sqlite = new Database(resolveProjectStorePath(project.id, dataDir));
    sqlite.exec(`
      CREATE TRIGGER fail_step_insert
      BEFORE INSERT ON execution_steps
      BEGIN
        SELECT RAISE(ABORT, 'injected failure');
      END;
    `);
    sqlite.close();

    expect(() =>
      repo.saveExecution(project.id, {
        executionId: "exec_atomic",
        flowId,
        status: "failed",
        steps: [{ stepIndex: 0, stepId: "open", status: "failed" }],
      }),
    ).toThrow();
    expect(repo.getExecution("exec_atomic")).toBeNull();
  });
});

function snapshotSummary(url: string) {
  return {
    url,
    title: "快照",
    formCount: 0,
    buttonCount: 0,
    linkCount: 0,
    capturedAt: "2026-08-23T00:00:00.000Z",
  };
}

function renameProject(source: string, destination: string): void {
  // 测试辅助函数单独保留，避免把 rename 误写为业务递归删除。
  renameSync(source, destination);
}
