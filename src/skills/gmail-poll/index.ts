import type { AgentHealthContext, ScheduledSkill, ScheduledSkillResult } from "../../types.js";

/**
 * Gmail polling is handled by core/worker.ts (setInterval on POLL_INTERVAL_MS).
 * This skill gates that loop when enabled in config/skills/gmail-poll.yaml.
 */
export const gmailPollSkill: ScheduledSkill = {
  kind: "scheduled",
  config: {
    id: "gmail-poll",
    name: "Gmail Poll",
    enabled: true,
    kind: "scheduled",
  },
  async run(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
    // No-op: worker runs Gmail poll when this skill is enabled.
    return null;
  },
};
