import type { ContentEpisode, ContentSeries, ManusPackageManifest, ManusResult } from "./types.js";
import {
  getPackageDir,
  readManusResult,
  updateEpisodeStatus,
  writeManusPackage,
  writeManusResult,
} from "./store.js";

const DEFAULT_MANUS_API_URL = "https://api.manus.ai";

/** Manus structured output schema (all properties required per API docs). */
const MANUS_RESULT_SCHEMA = {
  type: "object",
  properties: {
    videoUrl: {
      type: "string",
      description: "HTTPS URL to the finished narrated video, or empty string if unavailable",
    },
    voiceoverUrl: {
      type: "string",
      description: "HTTPS URL to voiceover audio alone, or empty string",
    },
    thumbnailUrl: {
      type: "string",
      description: "HTTPS URL to a thumbnail image, or empty string",
    },
    durationSeconds: {
      type: "number",
      description: "Approximate video duration in seconds",
    },
    notes: {
      type: "string",
      description: "Short production notes or empty string",
    },
    shareUrl: {
      type: "string",
      description: "Manus task share URL or other asset link, or empty string",
    },
  },
  required: ["videoUrl", "voiceoverUrl", "thumbnailUrl", "durationSeconds", "notes", "shareUrl"],
  additionalProperties: false,
} as const;

function getManusApiUrl(): string {
  return (process.env.MANUS_API_URL?.trim() || DEFAULT_MANUS_API_URL).replace(/\/$/, "");
}

function getManusApiKey(): string | undefined {
  return process.env.MANUS_API_KEY?.trim() || undefined;
}

export function isManusApiConfigured(): boolean {
  if ((process.env.MANUS_ENABLED ?? "true").toLowerCase() === "false") {
    return false;
  }
  return Boolean(getManusApiKey());
}

export function isManusEnabled(): boolean {
  return (process.env.MANUS_ENABLED ?? "true").toLowerCase() !== "false";
}

function manusHeaders(): Record<string, string> {
  const apiKey = getManusApiKey();
  if (!apiKey) {
    throw new Error("MANUS_API_KEY is not configured");
  }
  return {
    "Content-Type": "application/json",
    "x-manus-api-key": apiKey,
  };
}

function buildPromptMarkdown(episode: ContentEpisode, series: ContentSeries): string {
  return [
    `# Manus / Higgsfield job: ${episode.title}`,
    "",
    `Episode ID: ${episode.id}`,
    `Series: ${series.name} (${series.id})`,
    `Tone: ${series.tone}`,
    `Target length: ${series.lengthMinutes} minutes`,
    "",
    "## Goal",
    "Create a narrated video suitable for YouTube, TikTok, and Instagram Reels.",
    "Use Higgsfield (or equivalent) for visuals. Include a calm voiceover matching the script.",
    "",
    "## Voiceover notes",
    episode.voiceoverNotes ?? "Natural, clear narration.",
    "",
    "## Full script",
    episode.script ?? "(script missing)",
    "",
    "## Deliverables",
    "Produce the video and voiceover. Return structured output with videoUrl (preferred),",
    "optional voiceoverUrl/thumbnailUrl, durationSeconds, and notes.",
    "Do not post to social platforms. Draft assets only.",
    "",
    "If you cannot host a file, put any shareable link in videoUrl or shareUrl.",
  ].join("\n");
}

export interface ManusQueueOutcome {
  mode: "api" | "package";
  packagePath: string;
  manusJobId?: string;
  message: string;
}

/** Queue Manus work: live API if configured, otherwise write a package for manual/Manus run. */
export async function queueManusJob(
  episode: ContentEpisode,
  series: ContentSeries,
): Promise<ManusQueueOutcome> {
  const manifest: ManusPackageManifest = {
    episodeId: episode.id,
    seriesId: series.id,
    title: episode.title,
    lengthMinutes: series.lengthMinutes,
    tone: series.tone,
    createdAt: new Date().toISOString(),
    instructions:
      "Produce narrated video (Higgsfield visuals + voiceover). Return asset URLs. Do not publish.",
  };

  const prompt = buildPromptMarkdown(episode, series);
  const packagePath = await writeManusPackage(episode, manifest, prompt);

  if (isManusApiConfigured()) {
    const jobId = await submitManusApiJob(prompt);
    await updateEpisodeStatus(episode.id, "manus_queued", {
      manusJobId: jobId,
      manusPackagePath: packagePath,
    });
    return {
      mode: "api",
      packagePath,
      manusJobId: jobId,
      message: `Manus API task ${jobId} queued for "${episode.title}"`,
    };
  }

  await updateEpisodeStatus(episode.id, "manus_queued", {
    manusPackagePath: packagePath,
  });

  return {
    mode: "package",
    packagePath,
    message: `Manus package ready for "${episode.title}" — run it and drop result.json in ${packagePath}`,
  };
}

async function submitManusApiJob(prompt: string): Promise<string> {
  const baseUrl = getManusApiUrl();
  const response = await fetch(`${baseUrl}/v2/task.create`, {
    method: "POST",
    headers: manusHeaders(),
    body: JSON.stringify({
      message: { content: prompt },
      structured_output_schema: MANUS_RESULT_SCHEMA,
    }),
  });

  if (!response.ok) {
    throw new Error(`Manus API failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as {
    ok?: boolean;
    task_id?: string;
    taskId?: string;
    id?: string;
  };
  const id = body.task_id ?? body.taskId ?? body.id;
  if (!id) {
    throw new Error(`Manus API returned no task_id: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return id;
}

interface ManusListMessagesResponse {
  messages?: Array<Record<string, unknown>>;
  data?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  agent_status?: string;
  status?: string;
  structured_output_result?: Record<string, unknown>;
}

function coerceManusResult(raw: Record<string, unknown>): ManusResult {
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const str = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };

  return {
    videoUrl: str(raw.videoUrl) ?? str(raw.shareUrl),
    voiceoverUrl: str(raw.voiceoverUrl),
    thumbnailPath: str(raw.thumbnailUrl) ?? str(raw.thumbnailPath),
    durationSeconds: num(raw.durationSeconds),
    notes: str(raw.notes),
  };
}

function extractResultFromMessages(body: ManusListMessagesResponse): ManusResult | null {
  if (body.structured_output_result && typeof body.structured_output_result === "object") {
    return coerceManusResult(body.structured_output_result);
  }

  const items = body.messages ?? body.data ?? body.events ?? [];
  for (const item of items) {
    const structured =
      (item.structured_output_result as Record<string, unknown> | undefined) ??
      (item.structuredOutputResult as Record<string, unknown> | undefined);
    if (structured && typeof structured === "object") {
      return coerceManusResult(structured);
    }

    const status = String(item.agent_status ?? item.agentStatus ?? item.status ?? "").toLowerCase();
    if (status === "stopped" || status === "completed" || status === "succeeded") {
      const output =
        (item.output as Record<string, unknown> | undefined) ??
        (item.result as Record<string, unknown> | undefined);
      if (output) return coerceManusResult(output);
    }
  }

  const topStatus = String(body.agent_status ?? body.status ?? "").toLowerCase();
  if (topStatus === "error" || topStatus === "failed") {
    return { notes: "Manus task failed" };
  }

  return null;
}

export async function pollManusApiJob(jobId: string): Promise<ManusResult | null> {
  if (!isManusApiConfigured()) return null;

  const baseUrl = getManusApiUrl();
  const url = new URL(`${baseUrl}/v2/task.listMessages`);
  url.searchParams.set("task_id", jobId);
  url.searchParams.set("order", "desc");
  url.searchParams.set("limit", "20");

  const response = await fetch(url, { headers: manusHeaders() });
  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as ManusListMessagesResponse;
  return extractResultFromMessages(body);
}

/** Try package result.json first, then Manus API poll. Persist API results to package for Home Base. */
export async function tryIngestManusResult(episode: ContentEpisode): Promise<ManusResult | null> {
  const fromPackage = await readManusResult(episode.id);
  if (fromPackage) return fromPackage;

  if (episode.manusJobId) {
    const fromApi = await pollManusApiJob(episode.manusJobId);
    if (fromApi) {
      await writeManusResult(episode.id, fromApi);
      return fromApi;
    }
  }

  return null;
}

export function getManusPackagePath(episodeId: string): string {
  return getPackageDir(episodeId);
}

/** True when Manus returned a failure signal with no usable media assets. */
export function isManusFailureResult(result: ManusResult): boolean {
  const hasMedia = Boolean(
    result.videoUrl || result.videoPath || result.voiceoverUrl || result.voiceoverPath,
  );
  if (hasMedia) return false;
  const notes = (result.notes ?? "").toLowerCase();
  return notes.includes("failed") || notes.includes("error");
}
