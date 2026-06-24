# SAG LiveKit Face Agent

Photoreal Tier 3 talking head for House face-to-face sessions (STT → LLM → TTS → Simli).

## Setup

```bash
cd livekit-agent
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill keys
```

Also set `LIVEKIT_*` in the repo root `.env` (worker mints room tokens).

## Run

```bash
source .venv/bin/activate
python agent.py dev
```

Keep this running while using **Face-to-face** in House.

When House is in face-to-face mode, worker speech events (Telegram, focus pings) are forwarded over LiveKit RPC (`sag.speak`) so the Simli avatar lip-syncs the text.

## Full assistant bridge

In-room voice uses the same SAG brain as Telegram when the worker house server is running:

1. Root `.env`: `HOUSE_SERVER_ENABLED=true`, `TELEGRAM_CHAT_ID=...`
2. `livekit-agent/.env`: `SAG_WORKER_URL=http://127.0.0.1:9473`, same `TELEGRAM_CHAT_ID`
3. Run worker (`npm run dev`) and face agent (`npm run face:agent`)

Voice in the room hits `POST /assistant/reply` on the worker (`buildTelegramReply` — tools, slash commands, Mem0). Telegram messages still arrive via `sag.speak` RPC. Set `SAG_BRIDGE_ENABLED=false` to fall back to the lightweight local LLM only.

## Simli persistence

```bash
SIMLI_MAX_IDLE_TIME=300        # seconds idle before avatar drops (default 300)
SIMLI_MAX_SESSION_LENGTH=1800  # max session length in seconds (default 1800)
```
