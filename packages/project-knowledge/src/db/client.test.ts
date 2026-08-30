import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDatabase = vi.fn(() => {
  const database = {
    pragma: vi.fn((statement: string) => (statement.startsWith("table_info(") ? [] : undefined)),
    exec: vi.fn(),
    close: vi.fn(),
    transaction: vi.fn((callback: () => void) => ({ immediate: callback })),
  };
  return database;
});

const mockDrizzle = vi.fn(() => ({ kind: "mock-db" }));

vi.mock("better-sqlite3", () => ({
  default: mockDatabase,
}));

vi.mock("drizzle-orm/better-sqlite3", () => ({
  drizzle: mockDrizzle,
}));

describe("openProjectDatabase", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDatabase.mockClear();
    mockDrizzle.mockClear();
  });

  it("显式 nativeBinding 时将 Electron 原生模块路径传给 better-sqlite3", async () => {
    const { openProjectDatabase } = await import("./client.js");

    (openProjectDatabase as unknown as (...args: unknown[]) => unknown)(
      "project_native_binding",
      "/tmp/flowweave-project-knowledge",
      {
        nativeBinding: "/tmp/flowweave-electron/better_sqlite3.node",
      },
    );

    expect(mockDatabase).toHaveBeenCalledWith(expect.stringContaining("project_native_binding"), {
      nativeBinding: "/tmp/flowweave-electron/better_sqlite3.node",
    });
  });
});
