import { defineConfig } from "wxt";

export default defineConfig({
  outDir: "dist",
  extensionApi: "chrome",
  manifest: {
    name: "FlowWeave 录制",
    description: "织流 — 网页流程录制（P1）",
    version: "0.1.0",
    permissions: ["storage", "sidePanel", "tabs"],
    host_permissions: ["http://127.0.0.1:3847/*", "http://localhost:3847/*"],
    action: {
      default_title: "打开 FlowWeave 侧栏",
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
  },
});
