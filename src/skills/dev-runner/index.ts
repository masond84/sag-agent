import type { AgentHealthContext, ScheduledSkill, ScheduledSkillResult } from "../../types.js";
import { runDevCycle } from "../../core/dev/runner.js";
import { isDevRunnerEnabled } from "../../core/dev/state.js";

export const devRunnerSkill: ScheduledSkill = {
  kind: "scheduled",
  config: { id: "dev-runner", name: "Autonomous Dev Runner", enabled: true, kind: "scheduled" },
  async run(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
    if (!isDevRunnerEnabled()) return null;
    const result = await runDevCycle();
    if (!result?.notify) return null;
    const header = result.mergedPrs.length ? `SAG evolved (merged ${result.mergedPrs.map((n) => `#${n}`).join(", ")})` : "SAG dev update";
    return { type: "report", message: [header, "", result.brief].join("\n"), bypassDryRun: true };
  },
};
