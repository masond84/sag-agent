# z-sync — shared state between Muse (Z) and SAG

This directory is the shared state both agents read and write. It is
**committed to git** on purpose: git is the sync bus.

## The loop

1. **Muse (Z)** updates these files (goals, bills, finance snapshots, job
   pipeline, BD leads) via commits / PRs into the SAG repo.
2. **SAG** pulls on its normal refresh cycle (`sag-refresh.sh`) and its
   `zsync` scheduled skill reads these files every run — bills due soon,
   the daily digest, the floor status.
3. **SAG** writes its own status back the same way (via its dev-runner
   commits): e.g. `paidThrough` on a bill, new BD leads, pipeline updates.

## Rules

- Every file carries `updatedAt` (ISO) and `updatedBy` (`"z"` or `"sag"`).
  Set both on every write.
- Amounts are numbers in USD. Use `null` when unknown — never invent one.
  Put the uncertainty in a `note` field.
- `verified: false` means the value came from memory/heuristics and has not
  been confirmed against a primary source. Treat accordingly.
- **Never put secrets in here.** No keys, tokens, account numbers, or
  credentials. Balances and bill amounts are fine; identifiers are not.
- Keep it small. This is a dashboard, not a database. Raw transaction
  history stays in each agent's own store.

## Files

| File | What lives here |
|---|---|
| `goals.json` | Durable goals both agents work toward |
| `bills.json` | Recurring bills: amount, due day, paid status, subscriptions |
| `finance.json` | Latest balance snapshot + the $20k floor math |
| `job-pipeline.json` | Job search targets, outreach status, standing rules |
| `deft-bd.json` | Deft Point business-development leads and rules |
