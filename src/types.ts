// Define the type of skills that can be handled.
export type SkillKind = "email" | "scheduled" | "interactive";

// Interface detailing the trigger parameters for email skills.
export interface SkillTrigger {
  from?: string;
  subjectContains?: string;
  gmailQuery: string;
}

// Configuration for an email-based skill.
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

// Configuration for a scheduled skill.
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

// Configuration for an interactive skill.
export interface InteractiveSkillConfig {
  id: string;
  name: string;
  enabled: boolean;
  kind: "interactive";
}

// Union type for all possible skill configurations.
export type SkillConfig = EmailSkillConfig | ScheduledSkillConfig | InteractiveSkillConfig;

// Representation of an email message.
export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  html?: string;
  text?: string;
}

// Representation of a Conservice statement extracted from an email message.
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

// Interface for defining an email skill and its methods.
export interface EmailSkill {
  kind: "email";
  config: EmailSkillConfig;
  matches(message: EmailMessage): boolean;
  extract(message: EmailMessage): ConserviceStatement | null;
  format(data: ConserviceStatement): string;
}

// Context for calculating agent health, primarily for monitoring purposes.
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

// Summary information for a defined skill.
export interface SkillSummary {
  id: string;
  name: string;
  kind: SkillKind;
}

// Context interface for interactive skills.
export interface InteractiveSkillContext {
  health: AgentHealthContext;
  skills: SkillSummary[];
}

// Result format for a scheduled skill's action.
export interface ScheduledSkillResult {
  message: string;
  type: "report" | "alert" | "briefing";
  bypassDryRun?: boolean;
}

// Scheduled skill interface detailing execution and configuration.
export interface ScheduledSkill {
  kind: "scheduled";
  config: ScheduledSkillConfig;
  run(context: AgentHealthContext): Promise<ScheduledSkillResult | null>;
}

// Interactive skill interface detailing execution and configuration.
export interface InteractiveSkill {
  kind: "interactive";
  config: InteractiveSkillConfig;
  run(context: InteractiveSkillContext): Promise<void>;
}

// Grouped representation of loaded skills, divided by type.
export interface LoadedSkills {
  email: EmailSkill[];
  scheduled: ScheduledSkill[];
  interactive: InteractiveSkill[];
}

// Configuration for the worker, detailing runtime parameters.
export interface WorkerConfig {
  pollIntervalMs: number;
  dryRun: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Loads the worker configuration from environment variables.
 * Defaults are provided for each configuration value.
 */
export function loadWorkerConfig(): WorkerConfig {
  return {
    // Poll interval determines how frequently the worker checks for tasks, defaulting to 10 minutes.
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 600_000),
    // Dry run mode indicates if changes should be logged without actual execution.
    dryRun: (process.env.DRY_RUN ?? "true").toLowerCase() === "true",
    // Log level controls the verbosity of output, with "info" as the standard level.
    logLevel: (process.env.LOG_LEVEL ?? "info") as WorkerConfig["logLevel"],
  }; 
}

// Type guard for identifying if a configuration is Scheduled-specific.
export function isScheduledSkillConfig(config: SkillConfig): config is ScheduledSkillConfig {
  return config.kind === "scheduled";
}

// Type guard for identifying if a configuration is Interactive-specific.
export function isInteractiveSkillConfig(config: SkillConfig): config is InteractiveSkillConfig {
  return config.kind === "interactive";
}
