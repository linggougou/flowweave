import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist-electron", { recursive: true });

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

await esbuild.build({
  ...shared,
  entryPoints: ["electron/main.ts"],
  platform: "node",
  format: "esm",
  outfile: "dist-electron/main.mjs",
});

await esbuild.build({
  ...shared,
  entryPoints: ["electron/preload.ts"],
  platform: "browser",
  format: "cjs",
  outfile: "dist-electron/preload.cjs",
});
