# SAG House

Next.js web UI for SAG — skill constellation map, live activity feed, and Tier 1 presence shell (animated face + TTS).

## Local development

1. Enable the worker house server in the repo root `.env`:

```bash
HOUSE_SERVER_ENABLED=true
HOUSE_SERVER_PORT=9473
```

2. Start the worker (terminal 1):

```bash
npm run dev
```

3. Install and start the house app (terminal 2):

```bash
cd house
cp .env.example .env.local   # optional — set OPENAI_API_KEY for TTS
npm install
npm run dev
```

Open http://localhost:3000

## Architecture

- **Worker** (`src/core/house/`) — optional localhost HTTP server (SSE + REST). Disabled by default.
- **House** (`house/`) — Next.js frontend. Proxies worker API via `/api/worker/*`.
- **Face (Tier 1)** — presence orb + OpenAI TTS (falls back to Web Speech API).
- **Face (Tier 3)** — photoreal via LiveKit + Simli; on-demand **Face-to-face** in the UI. See `livekit-agent/README.md`.

## Deploy (Vercel)

Set project root to `house/`. Set `SAG_WORKER_URL` to a reachable worker endpoint if exposing live SSE remotely (otherwise skill tree works from static fallbacks in a later phase).

## API (worker, when enabled)

| Route | Description |
|-------|-------------|
| `GET /events` | SSE stream — speech, activity, status |
| `GET /health` | Worker health + loaded skills |
| `GET /skill-tree` | Constellation branches from enabled skills |
| `GET /activity` | Recent activity log |
| `POST /speech` | Push test speech to face |
| `POST /assistant/reply` | Full SAG reply for face agent bridge (`{ text, chatId? }`) |
| `GET /face-session/config` | Photoreal session availability |
| `POST /face-session` | Start face-to-face LiveKit session |
| `DELETE /face-session/:id` | End session and delete room |
| `GET /dev/status` | Dev runner queue and last merge |
| `GET /skill-goals` | Planned skill-tree build backlog |
| `POST /skill-goals/:nodeId/request` | Queue a planned perk for dev runner |

## Skill goals

Planned tree nodes (grey perks) are listed in `config/skill-goals.yaml`. In House, click a planned node and use **Request build** to queue a dev-runner task with acceptance criteria.
