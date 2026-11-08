/**
 * Job pipeline loop - integrated with existing cron/zsync/job-mirror.
 * 
 * Reads job-pipeline.json, compares against goal targets, surfaces next action.
 */
import { loadJobPipeline } from "../zsync/store.js";
import { saveGoal } from "../goals/store.js";
import { getZonedTimeInfo } from "../schedule.js";
import type { LoopConfig, LoopContext, LoopResult, LoopRunner } from "./types.js";

function isJobDeadlineUrgent(closes: string | undefined, timeZone: string): boolean {
  if (!closes) return false;
  
  try {
    const now = getZonedTimeInfo(timeZone);
    const closesDate = new Date(closes);
    const nowDate = new Date(now.dateKey);
    const daysUntil = Math.floor((closesDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysUntil >= 0 && daysUntil <= 7;
  } catch {
    return false;
  }
}

async function runJobPipelineLoop(context: LoopContext): Promise<LoopResult> {
  const pipeline = await loadJobPipeline();
  
  if (!pipeline) {
    return {
      loopId: "job-pipeline",
      goalId: context.goal.id,
      success: false,
      error: "job-pipeline.json not found",
      missingData: ["job-pipeline.json"],
      executedAt: new Date().toISOString(),
    };
  }

  const staleData: string[] = [];
  const missingData: string[] = [];
  
  const active = pipeline.targets.filter(t => !["rejected", "archived"].includes(t.status));
  const researching = active.filter(t => t.status === "researching");
  const drafting = active.filter(t => t.status === "drafting");
  const urgentDeadlines = active.filter(t => isJobDeadlineUrgent(t.closes, context.timeZone));

  const targetCount = 140;
  const reportedRoles = 10;
  const hasDrafts = pipeline.targets.some(t => 
    ["Marker Learning", "Titan", "Fieldguide"].some(co => t.company.includes(co))
  );

  const fieldguide = pipeline.targets.find(t => t.company === "Fieldguide");
  const hasUrgentFieldguide = fieldguide && isJobDeadlineUrgent(fieldguide.closes, context.timeZone);

  let nextActionDescription: string;
  let ownerOfNextInput: "sag" | "devin" | "z";

  if (hasUrgentFieldguide && fieldguide.status === "researching") {
    nextActionDescription = `URGENT: Fieldguide closes ${fieldguide.closes} - Devin to review and send outreach draft`;
    ownerOfNextInput = "devin";
  } else if (urgentDeadlines.length > 0) {
    const urgent = urgentDeadlines[0];
    nextActionDescription = `${urgent.company} closes ${urgent.closes} - ${urgent.status === "researching" ? "draft outreach" : "Devin to send"}`;
    ownerOfNextInput = urgent.status === "researching" ? "z" : "devin";
  } else if (drafting.length > 0) {
    const draft = drafting[0];
    nextActionDescription = `${draft.company} draft ready - Devin to review and send`;
    ownerOfNextInput = "devin";
  } else if (researching.length > 0) {
    const target = researching[0];
    nextActionDescription = `${target.company} (${target.role}) - complete research and draft outreach`;
    ownerOfNextInput = "z";
  } else if (active.length < reportedRoles) {
    nextActionDescription = `${active.length}/${reportedRoles} roles in pipeline - add more $140k+ targets`;
    ownerOfNextInput = "z";
  } else {
    nextActionDescription = `${active.length} active roles tracked; maintain pipeline health`;
    ownerOfNextInput = "sag";
  }

  const updatedGoal = { ...context.goal };
  updatedGoal.measurement = {
    current: `${active.length} active roles (${researching.length} researching, ${drafting.length} drafted, ${urgentDeadlines.length} urgent deadlines)`,
    measuredAt: pipeline.updatedAt,
    source: "job-pipeline.json",
    stale: false,
    missing: false,
  };
  updatedGoal.nextAction = {
    description: nextActionDescription,
    ownerOfNextInput,
  };
  updatedGoal.updatedAt = new Date().toISOString();
  updatedGoal.updatedBy = "sag";

  if (!context.dryRun) {
    await saveGoal(updatedGoal);
  }

  return {
    loopId: "job-pipeline",
    goalId: context.goal.id,
    success: true,
    action: {
      description: nextActionDescription,
      type: hasUrgentFieldguide || urgentDeadlines.length > 0 ? "alert" : "report",
      ownerOfNextInput,
      payload: {
        active: active.length,
        researching: researching.length,
        drafting: drafting.length,
        urgentDeadlines: urgentDeadlines.length,
        fieldguideDeadline: fieldguide?.closes,
      },
    },
    measurements: {
      activeRoles: active.length,
      targetRoles: reportedRoles,
      targetSalary: targetCount * 1000,
      pipelineDepth: pipeline.listDepth,
    },
    staleData,
    missingData,
    executedAt: new Date().toISOString(),
  };
}

export const jobPipelineLoop: LoopRunner = {
  config: {
    id: "job-pipeline",
    name: "Job Pipeline Monitor",
    description: "Tracks job search progress toward $140k+ target, surfaces urgent deadlines and drafts needing review",
    goalId: "job-140k",
    status: "active",
    enabled: true,
  },
  run: runJobPipelineLoop,
};
