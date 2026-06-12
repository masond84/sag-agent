# SAG Agent

Self-hosted personal agent that monitors Gmail, sends Telegram alerts, and runs on a simple skill-based worker loop.

## What it does

- **Conservice bills** — watches Gmail for utility statements, parses charges, and texts a summary to Telegram
- **Morning briefing** — sends a daily good morning message at 7:30 AM (configurable)
- **Heartbeat** — optional daily health audit so you know the worker is alive
- **Telegram assistant** — talk to the bot in natural language; it uses tools to answer from your stored data
- **Commands** — `/ping`, `/status`, `/skills`, `/help`

## Architecture

```
Worker loop (polls on an interval)
├── Email skills      → react to Gmail (Conservice)
├── Scheduled skills  → morning briefing, heartbeat
└── Interactive skills → Telegram commands + assistant
```

Skills are configured in `config/skills/` and implemented under `src/skills/`.

## Requirements

- Node.js 20+
- Gmail account with Google Cloud OAuth credentials
- Telegram bot ([BotFather](https://t.me/BotFather))
- Optional: OpenAI API key for natural-language assistant replies

## Quick start

```bash
git clone https://github.com/masond84/sag-agent.git
cd sag-agent
npm install
cp .env.example .env
```

Fill in `.env` (see `.env.example`), then:

```bash
# One-time Gmail OAuth (after CLIENT_ID and CLIENT_SECRET are set)
npm run auth:gmail

npm run build
npm run worker:once   # dry-run test cycle
DRY_RUN=false npm start
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | Gmail API access |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Telegram notifications |
| `OPENAI_API_KEY` | Optional — enables assistant chat |
| `POLL_INTERVAL_MS` | Worker poll interval (default: 10 min) |
| `DRY_RUN` | `true` = log only, no Telegram sends (except morning briefing) |
| `MORNING_BRIEFING_TIME` | Daily message time (default: `07:30`) |
| `MORNING_BRIEFING_TIMEZONE` | Timezone (default: `America/New_York`) |

Never commit `.env` or `data/` — they contain secrets and runtime state.

## Useful scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run worker continuously |
| `npm run worker:once` | Single poll cycle |
| `npm run auth:gmail` | Gmail OAuth helper |
| `npm run telegram:chat-id` | Find your Telegram chat ID |
| `npm run test:conservice` | Test bill parser against fixture |
| `npm run test:telegram` | Test Telegram send |
| `npm run test:morning` | Preview morning message (`--send` to deliver) |

## Project layout

```
config/skills/     Skill trigger config (YAML)
src/core/          Gmail, Telegram, worker, assistant
src/skills/        Skill implementations
data/              Runtime state (gitignored)
fixtures/          Sample emails for testing
```

## Deployment

Runs on a Mac, Raspberry Pi, or any machine with Node 20+. Docker files are included for optional container deployment.

GitHub Actions can run `npm run worker:once` on a schedule for cloud-based polling (secrets must be configured in the repo).

## License

Private / personal use.
