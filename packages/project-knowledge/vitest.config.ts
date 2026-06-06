import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(packageDir, "..");

export default defineConfig({
  resolve: {
    alias: {
      "@flowweave/shared": path.resolve(packagesDir, "shared/src/index.ts"),
      "@flowweave/flow-dsl": path.resolve(packagesDir, "flow-dsl/src/index.ts"),
      "@flowweave/page-intelligence": path.resolve(
        packagesDir,
        "page-intelligence/src/index.ts",
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    pool: "forks",
    fileParallelism: false,
  },
});
