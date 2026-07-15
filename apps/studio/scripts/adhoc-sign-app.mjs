#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function adhocSignMacApp({ appPath, execFileSyncImpl = execFileSync }) {
  execFileSyncImpl("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  execFileSyncImpl("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
}

const invokedAsScript =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  const appPath = process.argv[2];
  if (!appPath) {
    throw new Error("缺少待签名的 macOS app 路径");
  }
  adhocSignMacApp({ appPath });
}
