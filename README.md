<!-- This modification was made by an autonomous AI agent -->
# SAG Agent

Self-hosted personal agent that monitors Gmail, sends Telegram alerts, and runs on a simple skill-based worker loop.

## What it does

- **Conservice bills** — watches Gmail for utility statements, parses charges, and texts a summary to Telegram
- **Focus companion** — hourly LLM check-ins (8 AM–9 PM), `/focus` command, check-in memory
- **Heartbeat** — optional daily health audit so you know the worker is alive
- **Telegram assistant** — talk to the bot in natural language; it uses tools to answer from your stored data
- **Commands** — `/ping`, `/status`, `/skills`, `/focus`, `/help`

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
| `npm run test:focus` | Preview focus companion messages |
| `npm run launchd:install` | Install Mac auto-start (launchd) |
| `npm run launchd:status` | Check launchd job + recent logs |
| `npm run launchd:uninstall` | Remove launchd auto-start |

## Project layout

```
config/skills/     Skill trigger config (YAML)
src/core/          Gmail, Telegram, worker, assistant
src/skills/        Skill implementations
data/              Runtime state (gitignored)
fixtures/          Sample emails for testing
```

## Deployment

### Mac (launchd — recommended)

Keep SAG running after login and restart it if it crashes:

```bash
npm run build          # once, after code changes
npm run launchd:install
```

Stop any manual `npm start` in a terminal first — only one worker should run at a time.

#### Day-to-day workflow

Once installed, launchd keeps the agent running in the background. You do not need `npm run dev` unless you are actively editing and want live reload.

```bash
# Normal: do nothing — launchd keeps it running
npm run launchd:status    # check health

# After code changes:
npm run build             # launchd runs dist/main.js, not src/
# launchd auto-restarts if the process crashes; for a clean pick-up of new code:
launchctl kickstart -k "gui/$(id -u)/com.masond84.sag-agent"

# While actively developing (pick ONE):
npm run launchd:uninstall   # stop background worker
npm run dev                 # foreground with hot reload
# when done coding:
npm run launchd:install     # back to background
```

```bash
npm run launchd:status     # job state + tail of logs
tail -f ~/Library/Logs/sag-agent/stdout.log

npm run launchd:uninstall  # stop and remove
```

How it is wired:

```
Login / boot
  └── launchd (~/Library/LaunchAgents/com.masond84.sag-agent.plist)
        └── scripts/launchd-run.sh
              └── node dist/main.js   (loads .env from project root)
```

Logs: `~/Library/Logs/sag-agent/stdout.log` and `stderr.log`

**Desktop folder:** macOS blocks background agents from `Desktop`, `Documents`, and `Downloads`. If `launchd:status` shows `Operation not permitted`, move the project and reinstall:

```bash
npm run launchd:relocate    # moves to ~/Projects/sag-agent
cd ~/Projects/sag-agent
npm run launchd:install
```

### Other targets

Runs on a Raspberry Pi or any machine with Node 20+. Docker files are included for optional container deployment.

GitHub Actions can run `npm run worker:once` on a schedule for cloud-based polling (secrets must be configured in the repo).

## License

Private / personal use.
