import type { AgentHealthContext, ScheduledSkill, ScheduledSkillResult } from "../../types.js";
import { refreshWorkerAfterMerge } from "../../core/dev/restart.js";
import { runDevCycle } from "../../core/dev/runner.js";
import { isDevRunnerEnabled } from "../../core/dev/state.js";
import { isTelegramConfigured, sendNotification } from "../../core/notify.js";

export const devRunnerSkill: ScheduledSkill = {
  kind: "scheduled",
  config: { id: "dev-runner", name: "Autonomous Dev Runner", enabled: true, kind: "scheduled" },
  async run(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
    if (!isDevRunnerEnabled()) return null;
    const result = await runDevCycle();
    if (!result?.notify) return null;

    const header = result.mergedPrs.length
      ? `SAG evolved (merged ${result.mergedPrs.map((n) => `#${n}`).join(", ")})`
      : "SAG dev update";
    const message = [header, "", result.brief].join("\n");

    if (result.mergedPrs.length > 0) {
      if (isTelegramConfigured()) {
        await sendNotification(message);
      }
      await refreshWorkerAfterMerge();
      return null;
    }

    return { type: "report", message, bypassDryRun: true };
  },
};
