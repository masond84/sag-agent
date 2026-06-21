# AGENTS.md

## Cursor Cloud specific instructions

SAG Agent is a single long-lived Node.js/TypeScript process (not a monorepo, no microservices). It runs three loops in one process: Telegram chat (long-polling), a cron schedule, and a Gmail poll. By default there are **no inbound ports** — optional `HOUSE_SERVER_ENABLED=true` starts a localhost-only HTTP server for the SAG House web UI (`house/`). All state is local files under `data/`, and external calls are outbound HTTPS unless the house server is enabled.

Standard commands live in `package.json` and `README.md`; prefer those. Key ones:
- Build / type-check: `npm run build` (`tsc`). House UI: `npm run house:build` (requires `npm run house:install` first).
- There is **no automated test framework**. The `test:*` npm scripts are manual smoke/preview scripts, not assertions.
- `npm run test:conservice` exercises the flagship bill-parsing skill against `fixtures/conservice-sample.eml` and needs **no secrets** — best zero-config smoke test.
- `npm run worker:once` runs one schedule + email cycle and exits (good non-interactive smoke test). `npm run dev` runs continuously with hot reload (`tsx watch`); it does not exit on its own.

Non-obvious gotchas:
- The worker degrades gracefully without secrets: missing `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, `OPENAI_API_KEY`, or Gmail OAuth just logs a warning and that feature no-ops. So `npm run dev` / `worker:once` succeed even with no `.env`.
- `.env` is gitignored and absent by default. Copy `cp .env.example .env` to get the scheduled-skill defaults (morning/focus/heartbeat are enabled there); without `.env` those schedule branches stay off, so the heartbeat report line won't appear.
- `DRY_RUN=true` (the `.env.example` default) makes notifications log instead of send — keep it on when testing without real Telegram credentials.
- The dev runner (`DEV_RUNNER_ENABLED=true`) and Gmail/Telegram flows need external credentials/CLIs (`gh`, OAuth tokens); they are optional and off by default.
