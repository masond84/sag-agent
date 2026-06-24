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

## Simli persistence

```bash
SIMLI_MAX_IDLE_TIME=300        # seconds idle before avatar drops (default 300)
SIMLI_MAX_SESSION_LENGTH=1800  # max session length in seconds (default 1800)
```
