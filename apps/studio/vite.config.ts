import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(studioDir, "../../packages");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@flowweave/ui": path.resolve(packagesDir, "ui/src/index.ts"),
      "@flowweave/shared": path.resolve(packagesDir, "shared/src/index.ts"),
      "@flowweave/flow-dsl": path.resolve(packagesDir, "flow-dsl/src/index.ts"),
      "@flowweave/project-knowledge": path.resolve(
        packagesDir,
        "project-knowledge/src/index.ts",
      ),
      "@flowweave/page-intelligence": path.resolve(
        packagesDir,
        "page-intelligence/src/index.ts",
      ),
      "@flowweave/runtime": path.resolve(packagesDir, "runtime/src/index.ts"),
    },
  },
  root: ".",
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
