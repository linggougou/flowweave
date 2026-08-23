import {
  closeSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { FLOW_SCHEMA_VERSION, FlowWeaveError } from "@flowweave/shared";
import { afterEach, describe, expect, it } from "vitest";

import { resolveProjectStorePath } from "./db/client.js";
import { ProjectKnowledgeRepository } from "./repository.js";

const PNG_LIMIT_BYTES = 8 * 1024 * 1024;

function png(width = 2, height = 3): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

function sampleFlow(projectId: string, flowId: string) {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: flowId,
    projectId,
    name: "截图预览测试流程",
    variables: [],
    steps: [{ id: "open", type: "navigate" as const, url: "https://example.com" }],
    meta: {
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      source: "recorded" as const,
    },
  };
}

describe("执行截图受控读取", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  function prepare(options?: { screenshotPath?: string; executionId?: string }) {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-preview-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("截图预览测试项目");
    const flowId = "flow_preview_1";
    const executionId = options?.executionId ?? "exec_preview_1";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));
    repo.saveExecution(project.id, {
      executionId,
      flowId,
      status: "success",
      steps: [
        {
          stepIndex: 0,
          stepId: "open",
          status: "passed",
          screenshotPath: options?.screenshotPath,
        },
      ],
    });
    const runDirectory = repo.allocateRunDirectory(project.id, executionId);
    return { repo, project, executionId, runDirectory };
  }

  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, 1_000_001])(
    "拒绝非法 stepIndex：%s",
    (stepIndex) => {
      dataDir = join(tmpdir(), `flowweave-preview-invalid-${Date.now()}-${Math.random()}`);
      const repo = new ProjectKnowledgeRepository({ dataDir });
      expect(() =>
        repo.getExecutionScreenshotPreview("project_safe", "exec_safe", stepIndex),
      ).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    },
  );

  it.each(["", ".", "..", "../escape", "a/b", "a\\b", "bad%2Fid", "bad\u0000id"])(
    "在访问文件系统前拒绝非法标识：%j",
    (unsafeId) => {
      dataDir = join(tmpdir(), `flowweave-preview-invalid-${Date.now()}-${Math.random()}`);
      const repo = new ProjectKnowledgeRepository({ dataDir });
      expect(() => repo.getExecutionScreenshotPreview(unsafeId, "exec_safe", 0)).toThrow(
        FlowWeaveError,
      );
      expect(() => repo.getExecutionScreenshotPreview("project_safe", unsafeId, 0)).toThrow(
        FlowWeaveError,
      );
    },
  );

  it("只读取真实归属 execution 的既有步骤", () => {
    const { repo, project, executionId } = prepare();
    const otherProject = repo.createProject("其他项目");

    expect(() => repo.getExecutionScreenshotPreview(otherProject.id, executionId, 0)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    expect(() => repo.getExecutionScreenshotPreview(project.id, "exec_missing", 0)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 1)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });

  it("忽略数据库外部路径，只读取推导出的固定 PNG", () => {
    const externalFile = join(tmpdir(), `flowweave-external-${Date.now()}.png`);
    writeFileSync(externalFile, png(99, 88));
    try {
      const { repo, project, executionId, runDirectory } = prepare({
        screenshotPath: externalFile,
      });
      expect(repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toEqual({
        status: "absent",
      });

      const expected = png(12, 34);
      writeFileSync(join(runDirectory, "step-0.png"), expected);
      const result = repo.getExecutionScreenshotPreview(project.id, executionId, 0);
      expect(result).toEqual({
        status: "available",
        mediaType: "image/png",
        bytes: new Uint8Array(expected),
        width: 12,
        height: 34,
      });
      expect(result).not.toHaveProperty("path");
    } finally {
      rmSync(externalFile, { force: true });
    }
  });

  it("受控目标缺失时返回 absent", () => {
    const { repo, project, executionId, runDirectory } = prepare();
    expect(repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toEqual({
      status: "absent",
    });
    rmSync(runDirectory, { recursive: true });
    expect(repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toEqual({
      status: "absent",
    });
  });

  it("拒绝 runs、run 或目标文件 symlink", () => {
    const { repo, project, executionId, runDirectory } = prepare();
    const projectDirectory = dirname(resolveProjectStorePath(project.id, dataDir));
    const targetFile = join(projectDirectory, "outside.png");
    writeFileSync(targetFile, png());
    symlinkSync(targetFile, join(runDirectory, "step-0.png"));
    expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrow(
      FlowWeaveError,
    );

    rmSync(join(runDirectory, "step-0.png"));
    const realRunDirectory = `${runDirectory}-real`;
    renameSync(runDirectory, realRunDirectory);
    symlinkSync(realRunDirectory, runDirectory);
    expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrow(
      FlowWeaveError,
    );

    rmSync(runDirectory);
    renameSync(realRunDirectory, runDirectory);
    const runsDirectory = dirname(runDirectory);
    const realRunsDirectory = `${runsDirectory}-real`;
    renameSync(runsDirectory, realRunsDirectory);
    symlinkSync(realRunsDirectory, runsDirectory);
    expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrow(
      FlowWeaveError,
    );
  });

  it("拒绝数据根或项目目录 symlink", () => {
    const { repo, project, executionId } = prepare();
    const projectDirectory = dirname(resolveProjectStorePath(project.id, dataDir));
    const realProjectDirectory = `${projectDirectory}-real`;
    renameSync(projectDirectory, realProjectDirectory);
    symlinkSync(realProjectDirectory, projectDirectory);
    expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrow(
      FlowWeaveError,
    );

    rmSync(projectDirectory);
    renameSync(realProjectDirectory, projectDirectory);
    const originalDataDir = dataDir;
    const realDataDir = `${originalDataDir}-real`;
    renameSync(originalDataDir, realDataDir);
    symlinkSync(realDataDir, originalDataDir);
    try {
      const linkedRepo = new ProjectKnowledgeRepository({ dataDir: originalDataDir });
      expect(() => linkedRepo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrow(
        FlowWeaveError,
      );
    } finally {
      rmSync(originalDataDir);
      rmSync(realDataDir, { recursive: true, force: true });
      dataDir = "";
    }
  });

  it("拒绝硬链接、目录与可移植平台上的 FIFO", () => {
    const { repo, project, executionId, runDirectory } = prepare();
    const source = join(runDirectory, "source.png");
    const target = join(runDirectory, "step-0.png");
    writeFileSync(source, png());
    linkSync(source, target);
    expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrow(
      FlowWeaveError,
    );

    rmSync(target);
    mkdirSync(target);
    expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrow(
      FlowWeaveError,
    );
    rmSync(target, { recursive: true });

    if (process.platform !== "win32") {
      closeSync(openSync(target, "w"));
      rmSync(target);
      // 避免直接依赖 shell：Node 暂无 mkfifo，使用系统命令不属于产品读取路径。
      execFileSync("mkfifo", [target]);
      expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrow(
        FlowWeaveError,
      );
    }
  });

  it.each([
    ["空文件", Buffer.alloc(0)],
    ["伪 PNG", Buffer.from("not a png")],
    ["截断 IHDR", png().subarray(0, 24)],
    [
      "错误首块",
      (() => {
        const value = png();
        value.write("NOPE", 12, "ascii");
        return value;
      })(),
    ],
    ["零宽", png(0, 1)],
    ["宽度超限", png(8193, 1)],
    ["高度超限", png(1, 8193)],
    ["像素超限", png(8192, 5000)],
  ])("拒绝%s", (_label, contents) => {
    const { repo, project, executionId, runDirectory } = prepare();
    writeFileSync(join(runDirectory, "step-0.png"), contents);
    expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });

  it("在分配读取缓冲区前拒绝超过 8 MiB 的文件", () => {
    const { repo, project, executionId, runDirectory } = prepare();
    const target = join(runDirectory, "step-0.png");
    closeSync(openSync(target, "w"));
    truncateSync(target, PNG_LIMIT_BYTES + 1);
    expect(() => repo.getExecutionScreenshotPreview(project.id, executionId, 0)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });

  it("读取期间目标路径被替换时 fail closed 且错误不泄露路径", () => {
    const { project, executionId, runDirectory } = prepare();
    const target = join(runDirectory, "step-0.png");
    writeFileSync(target, png());
    class ReplacingRepository extends ProjectKnowledgeRepository {
      protected override beforeExecutionScreenshotFileRevalidation(): void {
        renameSync(target, `${target}.old`);
        writeFileSync(target, png(4, 5));
      }
    }
    const repo = new ReplacingRepository({ dataDir });

    try {
      repo.getExecutionScreenshotPreview(project.id, executionId, 0);
      throw new Error("应当拒绝读取期间替换");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(FlowWeaveError);
      expect((error as Error).message).not.toContain(dataDir);
    }
  });

  it("读取期间运行目录身份漂移时 fail closed 且不触碰替换目录或兄弟文件", () => {
    const { project, executionId, runDirectory } = prepare();
    const target = join(runDirectory, "step-0.png");
    const runsDirectory = dirname(runDirectory);
    const originalRunDirectory = `${runDirectory}.original`;
    const originalSentinel = join(runDirectory, "original-sentinel.txt");
    const replacementSentinel = join(runDirectory, "replacement-sentinel.txt");
    const siblingSentinel = join(runsDirectory, "sibling-sentinel.txt");
    writeFileSync(target, png());
    writeFileSync(originalSentinel, "原目录哨兵");
    writeFileSync(siblingSentinel, "兄弟哨兵");

    class ReplacingRunDirectoryRepository extends ProjectKnowledgeRepository {
      protected override beforeExecutionScreenshotFileRevalidation(): void {
        renameSync(runDirectory, originalRunDirectory);
        mkdirSync(runDirectory);
        // 保留同一个截图 inode，确保最终由 runDirectory 身份重验拦截。
        renameSync(join(originalRunDirectory, "step-0.png"), target);
        writeFileSync(replacementSentinel, "替换目录哨兵");
      }
    }
    const repo = new ReplacingRunDirectoryRepository({ dataDir });

    try {
      repo.getExecutionScreenshotPreview(project.id, executionId, 0);
      throw new Error("应当拒绝读取期间运行目录替换");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(FlowWeaveError);
      expect((error as Error).message).not.toContain(dataDir);
      expect((error as Error).message).not.toContain(runDirectory);
    }
    expect(readFileSync(join(originalRunDirectory, "original-sentinel.txt"), "utf8")).toBe(
      "原目录哨兵",
    );
    expect(readFileSync(replacementSentinel, "utf8")).toBe("替换目录哨兵");
    expect(readFileSync(siblingSentinel, "utf8")).toBe("兄弟哨兵");
    expect(readFileSync(target)).toEqual(png());
  });
});
