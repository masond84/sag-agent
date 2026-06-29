import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const agentDir = path.join(root, "livekit-agent");
const venvDir = path.join(agentDir, ".venv");
const isWin = process.platform === "win32";

function venvPython(): string {
  return isWin
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
}

function venvPip(): string {
  return isWin ? path.join(venvDir, "Scripts", "pip.exe") : path.join(venvDir, "bin", "pip");
}

function run(command: string, args: string[], cwd = root): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: isWin });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

function resolveSystemPython(): { command: string; args: string[] } {
  const candidates: Array<{ command: string; args: string[] }> = isWin
    ? [
        { command: "py", args: ["-3.12"] },
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
      ]
    : [
        { command: "python3.12", args: [] },
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.args, "--version"], {
      cwd: root,
      stdio: "ignore",
      shell: isWin,
    });
    if (probe.status === 0) {
      return candidate;
    }
  }

  console.error(
    isWin
      ? "Python not found. Install Python 3.12+ and ensure `py` or `python` is on PATH."
      : "Python not found. Install Python 3.12+ and ensure `python3.12` or `python3` is on PATH.",
  );
  process.exit(1);
}

if (!existsSync(venvDir)) {
  console.log("==> Creating Python venv in livekit-agent/");
  const python = resolveSystemPython();
  run(python.command, [...python.args, "-m", "venv", venvDir]);
  run(venvPip(), ["install", "-r", path.join(agentDir, "requirements.txt")], agentDir);
}

run(venvPython(), [path.join(agentDir, "agent.py"), "dev"], agentDir);
