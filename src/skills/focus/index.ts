import type { ScheduledSkill } from "../../types.js";
import { runUnifiedCompanion } from "../../core/companion/unified.js";

export { getCompanionHours, getFocusAnchorHours } from "../../core/companion/unified.js";

export const focusCompanionSkill: ScheduledSkill = {
  kind: "scheduled",
  config: {
    id: "focus-companion",
    name: "Focus Companion",
    enabled: true,
    kind: "scheduled",
  },
  run: runUnifiedCompanion,
};
