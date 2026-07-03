# Content Engine

SAG's content factory produces **draft** narrated video packages for YouTube, TikTok, and Reels. It does **not** auto-post. You copy captions/assets from Home Base and publish yourself, then mark episodes posted.

This runs alongside the paid API income stream (PDF/image services + Stripe billing).

## Pipeline

```
planned → scripted → manus_queued → rendering → draft_ready → posted (manual)
```

Failures land in `failed` with an `error` field.

1. **Plan** — pick a series for today (sleep / scary / storytime cadence).
2. **Script** — LLM writes narration + platform captions (fallback template if no API key).
3. **Manus** — queue video assembly:
   - **Package mode (default):** write `data/content/manus-packages/{episodeId}/` for you or Manus to run.
   - **API mode:** if `MANUS_ENABLED=true` and `MANUS_API_URL` + `MANUS_API_KEY` are set, POST to Manus and poll.
4. **Ingest** — when `result.json` appears (or API completes), episode becomes `draft_ready`.
5. **You post** — copy captions from Home Base → Content, upload video, click **Mark posted**.

If `MANUS_ENABLED=false`, scripted episodes go straight to `draft_ready` (script + captions only).

## Data layout

```
data/content/
├── series.json
├── episodes/{id}.json
├── manus-packages/{episodeId}/
│   ├── manifest.json
│   ├── prompt.md
│   ├── script.txt
│   └── result.json          # you or Manus write this
└── assets/{episodeId}/     # optional large media (gitignored via data/)
```

### `result.json` schema

```json
{
  "videoPath": "optional local path",
  "videoUrl": "optional https url",
  "voiceoverPath": "optional",
  "voiceoverUrl": "optional",
  "thumbnailPath": "optional",
  "durationSeconds": 420,
  "notes": "any notes",
  "completedAt": "2026-07-03T12:00:00.000Z"
}
```

## Environment

```bash
CONTENT_ENGINE_ENABLED=true
CONTENT_EPISODES_PER_DAY=1
CONTENT_MAX_IN_FLIGHT=1
# CONTENT_SERIES=sleep-stories,scary-tales,storytime

# Manus worker (optional live API — https://open.manus.ai)
MANUS_ENABLED=true
MANUS_API_KEY=          # from Manus → Settings → Integrations → Create API Key
# MANUS_API_URL=https://api.manus.ai
```

### Enable automated Manus (recommended when you have a key)

1. In Manus: **Settings → Integrations → Create API Key** (copy once).
2. Add to `.env`:
   ```bash
   MANUS_ENABLED=true
   MANUS_API_KEY=your_key_here
   ```
3. Restart `npm run dev`.
4. SAG calls `POST https://api.manus.ai/v2/task.create` with the episode prompt + structured output schema, then polls `task.listMessages` until assets are ready.
5. You still **post to social yourself** — automation is production only, not publishing.

Package mode (no key): SAG writes `data/content/manus-packages/{id}/` and Telegram asks you to run Manus manually.

## Home Base

- **Content** panel — drafts ready, in-flight, expand for copyable captions/script, mark posted.
- **API business** panel — shows dual stream summary: `API $X · Content N drafts / M posted`.

## Worker API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/content/stats` | Counts by status |
| GET | `/api/content/episodes` | List (`?status=&limit=`) |
| GET | `/api/content/episodes/:id` | Detail |
| POST | `/api/content/episodes/:id/posted` | `{ "platforms": ["youtube","tiktok"] }` |
| POST | `/api/content/episodes/:id/ingest` | Body = `result.json` fields |

## Manual Manus workflow

1. Wait for Telegram: `Manus package ready for "…"`.
2. Open `data/content/manus-packages/{episodeId}/prompt.md` in Manus (Higgsfield video + voiceover).
3. Write `result.json` in that folder (or POST `/api/content/episodes/:id/ingest`).
4. Next content-engine tick (or ingest API) marks `draft_ready` and notifies Telegram.
5. Publish yourself; mark posted in Home Base.

## Smoke test

```bash
npm run test:content
```

## API stream (parallel)

Paid APIs remain at `/api/services/*` with billing at `/api/billing/buy`. Public customers need a tunnel or deploy (`HOUSE_SERVER_HOST` / reverse proxy). See `docs/INCOME_SERVICES.md`.
