import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist-electron", { recursive: true });

const externals = [
  "electron",
  "@flowweave/runtime",
  "@flowweave/project-knowledge",
  "@flowweave/flow-dsl",
  "@flowweave/shared",
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
  format: "cjs",
  outfile: "dist-electron/main.cjs",
});

await esbuild.build({
  ...shared,
  entryPoints: ["electron/preload.ts"],
  platform: "browser",
  format: "cjs",
  outfile: "dist-electron/preload.cjs",
});
