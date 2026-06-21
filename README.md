# SAG Agent

Self-hosted personal agent: Telegram chat, Gmail monitoring, scheduled check-ins, optional autonomous dev runner.

## Architecture

Three independent loops (same process):

| Loop | Driver | Handles |
|------|--------|---------|
| **Chat** | Grammy long-polling | Telegram commands + natural language |
| **Schedule** | Croner (`* * * * *` by default) | Focus, life companion, reflection, morning, heartbeat, dev-runner |
| **Email** | `POLL_INTERVAL_MS` (default 10 min) | Gmail skills (e.g. Conservice bills) |

Skills are configured in `config/skills/` and implemented under `src/skills/`. Each YAML file has an `enabled` flag that must be true for the skill to load; some skills also honor runtime env toggles (e.g. `MORNING_BRIEFING_ENABLED`).

## Companion memory

SAG keeps two Mem0 scopes: **user** memories (you) and **agent** memories (SAG's diary and co-created personality).

- `data/sag-activity.jsonl` — ground-truth timeline of polls, check-ins, chat, dev cycles
- Reflection skill (1pm + 9pm default) distills activity into agent Mem0
- Focus anchors (work) + random life texts (personal, up to 5/day) via unified companion
- Chat recall tools pull activity + agent memories + conversation highlights for "what do you remember?" questions
- Short affirmations ("sounds good", "do it") after a code-change proposal queue dev tasks with thread context

Telegram: `/memories` (you), `/sag-memories` (SAG), `/remember <fact>` to save user facts.

## Telegram chat surface

SAG registers a Telegram command menu on startup. Use `/start` for onboarding, `/help`
for examples, and `/today` for a deterministic digest of focus, recent activity,
latest bill, loaded skills, and runtime mode. With the assistant LLM configured,
natural language can also set focus or save durable memories, for example:

```text
Set my focus to ship the dashboard PR
Remember that I prefer concise morning updates
```

## Orchestrator

Autonomous code changes follow one pipeline:

**Telegram → Linear → Cursor Cloud → auto-merge**

1. **Telegram** — You request a change in chat (`/dev run …` or natural language when `DEV_RUNNER_ENABLED=true`). SAG queues the task and sends an evolution brief when it finishes.
2. **Linear** — Work is tracked as issues in the SAG workspace (e.g. `SAG-6`). After a successful merge, SAG marks the issue Done and links the PR.
3. **Cursor Cloud** — A cloud agent implements the change on a feature branch, runs `npm run build`, and opens a PR targeting `main`.
4. **Auto-merge** — When checks pass, draft Cursor PRs are marked ready, then the PR merges to `main` and the worker picks up the latest code on the next cycle.

## Quick start

```bash
npm install
cp .env.example .env   # fill TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, OPENAI_API_KEY
npm run build
npm run worker:once    # one schedule + email cycle (no Telegram long-poll)
npm run dev            # continuous: Telegram + cron + email
```

Find your Telegram chat ID: `npm run telegram:chat-id`

## Key environment variables

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Telegram bot + authorized chat |
| `OPENAI_API_KEY` | Assistant + companion LLM replies |
| `POLL_INTERVAL_MS` | Gmail poll interval (not chat) |
| `PROCESSED_MESSAGE_ID_LIMIT` | Max Gmail message IDs kept in `data/processed-messages.json` (default 1000) |
| `SCHEDULE_CRON` | Cron pattern for scheduled skills (default every minute) |
| `DRY_RUN` | `true` = suppress Telegram for email bills and routine scheduled reports (e.g. heartbeat); companion briefings (morning, focus, life) bypass dry-run and still send |
| `DEV_RUNNER_ENABLED` | `true` = autonomous code/PR loop (requires `gh auth`) |
| `FOCUS_HOURLY` | `false` = anchor check-ins only (8, 13, 21) |
| `LIFE_COMPANION_ENABLED` | Random personal texts (default 5/day, 8am–10pm) |
| `REFLECTION_ENABLED` | Agent diary writes from activity log |
| `MCP_ENABLED` | `true` = spawn MCP servers from `config/mcp-servers.yaml` as assistant tools |
| `MEM0_ENABLED` | Local or platform Mem0 for user + agent memory |

## Useful scripts

| Command | Description |
|---------|-------------|
| `npm run test:conservice` | Parse Conservice bill fixture (no secrets required) |
| `npm run auth:gmail` | One-time OAuth for worker Gmail polling (Conservice bills); paste `GMAIL_REFRESH_TOKEN` into `.env` |
| `npm run dev` | Run worker with hot reload |
| `npm run worker:once` | Single schedule + email cycle |
| `npm run test:telegram` | Test Telegram send |
| `npm run test:focus` | Preview focus companion messages |
| `npm run test:life` | Preview life companion slots and sample message |
| `npm run test:activity` | Smoke-test activity log |
| `npm run test:state` | Smoke-test processed-message state retention cap |
| `npm run test:reflection` | List agent Mem0; optional `--seed=` |
| `npm run test:memory` | User Mem0 smoke test |
| `npm run test:telegram-ux` | Smoke-test Telegram onboarding/help/digest wiring |
| `npm run test:dev` | Dev runner status |
| `npm run launchd:install` | Mac background auto-start |
| `npm run sag:refresh` | Pull main, rebuild worker + House, restart both |
| `npm run house:restart` | Rebuild and restart House UI on :3000 |
| `npm run house:dev` | SAG House web UI (requires worker house server) |
| `npm run test:mcp` | List MCP connectors; optional `--query="after:2026/06/24"` Gmail search |
| `npm run mcp:gmail-auth` | One-time Gmail MCP OAuth (uses `data/gmail-mcp/`) |
| `npm run house:build` | Production build for house/ |

## Deployment

Primary: **launchd** on Mac (`npm run launchd:install`). Optional: Docker (`docker-compose up`).

Never commit `.env` or `data/`.

## SAG House (web UI)

Optional Next.js app in `house/` — skill constellation map, live activity feed, and Tier 1 presence shell (animated face + TTS).

```bash
# In .env
HOUSE_SERVER_ENABLED=true

# Terminal 1 — worker
npm run dev

# Terminal 2 — house UI
npm run house:install
npm run house:dev
```

Open http://localhost:3000. See `house/README.md` for API routes and Vercel deploy notes.

## MCP connectors

SAG can attach external **Model Context Protocol** servers as assistant tools (stdio child processes). Connectors are declared in `config/mcp-servers.yaml` — no TypeScript changes needed to add another server.

**Gmail (first connector):** `@gongrzhe/server-gmail-autoauth-mcp` exposes search/read/label tools to Telegram and House voice. Conservice bill polling uses a separate OAuth flow (`npm run auth:gmail` + `GMAIL_*` in `.env`); MCP auth does not configure the worker poll.

Setup:

```bash
# 1. Enable Gmail API in Google Cloud; download OAuth client JSON
mkdir -p data/gmail-mcp
cp ~/Downloads/client_secret_*.json data/gmail-mcp/gcp-oauth.keys.json

# 2. One-time MCP auth (browser sign-in — uses port 3000; stop House UI if running)
npm run mcp:gmail-auth

# 3. Smoke test
npm run test:mcp
npm run test:mcp -- --query="after:2026/06/24"

# 4. Run worker — ask in Telegram: "any emails from today?"
MCP_ENABLED=true npm run dev
```

Add more free connectors by editing `config/mcp-servers.yaml` (GitHub, Drive, etc.) and restarting the worker. Tool names are prefixed (`gmail__search_emails`) to avoid collisions with native tools.
