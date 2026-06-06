import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const studioRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronBin = join(studioRoot, "node_modules", "electron", "cli.js");

const env = {
  ...process.env,
  VITE_DEV_SERVER_URL: "http://127.0.0.1:5173",
};

const child = spawn(process.execPath, [electronBin, "."], {
  cwd: studioRoot,
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
