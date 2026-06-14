export type SkillKind = "email" | "scheduled" | "interactive";

export interface SkillTrigger {
  from?: string;
  subjectContains?: string;
  gmailQuery: string;
}

export interface EmailSkillConfig {
  id: string;
  name: string;
  enabled: boolean;
  kind?: "email";
  trigger: SkillTrigger;
  notify?: {
    prefix?: string;
  };
}

export interface ScheduledSkillConfig {
  id: string;
  name: string;
  enabled: boolean;
  kind: "scheduled";
  schedule?: {
    reportIntervalMs?: number;
    staleAfterMs?: number;
    alertCooldownMs?: number;
  };
}

export interface InteractiveSkillConfig {
  id: string;
  name: string;
  enabled: boolean;
  kind: "interactive";
}

export type SkillConfig = EmailSkillConfig | ScheduledSkillConfig | InteractiveSkillConfig;

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  html?: string;
  text?: string;
}

export interface ConserviceStatement {
  propertyName?: string;
  dueDate?: string;
  accountSuffix?: string;
  totalCharge?: string;
  lineItems: Array<{
    serviceType: string;
    servicePeriod?: string;
    charge?: string;
  }>;
}

export interface EmailSkill {
  kind: "email";
  config: EmailSkillConfig;
  matches(message: EmailMessage): boolean;
  extract(message: EmailMessage): ConserviceStatement | null;
  format(data: ConserviceStatement): string;
}

export interface AgentHealthContext {
  previousLastRunAt?: string;
  emailSkillCount: number;
  scheduledSkillCount: number;
  interactiveSkillCount: number;
  processedMessageCount: number;
  gmailConfigured: boolean;
  telegramConfigured: boolean;
  dryRun: boolean;
  skills: SkillSummary[];
}

export interface SkillSummary {
  id: string;
  name: string;
  kind: SkillKind;
}

export interface InteractiveSkillContext {
  health: AgentHealthContext;
  skills: SkillSummary[];
}

export interface ScheduledSkillResult {
  message: string;
  type: "report" | "alert" | "briefing";
  bypassDryRun?: boolean;
}

export interface ScheduledSkill {
  kind: "scheduled";
  config: ScheduledSkillConfig;
  run(context: AgentHealthContext): Promise<ScheduledSkillResult | null>;
}

export interface InteractiveSkill {
  kind: "interactive";
  config: InteractiveSkillConfig;
  run(context: InteractiveSkillContext): Promise<void>;
}

export interface LoadedSkills {
  email: EmailSkill[];
  scheduled: ScheduledSkill[];
  interactive: InteractiveSkill[];
}

export interface WorkerConfig {
  pollIntervalMs: number;
  dryRun: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadWorkerConfig(): WorkerConfig {
  return {
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 600_000),
    dryRun: (process.env.DRY_RUN ?? "true").toLowerCase() === "true",
    logLevel: (process.env.LOG_LEVEL ?? "info") as WorkerConfig["logLevel"],
  };
}

export function isEmailSkillConfig(config: SkillConfig): config is EmailSkillConfig {
  return config.kind !== "scheduled" && config.kind !== "interactive";
}

export function isScheduledSkillConfig(config: SkillConfig): config is ScheduledSkillConfig {
  return config.kind === "scheduled";
}

export function isInteractiveSkillConfig(config: SkillConfig): config is InteractiveSkillConfig {
  return config.kind === "interactive";
}
