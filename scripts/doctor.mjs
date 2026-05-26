#!/usr/bin/env node
/**
 * FlowWeave 本地环境自检：Node、Playwright Chromium、Web API、数据目录。
 * 用法：pnpm doctor 或 node scripts/doctor.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_API_HEALTH_URL =
  process.env.FLOWWEAVE_WEB_API_HEALTH ?? "http://127.0.0.1:3847/api/health";
const FLOWWEAVE_HOME = join(homedir(), ".flowweave");

const MIN_NODE_MAJOR = 20;

/** @type {boolean} */
let hasCriticalFailure = false;

/**
 * @param {"ok" | "warn" | "fail"} level
 * @param {string} title
 * @param {string} [detail]
 */
function report(level, title, detail) {
  const icon = level === "ok" ? "✓" : level === "warn" ? "!" : "✗";
  console.log(`${icon} ${title}`);
  if (detail) {
    for (const line of detail.split("\n")) {
      console.log(`  ${line}`);
    }
  }
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isNaN(major) || major < MIN_NODE_MAJOR) {
    hasCriticalFailure = true;
    report(
      "fail",
      `Node.js 版本需 >= ${MIN_NODE_MAJOR}`,
      `当前：${process.version}\n修复：使用 nvm/fnm 切换至 Node ${MIN_NODE_MAJOR}（见仓库 .nvmrc）`,
    );
    return;
  }

  report("ok", `Node.js ${process.version}`);
}

function checkPlaywrightChromium() {
  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    pnpmCmd,
    [
      "--filter",
      "@flowweave/runtime",
      "exec",
      "playwright",
      "install",
      "--dry-run",
      "chromium",
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );

  if (result.status === 0) {
    report("ok", "Playwright Chromium 已就绪");
    return;
  }

  hasCriticalFailure = true;
  const stderr = (result.stderr ?? "").trim();
  const stdout = (result.stdout ?? "").trim();
  report(
    "fail",
    "Playwright Chromium 不可用",
    [
      stderr || stdout || "未检测到已安装的 Chromium 浏览器",
      "修复：pnpm --filter @flowweave/runtime exec playwright install chromium",
    ].join("\n"),
  );
}

async function checkWebApiHealth() {
  try {
    const response = await fetch(WEB_API_HEALTH_URL, {
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      report(
        "warn",
        `Web API 健康检查未通过（${WEB_API_HEALTH_URL}）`,
        `HTTP ${response.status}\n修复：在另一终端运行 pnpm dev:web`,
      );
      return;
    }

    const body = await response.json();
    if (body?.ok === true) {
      report("ok", `Web API 正常（${WEB_API_HEALTH_URL}）`);
      return;
    }

    report(
      "warn",
      `Web API 响应异常（${WEB_API_HEALTH_URL}）`,
      `返回：${JSON.stringify(body)}\n修复：确认 apps/web 服务已启动（pnpm dev:web）`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report(
      "warn",
      `Web API 不可达（${WEB_API_HEALTH_URL}）`,
      `${message}\n修复：在另一终端运行 pnpm dev:web`,
    );
  }
}

function checkFlowweaveHome() {
  if (existsSync(FLOWWEAVE_HOME)) {
    report("ok", `数据目录存在（${FLOWWEAVE_HOME}）`);
    return;
  }

  report(
    "warn",
    `数据目录尚未创建（${FLOWWEAVE_HOME}）`,
    "首次运行 pnpm e2e:login 或在扩展侧栏同步到知识库后会自动创建",
  );
}

console.log("FlowWeave 环境自检\n");

checkNodeVersion();
checkPlaywrightChromium();
await checkWebApiHealth();
checkFlowweaveHome();

console.log("");
if (hasCriticalFailure) {
  console.log("自检未通过：请先修复上述 ✗ 项后再运行 pnpm smoke。");
  process.exit(1);
}

console.log("自检完成：关键依赖正常。Web API 或数据目录警告可忽略（按需启动服务或运行 e2e）。");
