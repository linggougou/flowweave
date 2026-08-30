import { execFileSync } from "node:child_process";
import { mkdir, open, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  FlowDocument,
  FlowDocumentV2,
  FlowPortabilityWarning,
} from "@flowweave/flow-dsl";
import { FLOW_SCHEMA_VERSION, FLOW_SCHEMA_VERSION_V2 } from "@flowweave/shared";

import {
  FLOW_IMPORT_FILE_LIMIT_BYTES,
  exportFlowToFile,
  importFlowFromFile,
} from "./flow-portability-files.js";

const TEST_DIR = path.join(process.cwd(), ".tmp-g5-file-tests");

function buildFlow(overrides: Partial<FlowDocument> = {}): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_source",
    projectId: "project_source",
    name: "订单/登录：回归",
    variables: [],
    steps: [{ id: "navigate", type: "navigate", url: "https://example.test/orders" }],
    meta: {
      createdAt: "2026-08-23T08:00:00.000Z",
      updatedAt: "2026-08-23T08:00:00.000Z",
      source: "recorded",
    },
    ...overrides,
  };
}

function buildV2Flow(): FlowDocumentV2 {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION_V2,
    id: "flow_v2_source",
    projectId: "project_v2_source",
    name: "v2 原子闭环",
    steps: [
      {
        id: "input_profile_01",
        type: "input",
        name: "运行输入",
        fields: [
          {
            fieldId: "field_name_01",
            label: "名称",
            type: "string",
            required: true,
            sensitive: false,
            remember: "never",
          },
        ],
      },
      {
        id: "fill_name",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#name" }] },
        value: "{{field_name_01}}",
      },
    ],
    meta: {
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      source: "manual",
    },
  };
}

function buildSizedFlowText(targetBytes: number): string {
  const flow = buildFlow({ description: "" });
  const empty = JSON.stringify(flow);
  const padding = targetBytes - Buffer.byteLength(empty);
  if (padding < 0) {
    throw new Error("目标大小不足");
  }
  return JSON.stringify({ ...flow, description: "x".repeat(padding) });
}

async function prepareFile(name: string, contents: string): Promise<string> {
  await mkdir(TEST_DIR, { recursive: true });
  const filePath = path.join(TEST_DIR, name);
  await writeFile(filePath, contents);
  return filePath;
}

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("Studio Flow 文件导入", () => {
  it("dialog 取消属于正常结果且不会调用导入服务", async () => {
    const importFlow = vi.fn();

    await expect(
      importFlowFromFile("project_target", {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
        importFlow,
      }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(importFlow).not.toHaveBeenCalled();
  });

  it("只选择单个 JSON，并将裸 FlowDocument 交给专用导入服务创建新副本", async () => {
    const source = buildFlow();
    const filePath = await prepareFile("source.json", JSON.stringify(source));
    const imported = {
      ...source,
      id: "flow_imported_new",
      projectId: "project_target",
      name: "订单/登录：回归（导入）",
    };
    const warnings: FlowPortabilityWarning[] = [];
    const showOpenDialog = vi.fn().mockResolvedValue({ canceled: false, filePaths: [filePath] });
    const importFlow = vi.fn().mockResolvedValue({ flow: imported, warnings });

    await expect(
      importFlowFromFile("project_target", { showOpenDialog, importFlow }),
    ).resolves.toEqual({ status: "imported", flow: imported, warnings });

    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: ["openFile"],
        filters: [{ name: "Flow JSON", extensions: ["json"] }],
      }),
    );
    expect(importFlow).toHaveBeenCalledWith("project_target", source);
  });

  it("恰好允许 1 MiB 原始 bytes，多一字节在解析和写入前拒绝", async () => {
    const acceptedText = buildSizedFlowText(FLOW_IMPORT_FILE_LIMIT_BYTES);
    const oversizedText = buildSizedFlowText(FLOW_IMPORT_FILE_LIMIT_BYTES + 1);
    const acceptedPath = await prepareFile("accepted.json", acceptedText);
    const oversizedPath = await prepareFile("oversized.json", oversizedText);
    const importFlow = vi.fn(async (projectId: string, input: unknown) => {
      const flow = input as FlowDocument;
      return {
        flow: { ...flow, id: "flow_imported", projectId },
        warnings: [],
      };
    });

    expect(Buffer.byteLength(acceptedText)).toBe(FLOW_IMPORT_FILE_LIMIT_BYTES);
    expect(Buffer.byteLength(oversizedText)).toBe(FLOW_IMPORT_FILE_LIMIT_BYTES + 1);
    await expect(
      importFlowFromFile("project_target", {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [acceptedPath] }),
        importFlow,
      }),
    ).resolves.toMatchObject({ status: "imported" });

    importFlow.mockClear();
    await expect(
      importFlowFromFile("project_target", {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [oversizedPath] }),
        importFlow,
      }),
    ).rejects.toThrow("不能超过 1 MiB");
    expect(importFlow).not.toHaveBeenCalled();
  });

  it("即使 dialog 返回非 JSON 扩展名也会拒绝，不依赖 renderer 或筛选器兜底", async () => {
    const filePath = await prepareFile("source.txt", JSON.stringify(buildFlow()));
    const importFlow = vi.fn();

    await expect(
      importFlowFromFile("project_target", {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [filePath] }),
        importFlow,
      }),
    ).rejects.toThrow("必须是 .json 文件");
    expect(importFlow).not.toHaveBeenCalled();
  });

  it("拒绝指向 JSON 的真实 symlink，且不会调用导入服务", async () => {
    const targetPath = await prepareFile("target.json", JSON.stringify(buildFlow()));
    const symlinkPath = path.join(TEST_DIR, "linked.json");
    await symlink(targetPath, symlinkPath);
    const importFlow = vi.fn();

    await expect(
      importFlowFromFile("project_target", {
        showOpenDialog: vi
          .fn()
          .mockResolvedValue({ canceled: false, filePaths: [symlinkPath] }),
        importFlow,
      }),
    ).rejects.toThrow();

    expect(importFlow).not.toHaveBeenCalled();
  });

  it("拒绝伪装成 .json 的目录", async () => {
    const directoryPath = path.join(TEST_DIR, "directory.json");
    await mkdir(directoryPath, { recursive: true });
    const importFlow = vi.fn();

    await expect(
      importFlowFromFile("project_target", {
        showOpenDialog: vi
          .fn()
          .mockResolvedValue({ canceled: false, filePaths: [directoryPath] }),
        importFlow,
      }),
    ).rejects.toThrow();
    expect(importFlow).not.toHaveBeenCalled();
  });

  it.runIf(process.platform !== "win32")("拒绝伪装成 .json 的 FIFO", async () => {
    await mkdir(TEST_DIR, { recursive: true });
    const fifoPath = path.join(TEST_DIR, "stream.json");
    execFileSync("mkfifo", [fifoPath]);
    const writer = open(fifoPath, "w")
      .then(async (handle) => {
        try {
          await handle.writeFile(JSON.stringify(buildFlow()));
        } finally {
          await handle.close();
        }
      })
      .catch(() => undefined);
    const importFlow = vi.fn();

    await expect(
      importFlowFromFile("project_target", {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [fifoPath] }),
        importFlow,
      }),
    ).rejects.toThrow();
    await writer;
    expect(importFlow).not.toHaveBeenCalled();
  });

  it.each([
    ["畸形 JSON", "{not-json", "不是合法 JSON"],
    ["包装对象", JSON.stringify({ flow: buildFlow() }), "裸 FlowDocument"],
    ["版本不兼容", JSON.stringify({ ...buildFlow(), schemaVersion: 3 }), "schemaVersion 1 或 2"],
  ])("%s 在调用导入服务前准确失败", async (_caseName, contents, message) => {
    const filePath = await prepareFile("invalid.json", contents);
    const importFlow = vi.fn();

    await expect(
      importFlowFromFile("project_target", {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [filePath] }),
        importFlow,
      }),
    ).rejects.toThrow(message);
    expect(importFlow).not.toHaveBeenCalled();
  });

  it("目标项目不存在时透传专用导入错误且不返回伪成功", async () => {
    const filePath = await prepareFile("source.json", JSON.stringify(buildFlow()));
    const importFlow = vi.fn().mockRejectedValue(new Error("目标项目不存在"));

    await expect(
      importFlowFromFile("missing_project", {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [filePath] }),
        importFlow,
      }),
    ).rejects.toThrow("目标项目不存在");
    expect(importFlow).toHaveBeenCalledOnce();
  });

  it("strict v2 裸文档保持 schema 并交给原子导入服务重建身份", async () => {
    const source = buildV2Flow();
    const filePath = await prepareFile("v2.json", JSON.stringify(source));
    const imported = {
      ...source,
      id: "flow_v2_imported",
      projectId: "project_target",
      name: "v2 原子闭环（导入）",
    };
    const importFlow = vi.fn().mockResolvedValue({ flow: imported, warnings: [] });

    await expect(
      importFlowFromFile("project_target", {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [filePath] }),
        importFlow,
      }),
    ).resolves.toEqual({ status: "imported", flow: imported, warnings: [] });
    expect(importFlow).toHaveBeenCalledWith("project_target", source);
  });
});

describe("Studio Flow 文件导出", () => {
  it("save dialog 取消不会写文件", async () => {
    const writeOutput = vi.fn();

    await expect(
      exportFlowToFile("project_target", "flow_source", {
        getFlow: vi.fn().mockResolvedValue(buildFlow()),
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
        writeOutput,
      }),
    ).resolves.toEqual({ status: "cancelled" });

    expect(writeOutput).not.toHaveBeenCalled();
  });

  it("写入 pretty bare FlowDocument、安全默认名与真实 warnings", async () => {
    await mkdir(TEST_DIR, { recursive: true });
    const outputPath = path.join(TEST_DIR, "portable.json");
    const flow = buildFlow({
      variables: [
        {
          name: "secret_password",
          type: "string",
          required: false,
          defaultValue: "do-not-export",
        },
      ],
    });
    const showSaveDialog = vi
      .fn()
      .mockResolvedValue({ canceled: false, filePath: outputPath });

    const result = await exportFlowToFile("project_target", flow.id, {
      getFlow: vi.fn().mockResolvedValue(flow),
      showSaveDialog,
    });

    expect(result.status).toBe("exported");
    if (result.status !== "exported") throw new Error("预期导出成功");
    expect(result.warnings).toHaveLength(1);
    const dialogOptions = showSaveDialog.mock.calls[0]?.[0] as { defaultPath: string };
    expect(dialogOptions.defaultPath).toMatch(/^订单-登录-回归\.json$/);
    expect(dialogOptions.defaultPath).not.toMatch(/[\\/:*?"<>|]/);
    const raw = await readFile(outputPath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain("\n  \"schemaVersion\"");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("flow");
    expect(parsed).not.toHaveProperty("warnings");
    expect(raw).not.toContain("do-not-export");
  });

  it("写入失败时拒绝，不返回伪成功", async () => {
    const writeError = new Error("磁盘只读");

    await expect(
      exportFlowToFile("project_target", "flow_source", {
        getFlow: vi.fn().mockResolvedValue(buildFlow()),
        showSaveDialog: vi
          .fn()
          .mockResolvedValue({ canceled: false, filePath: "/selected/by-main.json" }),
        writeOutput: vi.fn().mockRejectedValue(writeError),
      }),
    ).rejects.toBe(writeError);
  });

  it("v2 导出保持同版本裸文档且不追加运行态字段", async () => {
    const flow = buildV2Flow();
    const outputPath = await prepareFile("v2-output.json", "");
    const result = await exportFlowToFile("project_target", flow.id, {
      getFlow: vi.fn().mockResolvedValue(flow),
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: outputPath }),
    });

    expect(result).toEqual({ status: "exported", warnings: [] });
    const parsed = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      schemaVersion: FLOW_SCHEMA_VERSION_V2,
      id: flow.id,
      projectId: flow.projectId,
    });
    expect(parsed).not.toHaveProperty("revision");
    expect(parsed).not.toHaveProperty("executions");
    expect(parsed).not.toHaveProperty("recentValues");
  });
});
