import { isLlmConfigured, runAssistantTurn } from "../llm.js";
import type { ClipCaptions, ContentSeries } from "./types.js";

export interface GeneratedEpisodeContent {
  title: string;
  script: string;
  voiceoverNotes: string;
  captions: ClipCaptions;
}

function fallbackContent(series: ContentSeries): GeneratedEpisodeContent {
  const title = `${series.name}: Quiet Night ${new Date().toISOString().slice(0, 10)}`;
  const script = [
    `Welcome to ${series.name}.`,
    "",
    `Tonight we settle into a ${series.tone} story.`,
    "Breathe slowly. Let the day fall away.",
    "",
    "Once, in a place just beyond the edge of ordinary life,",
    "a traveler found a path lit only by soft light.",
    "Each step was quieter than the last.",
    "The wind carried no urgency — only patience.",
    "",
    "And so the traveler walked on, until sleep arrived like a friend.",
    "",
    "Good night.",
  ].join("\n");

  return {
    title,
    script,
    voiceoverNotes: `Speak slowly, ${series.tone}. Pause between paragraphs.`,
    captions: {
      youtube: `${title}\n\nA ${series.lengthMinutes}-minute ${series.name.toLowerCase()} narration. Sit back, relax, and listen.\n\n#${series.id.replace(/-/g, "")} #storytime #relax`,
      tiktok: `${title} 🌙 Full story in bio vibes — soft narration for wind-down.`,
      reels: `${title} — calm storytime energy.`,
      hashtags: [series.id.replace(/-/g, ""), "storytime", "relax", "asmr", "narration"],
    },
  };
}

function extractJson(text: string): GeneratedEpisodeContent | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    const parsed = JSON.parse(candidate) as Partial<GeneratedEpisodeContent>;
    if (!parsed.title || !parsed.script) return null;
    return {
      title: String(parsed.title).slice(0, 120),
      script: String(parsed.script),
      voiceoverNotes: String(parsed.voiceoverNotes ?? "Natural, clear narration."),
      captions: {
        youtube: String(parsed.captions?.youtube ?? parsed.title),
        tiktok: String(parsed.captions?.tiktok ?? parsed.title),
        reels: String(parsed.captions?.reels ?? parsed.title),
        hashtags: Array.isArray(parsed.captions?.hashtags)
          ? parsed.captions!.hashtags.map(String).slice(0, 12)
          : [],
      },
    };
  } catch {
    return null;
  }
}

export async function generateEpisodeContent(series: ContentSeries): Promise<GeneratedEpisodeContent> {
  if (!isLlmConfigured()) {
    return fallbackContent(series);
  }

  const system = [
    "You write narration scripts for short-form and long-form social video.",
    "Return ONLY valid JSON with keys: title, script, voiceoverNotes, captions.",
    "captions must be an object with youtube, tiktok, reels (strings) and hashtags (string array).",
    "Script should be spoken aloud for the target length — natural paragraphs, no stage directions in the script body.",
    "voiceoverNotes are brief delivery notes for TTS or a voice actor.",
  ].join(" ");

  const user = [
    `Series: ${series.name} (${series.id})`,
    `Tone: ${series.tone}`,
    `Target length: ${series.lengthMinutes} minutes of spoken narration.`,
    `Platforms: ${series.platforms.join(", ")}`,
    "",
    "Write one original episode. Avoid copyrighted characters or real-person impersonation.",
  ].join("\n");

  try {
    const { message } = await runAssistantTurn(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      [],
      { toolChoice: "none", maxTokens: 2500, temperature: 0.9 },
    );
    const content = message.content?.trim();
    if (!content) return fallbackContent(series);
    return extractJson(content) ?? fallbackContent(series);
  } catch {
    return fallbackContent(series);
  }
}
