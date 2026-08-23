import path from "node:path";
import { defineConfig } from "vitest/config";

const studioDir = path.resolve(import.meta.dirname);

export default defineConfig({
  resolve: {
    alias: {
      "@flowweave/ui": path.resolve(studioDir, "../../packages/ui/src/index.ts"),
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/*.spec.ts",
      "src/**/*.spec.tsx",
      "electron/**/*.test.ts",
      "electron/**/*.test.tsx",
      "electron/**/*.spec.ts",
      "electron/**/*.spec.tsx",
      "scripts/**/*.test.mjs",
    ],
    passWithNoTests: true,
  },
});
