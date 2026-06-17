# SAG Agent

Self-hosted personal agent: Telegram chat, Gmail monitoring, scheduled check-ins, optional autonomous dev runner.

## Architecture

Three independent loops (same process):

| Loop | Driver | Handles |
|------|--------|---------|
| **Chat** | Grammy long-polling | Telegram commands + natural language |
| **Schedule** | Croner (`* * * * *` by default) | Focus, morning, heartbeat, dev-runner |
| **Email** | `POLL_INTERVAL_MS` (default 10 min) | Gmail skills (e.g. Conservice bills) |

Skills are configured in `config/skills/` and implemented under `src/skills/`.

## Orchestrator

Autonomous code changes follow one pipeline:

**Telegram → Linear → Cursor Cloud → auto-merge**

1. **Telegram** — You request a change in chat (`/dev run …` or natural language when `DEV_RUNNER_ENABLED=true`). SAG queues the task and sends an evolution brief when it finishes.
2. **Linear** — Work is tracked as issues in the SAG workspace (e.g. `SAG-6`). Each issue links to the repo, scope, and acceptance criteria.
3. **Cursor Cloud** — A cloud agent implements the change on a feature branch, runs `npm run build`, and opens a PR targeting `main`.
4. **Auto-merge** — When checks pass, draft Cursor PRs are marked ready, then the PR merges to `main` and the worker picks up the latest code on the next cycle.
5. **Post-merge audit** — When enabled (`DEV_POST_MERGE_AUDIT`, default on), SAG queues a follow-up Cursor Cloud review of `main` after each merge.

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
| `SCHEDULE_CRON` | Cron pattern for scheduled skills (default every minute) |
| `DRY_RUN` | `true` = log email notifications without sending |
| `DEV_RUNNER_ENABLED` | `true` = autonomous code/PR loop (requires `gh auth`) |
| `FOCUS_HOURLY` | `false` = anchor check-ins only (8, 13, 21) |

## Useful scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run worker with hot reload |
| `npm run worker:once` | Single schedule + email cycle |
| `npm run test:telegram` | Test Telegram send |
| `npm run test:focus` | Preview focus companion messages |
| `npm run test:dev` | Dev runner status |
| `npm run test:merge-result` | Merge result message smoke test (no `gh` required) |
| `npm run launchd:install` | Mac background auto-start |

## Deployment

Primary: **launchd** on Mac (`npm run launchd:install`). Optional: Docker (`docker-compose up`).

Never commit `.env` or `data/`.
