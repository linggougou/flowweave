const { execFileSync } = require("node:child_process");
const { basename, dirname, join } = require("node:path");
const { chromium } = require("playwright");

const useAdhocSigning = !process.env.CSC_LINK && !process.env.CSC_NAME;
const chromiumExecutablePath = chromium.executablePath();
let chromiumDirectory = dirname(chromiumExecutablePath);
while (!/^chromium-\d+$/.test(basename(chromiumDirectory))) {
  const parent = dirname(chromiumDirectory);
  if (parent === chromiumDirectory) {
    throw new Error(`无法从 Playwright 路径解析 Chromium revision：${chromiumExecutablePath}`);
  }
  chromiumDirectory = parent;
}
const chromiumRevision = basename(chromiumDirectory).replace("chromium-", "");
const playwrightCacheDirectory = dirname(chromiumDirectory);
const headlessShellDirectory = join(
  playwrightCacheDirectory,
  `chromium_headless_shell-${chromiumRevision}`,
);

module.exports = {
  appId: "com.flowweave.studio",
  productName: "织流 Studio",
  asar: true,
  directories: {
    output: "release",
  },
  files: ["dist/**/*", "dist-electron/**/*"],
  extraResources: [
    {
      from: "dist-electron/native",
      to: "native",
      filter: ["better_sqlite3.node"],
    },
    {
      from: "../../examples/fixtures/login.html",
      to: "examples/fixtures/login.html",
    },
    {
      from: chromiumDirectory,
      to: `ms-playwright/chromium-${chromiumRevision}`,
    },
    {
      from: headlessShellDirectory,
      to: `ms-playwright/chromium_headless_shell-${chromiumRevision}`,
    },
  ],
  asarUnpack: ["**/*.node"],
  npmRebuild: false,
  afterPack: async (context) => {
    if (context.electronPlatformName !== "darwin" || !useAdhocSigning) {
      return;
    }
    const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    execFileSync(process.execPath, [join(__dirname, "scripts/adhoc-sign-app.mjs"), appPath], {
      stdio: "inherit",
    });
  },
  mac: {
    category: "public.app-category.productivity",
    identity: useAdhocSigning ? null : undefined,
    target: ["dmg"],
    artifactName: "FlowWeave-Studio-${version}-${arch}.${ext}",
  },
  dmg: {
    title: "织流 Studio ${version}",
    contents: [
      { x: 140, y: 220 },
      { x: 420, y: 220, type: "link", path: "/Applications" },
    ],
  },
};
