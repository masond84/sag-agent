import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRepoRoot } from "../assistant/repo-tools.js";
import { runBuild, pullMainAndCheckout } from "./git.js";

const execFileAsync = promisify(execFile);

export async function refreshWorkerAfterMerge(): Promise<string> {
  const steps: string[] = [];
  try { steps.push(await pullMainAndCheckout()); } catch (e) { steps.push(String(e)); }
  const build = await runBuild();
  steps.push(build.ok ? "Rebuild ok." : "Rebuild failed.");
  if ((process.env.DEV_SELF_RESTART ?? "true").toLowerCase() !== "false") {
    try {
      const label = process.env.LAUNCHD_LABEL?.trim() || "com.masond84.sag-agent";
      await execFileAsync("launchctl", ["kickstart", "-k", `gui/${process.getuid?.() ?? 501}/${label}`], { cwd: getRepoRoot() });
      steps.push("Worker restarted.");
    } catch { steps.push("launchctl skip."); }
  }
  return steps.join("\n");
}
