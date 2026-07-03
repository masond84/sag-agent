import { logActivity, type ActivityEventType } from "../../core/activity-log.js";
import { runContentPipelineTick, type PipelineEvent } from "../../core/content/pipeline.js";
import { isContentEngineEnabled } from "../../core/content/store.js";
import type { AgentHealthContext, ScheduledSkill, ScheduledSkillResult } from "../../types.js";

const ACTIVITY_TYPES = new Set<ActivityEventType>([
  "content_planned",
  "content_scripted",
  "content_manus_queued",
  "content_draft_ready",
  "content_posted",
  "content_failed",
]);

function toActivityType(type: PipelineEvent["type"]): ActivityEventType | null {
  if (type === "skipped") return null;
  if (ACTIVITY_TYPES.has(type as ActivityEventType)) {
    return type as ActivityEventType;
  }
  return null;
}

export const contentEngineSkill: ScheduledSkill = {
  kind: "scheduled",
  config: {
    id: "content-engine",
    name: "Content Engine",
    enabled: true,
    kind: "scheduled",
  },

  async run(_context: AgentHealthContext): Promise<ScheduledSkillResult | null> {
    if (!isContentEngineEnabled()) return null;

    const events = await runContentPipelineTick();

    for (const event of events) {
      const activityType = toActivityType(event.type);
      if (!activityType) continue;
      await logActivity(activityType, event.summary, {
        episodeId: event.episode?.id ?? "",
        status: event.episode?.status ?? "",
      });
    }

    const notifyEvent =
      events.find((e) => e.type === "content_draft_ready" && e.notify) ??
      events.find((e) => e.type === "content_failed" && e.notify) ??
      events.find((e) => e.type === "content_manus_queued" && e.notify);

    if (!notifyEvent) return null;

    return {
      type: notifyEvent.type === "content_failed" ? "alert" : "report",
      message: notifyEvent.summary,
      bypassDryRun: true,
      speak: notifyEvent.speak === true,
    };
  },
};
