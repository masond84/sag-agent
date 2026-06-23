import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { getRepoRoot } from "../assistant/repo-tools.js";
import { runBuild, pullMainAndCheckout } from "./git.js";

const execFileAsync = promisify(execFile);

function houseRefreshEnabled(): boolean {
  return (process.env.DEV_HOUSE_BUILD ?? "true").toLowerCase() !== "false";
}

function houseRestartEnabled(): boolean {
  return (process.env.DEV_HOUSE_RESTART ?? "true").toLowerCase() === "true";
}

export async function buildHouseApp(): Promise<string> {
  const root = getRepoRoot();
  const houseDir = path.join(root, "house");
  try {
    await execFileAsync("npm", ["run", "build"], {
      cwd: houseDir,
      maxBuffer: 2_000_000,
    });
    return "House build ok.";
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `House build failed: ${detail}`;
  }
}

async function restartHouseApp(): Promise<string> {
  const root = getRepoRoot();
  const script = path.join(root, "scripts/house-restart.sh");
  try {
    await execFileAsync("bash", [script], { cwd: root, maxBuffer: 2_000_000 });
    return "House restarted.";
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `House restart failed: ${detail}`;
  }
}

export async function refreshWorkerAfterMerge(): Promise<string> {
  const steps: string[] = [];
  try {
    steps.push(await pullMainAndCheckout());
  } catch (e) {
    steps.push(String(e));
  }

  const build = await runBuild();
  steps.push(build.ok ? "Rebuild ok." : "Rebuild failed.");

  if (houseRefreshEnabled()) {
    steps.push(await buildHouseApp());
    if (houseRestartEnabled()) {
      steps.push(await restartHouseApp());
    }
  }

  if ((process.env.DEV_SELF_RESTART ?? "true").toLowerCase() !== "false") {
    try {
      const label = process.env.LAUNCHD_LABEL?.trim() || "com.masond84.sag-agent";
      await execFileAsync("launchctl", ["kickstart", "-k", `gui/${process.getuid?.() ?? 501}/${label}`], {
        cwd: getRepoRoot(),
      });
      steps.push("Worker restarted.");
    } catch {
      steps.push("launchctl skip.");
    }
  }

  return steps.join("\n");
}
