import { ensureSeriesDefaults, pickSeriesForToday } from "../core/content/series.js";
import { generateEpisodeContent } from "../core/content/script.js";
import { queueManusJob } from "../core/content/manus.js";
import {
  createEpisode,
  getContentStats,
  getEpisode,
  markEpisodePosted,
  updateEpisodeStatus,
  writeManusResult,
} from "../core/content/store.js";
import { advanceInFlightEpisodes } from "../core/content/pipeline.js";

async function main() {
  console.log("\n=== SAG CONTENT ENGINE SMOKE ===\n");

  process.env.CONTENT_ENGINE_ENABLED = "true";
  process.env.MANUS_ENABLED = "true";
  delete process.env.MANUS_API_URL;
  delete process.env.MANUS_API_KEY;

  const seriesList = await ensureSeriesDefaults();
  console.log(`Series: ${seriesList.map((s) => s.id).join(", ")}`);

  const series = (await pickSeriesForToday()) ?? seriesList[0];
  if (!series) {
    console.error("FAIL: no series");
    process.exitCode = 1;
    return;
  }

  console.log(`\nCreating episode for ${series.id}…`);
  let episode = await createEpisode(series.id, `${series.name} smoke`);
  const generated = await generateEpisodeContent(series);
  episode = (await updateEpisodeStatus(episode.id, "scripted", {
    title: generated.title,
    script: generated.script,
    voiceoverNotes: generated.voiceoverNotes,
    captions: generated.captions,
  }))!;
  console.log(`  scripted: ${episode.title}`);

  const outcome = await queueManusJob(episode, series);
  console.log(`  ${outcome.mode}: ${outcome.message}`);
  episode = (await getEpisode(episode.id))!;
  if (episode.status !== "manus_queued") {
    console.error(`FAIL: expected manus_queued, got ${episode.status}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nWriting result.json…");
  await writeManusResult(episode.id, {
    videoUrl: "https://example.com/draft.mp4",
    durationSeconds: 420,
    notes: "smoke test asset",
  });

  const events = await advanceInFlightEpisodes();
  for (const event of events) {
    console.log(`  [${event.type}] ${event.summary}`);
  }

  const ready = await getEpisode(episode.id);
  if (ready?.status !== "draft_ready") {
    console.error(`FAIL: expected draft_ready, got ${ready?.status}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  assets: ${JSON.stringify(ready.assets)}`);

  const posted = await markEpisodePosted(ready.id, ["youtube", "tiktok"]);
  if (posted?.status !== "posted") {
    console.error("FAIL: mark posted");
    process.exitCode = 1;
    return;
  }

  const stats = await getContentStats();
  console.log("\nStats:", JSON.stringify(stats, null, 2));
  console.log("\nOK — content pipeline reached draft_ready and posted.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
