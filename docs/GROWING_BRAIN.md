# Growing Brain System

Implementation of SAG's growing-brain iteration: goals + loops + scoreboard + ledger + bots registry.

## Overview

The growing-brain system transforms SAG from a task executor into a goal-oriented learning system with:
- **Goals**: Typed, file-per-goal persistence with measurements and next actions
- **Loops**: Execution framework for goal-specific monitoring and actions
- **Scoreboard**: Delta-based digest showing changes since last run
- **Ledger**: Monthly AI cost tracking per bot/lane with earning/saving/capped classification
- **Bots Registry**: Capability-based bot inventory with explicit authority limits

## Architecture

### Goals (`src/core/goals/`)
Each goal is a separate JSON file in `z-sync/goals/` with:
- **Target**: Number, date, or milestone with explicit description
- **Measurement**: Current value, timestamp, source, staleness flags
- **Next Action**: Single concrete step with owner (sag|devin|z)
- **Loop ID**: Exactly one loop per goal (or null)

Schema validation ensures:
- Required fields are present and typed correctly
- No fabricated measurements (null + missing flag when unknown)
- Stale/fresh data tracked with source provenance

### Loops (`src/core/loops/`)
Each loop:
1. Reads goal state + relevant fresh data
2. Compares target vs current
3. Performs reversible prep only (no external actions)
4. Surfaces ONE owned next action
5. Updates goal measurement
6. Persists execution history

Idempotent, safe dry-run mode, atomic persistence.

#### Implemented Loops
- **job-pipeline**: Monitors job search progress, surfaces urgent deadlines

#### Pending Loops
Other 5 goals explicitly pending/unconfigured pending data collection mechanisms.

### Scoreboard (`src/core/scoreboard/`)
Delta-based daily digest (08:00 ET default):
- Goal changes since last successful digest
- Missing/stale measurements flagged
- Single next action per goal (no duplicates)
- Bill alerts preserved from existing zsync
- First-run baseline handled honestly

No activity summaries. No completion claims without evidence.

### Ledger (`src/core/ledger/`)
Monthly tracking in `data/ledger/YYYY-MM.json`:
- **Subscriptions**: All AI-related services (ChatGPT, Cursor, OpenAI API, etc.)
- **Lane Costs**: Per bot/lane with earning|saving|capped classification
- **Returns**: Cash revenue, time saved (hours only, no invented hourly rate), cost avoided

Clearly separates:
- Known vs unknown costs (null when unknown, not $0)
- Actual spend vs budget allocation
- Incomplete coverage explicitly listed

No auto-cancellation. Human review flagged for uncategorized lanes.

### Bots Registry (`z-sync/bots.json`)
Metadata-only registry (does NOT confer authority):
- Name, platform, purpose, lane
- Capabilities (read/draft/send/spend/delete) - all false by default
- Forbidden actions explicitly listed
- Monthly cost (null when unknown)
- Auth method: pointer-only (no actual secrets)
- Reports to: sag|devin|z

First entry: **Emi** (this Grok coordinator bot) - id `emi-grok-coordinator`

## Six Initial Goals

1. **job-140k**: $140k+ AI/startup engineering job
   - Target: Signed offer, remote-first
   - Current: 10 live $140k+ roles, Fieldguide deadline 2026-11-30
   - Loop: job-pipeline (active)
   
2. **savings-floor-20k**: Protected savings floor of $20k
   - Target: $20k in protected accounts
   - Current: $3,213.02 (stale snapshot 2026-09-26)
   - Loop: floor-watcher (pending)

3. **bills-on-time**: All bills paid on time
   - Target: Rent (1st), Sallie Mae ~$188 (3rd), TECO ~$100-130 (21st), USAA auto $100+ min
   - Current: 4 bills unpaid (stale)
   - Loop: null (bill alerts via existing zsync)

4. **tampa-ai-builders**: Tampa 20s AI Builders growth
   - Target: 30 members, 10 contributors, 5 returning
   - Current: null (no data collection mechanism yet)
   - Loop: null (pending)

5. **trailblaize-gate**: Trailblaize decision gate
   - Target: No signing without written $80k+ base + cliff protection
   - Current: Gate not triggered
   - Loop: null (passive monitor)

6. **nicotine-quit**: Quit nicotine via patches
   - Target: Successfully quit vaping; trigger: current vape dies
   - Current: null (pending trigger)
   - Loop: null (pending)

## Testing

```bash
npm run test:growing-brain
```

Comprehensive tests cover:
- Schema validation
- Goal seeding (idempotent)
- Job pipeline loop (dry-run)
- Ledger initialization
- Bots registry
- Delta digest generation
- Timezone handling

## Dry-Run Demo

```bash
npm run dry-run:demo
```

End-to-end demonstration showing:
- Goal seeding from existing z-sync state
- Loop registration and execution
- Ledger initialization with known subscriptions
- Bots registry loading
- Delta digest generation

No external calls. All state is local.

## Integration Points

### Existing SAG Components
- **zsync skill**: Bill alerts preserved, digest replaced with delta version
- **schedule.ts**: Timezone-aware time handling reused
- **income/self-funding.ts**: Weekly budget ($25 default) converted to monthly ledger entry
- **zsync/store.ts**: Bill occurrence math reused

### Not Modified
- Telegram handlers
- Gmail polling
- Content engine
- Income services
- Dev runner

## Activation Steps (Manual)

1. **Data Collection Setup**
   - Tampa AI Builders metrics tracking
   - Finance snapshot refresh automation
   - Nicotine quit trigger monitoring

2. **Loop Activation**
   - floor-watcher loop implementation
   - Integration with existing schedule.ts cron

3. **Digest Migration**
   - Replace existing zsync digest with delta scoreboard
   - Wire to 08:00 ET schedule (DST-aware)

4. **Ledger Completion**
   - Actual OpenAI API usage tracking
   - Cursor Cloud agent cost tracking
   - Monthly review workflow

5. **Opportunity Filter**
   - Five-gate validation for new money ideas
   - Named Devin input requirement
   - Test budget enforcement

## Files Added

### Core Infrastructure
- `src/core/goals/schema.ts` - Goal type definitions and validation
- `src/core/goals/store.ts` - File-based goal persistence
- `src/core/goals/migration.ts` - Backward-compatible migration
- `src/core/goals/seed.ts` - Initial six goals with real data

### Loops
- `src/core/loops/types.ts` - Loop types and interfaces
- `src/core/loops/registry.ts` - Loop registration and lookup
- `src/core/loops/executor.ts` - Loop execution with dry-run support
- `src/core/loops/job-pipeline.ts` - Job search monitoring loop

### Ledger
- `src/core/ledger/schema.ts` - Subscription and lane cost types
- `src/core/ledger/store.ts` - Monthly ledger persistence
- `src/core/ledger/seed.ts` - Initial ledger from known subscriptions

### Bots
- `src/core/bots/schema.ts` - Bot registry types and validation
- `src/core/bots/store.ts` - Bots registry persistence

### Scoreboard
- `src/core/scoreboard/digest.ts` - Delta-based digest generation

### Tests & Scripts
- `src/scripts/test-growing-brain.ts` - Comprehensive test suite
- `src/scripts/dry-run-demo.ts` - End-to-end demonstration

### Data Files
- `z-sync/bots.json` - Emi bot registry entry
- `z-sync/goals/*.json` - Six initial goal files (created on first run)
- `data/loops/*.json` - Loop execution history (created on first run)
- `data/ledger/YYYY-MM.json` - Monthly ledger (created on first run)
- `data/scoreboard-state.json` - Digest baseline (created on first run)

## Design Decisions

### Why File-Per-Goal?
- Atomic updates without merge conflicts
- Easier git history tracking per goal
- Parallel loop updates possible
- Backward compatible (migration provided)

### Why Delta Digest?
- No duplicate alerts
- Honest about staleness
- Clear human action items
- First-run baseline explicit

### Why Ledger Incomplete Coverage?
- Unknown costs stay unknown (not $0)
- Budget vs actual separated
- Human review required for uncategorized
- No auto-cancellation of subscriptions

### Why Pointer-Only Auth?
- Registry metadata ≠ authority
- No secrets in z-sync
- Explicit capability gates
- Progression: read-only → draft → scheduled

## Constraints Honored

- No merge, deployment, purchase
- No external outreach or live applications
- No new credentials or bot connections
- No new live scheduled sends during development
- Tests use fixtures/mocks only (no live sends)
- Preserves existing behavior unless necessary
- Explicitly authorized for SAG only (not Deft Point)
