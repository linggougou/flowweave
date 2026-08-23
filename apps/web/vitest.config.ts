import path from "node:path";
import { defineConfig } from "vitest/config";

const webDir = path.resolve(import.meta.dirname);

export default defineConfig({
  resolve: {
    alias: {
      "@flowweave/ui": path.resolve(webDir, "../../packages/ui/src/index.ts"),
    },
  },
  test: {
    include: ["server/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
