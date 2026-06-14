import "dotenv/config";
import { getDevStatus } from "../core/dev/status.js";
import { isDevRunnerEnabled } from "../core/dev/state.js";

async function main(): Promise<void> {
  console.log(`DEV_RUNNER_ENABLED=${isDevRunnerEnabled()}\n`);
  console.log(await getDevStatus());
}

main().catch((e) => { console.error(e); process.exit(1); });
