import * as esbuild from "esbuild";

const externals = [
  "electron",
  "@flowweave/runtime",
  "playwright",
  "playwright-core",
];

const shared = {
  bundle: true,
  sourcemap: true,
  external: externals,
  packages: "external",
};

const mainCtx = await esbuild.context({
  ...shared,
  entryPoints: ["electron/main.ts"],
  platform: "node",
  format: "esm",
  outfile: "dist-electron/main.mjs",
});

const preloadCtx = await esbuild.context({
  ...shared,
  entryPoints: ["electron/preload.ts"],
  platform: "browser",
  format: "cjs",
  outfile: "dist-electron/preload.cjs",
});

await Promise.all([mainCtx.watch(), preloadCtx.watch()]);
console.log("[studio] Electron 主进程 / preload 监听中，修改后自动编译（需重启 Electron 窗口）");
