# Income API Services Implementation

This document details SAG's autonomous API service business system.

## Overview

SAG's primary job is to build and operate API service businesses that generate $200/week minimum revenue. This runs continuously alongside all other capabilities (companion, dev runner, etc).

## Core Components

### 1. Service Configuration (`src/core/income/service-config.ts`)

Manages service definitions and pricing:

```typescript
{
  id: "pdf-merge",
  name: "PDF Merge",
  pricing: {
    model: "per_unit",
    unit: "page",
    pricePerUnit: 0.10
  },
  backend: {
    type: "local",
    costPerUnit: 0.001
  }
}
```

Services stored in `data/income-services/services.json`.

### 2. Revenue Tracking (`src/core/income/revenue-tracking.ts`)

Logs every API call and calculates metrics:

- `logServiceUsage()` - Records usage with revenue/cost/profit
- `getRevenueStats()` - Weekly/monthly/all-time revenue
- `getServiceStats()` - Per-service performance metrics
- `getRecentFailures()` - Error tracking

Data stored in `data/income-services/usage.jsonl`.

### 3. Service Processors

#### PDF Services (`src/core/income/services/pdf-processor.ts`)
- **mergePDFs**: Combine multiple PDFs ($0.10/page)
- **splitPDF**: Extract pages ($0.05/page)
- **compressPDF**: Reduce file size ($0.25/call)

#### Document Services (`src/core/income/services/markdown-processor.ts`)
- **markdownToPDF**: Convert MD to formatted PDF ($0.15/call)

### 4. Income Skill (`src/skills/income-api-services/`)

Scheduled skill that runs every minute:

- Monitors service health
- Tracks revenue vs goal ($200/week)
- Identifies dev priorities
- Reports progress
- Alerts on failures

### 5. House Server API Endpoints (`src/core/house/server.ts`)

Public API routes:

```
POST /api/services/pdf/merge
POST /api/services/pdf/split
POST /api/services/pdf/compress
POST /api/services/markdown-to-pdf
POST /api/services/text/translate
POST /api/services/audio/transcribe
POST /api/services/enrich/email
GET  /api/income/stats
GET  /api/income/services
```

### 6. Dev Runner Integration (`src/core/orchestrator/prompts.ts`)

Autonomous dev runner now prioritizes income-generating tasks:

1. Service optimizations (performance, reliability)
2. New service launches
3. Marketing automation
4. Existing capability improvements

## Tier 2: API Arbitrage

Wholesale APIs resold at ≥2x markup. Zero marginal labor, 24/7 fulfillment —
the agent-native revenue stream. All arbitrage services are `enabled: false`
by default and activate when their wholesale key is set in `.env`.

| Service | Wholesale | Sells at | Markup | Endpoint |
|---------|-----------|----------|--------|----------|
| Translation | DeepL (`DEEPL_API_KEY`) | $0.000015/char | 3x | `POST /api/services/text/translate` |
| Transcription | Whisper (`OPENAI_API_KEY`) | $0.012/min | 2x | `POST /api/services/audio/transcribe` |
| Email verification | AbstractAPI (`EMAIL_VERIFY_API_KEY`) | $0.04/call | 5x | `POST /api/services/enrich/email` |

Unit economics live in `src/core/income/service-config.ts` (adjustable without
code changes). Every call is logged with revenue/cost/profit to
`data/income-services/usage.jsonl`, so the income report shows true margin per
service.

Notes:
- DeepL free-tier keys end with `:fx` and are auto-routed to the free API host.
- Transcription bills on actual audio minutes from Whisper's timestamps
  (minimum 1 minute), so margin is always 2x regardless of file length.
- Translation caps at 5,000 characters per request; transcription caps at 25MB.

### Self-funding

`src/core/income/self-funding.ts` compares this week's API revenue against the
agent's estimated weekly operating cost (`AGENT_WEEKLY_COST_USD`, default $25 —
tune it to real LLM/memory spend). The income report carries a self-funding
line so the agent demonstrably pays for its own existence before chasing the
$200/week goal:

```
Self-funding: COVERED (+$12.40 over ~$25.00 est. weekly cost)
```

Validate the whole tier without secrets:

```bash
npm run test:arbitrage
```

## Usage

### Test Income Services

```bash
npm run test:income
```

Shows:
- Enabled services
- Revenue stats
- Service performance
- API endpoint examples

### Start Services

```bash
# Enable in .env
HOUSE_SERVER_ENABLED=true
INCOME_SERVICES_ENABLED=true
INCOME_WEEKLY_GOAL=200

# Run worker
npm run dev
```

Services available at `http://localhost:9473/api/services/*`

### API Call Example

```bash
# Merge PDFs
curl -X POST http://localhost:9473/api/services/pdf/merge \
  -H 'Content-Type: application/json' \
  -d '{
    "files": ["<base64-pdf-1>", "<base64-pdf-2>"],
    "metadata": {"title": "Merged Document"},
    "customerId": "customer-123"
  }'

# Response
{
  "pdf": "<base64-merged-pdf>"
}
```

### Revenue Tracking

```bash
# Check stats via API
curl http://localhost:9473/api/income/stats

# Response
{
  "revenue": {
    "today": 15.50,
    "thisWeek": 87.25,
    "weeklyGoal": 200,
    "weeklyProgress": 43.6,
    "daysUntilGoal": 3
  },
  "services": [
    {
      "serviceId": "pdf-merge",
      "totalCalls": 125,
      "totalProfit": 45.30,
      "averageProfit": 0.36
    }
  ]
}
```

## Roadmap

### Phase 1: Foundation (Complete)
- [x] Revenue tracking system
- [x] Service configuration
- [x] PDF services (merge, split, compress)
- [x] Markdown to PDF
- [x] House server API endpoints
- [x] Income skill
- [x] Dev runner integration

### Phase 2: Payment & Marketing (Next)
- [ ] Stripe integration (payment processing)
- [ ] API key authentication
- [ ] Marketing automation (SEO, social)
- [ ] Landing page generator
- [ ] Email notifications

### Phase 3: Service Expansion
- [x] Image optimization service
- [x] Translation API (DeepL proxy) — implemented, needs DEEPL_API_KEY
- [x] Transcription API (Whisper) — implemented, needs OPENAI_API_KEY
- [x] Data enrichment service (email verification) — implemented, needs EMAIL_VERIFY_API_KEY
- [x] Self-funding tracker (revenue vs agent operating cost in income report)
- [ ] Batch processing

### Phase 4: Autonomous Growth
- [ ] Service performance optimization
- [ ] Pricing optimization
- [ ] Customer analytics
- [ ] A/B testing
- [ ] New service discovery

## Architecture Decisions

### Why Local Services First?

PDF and document processing use local libraries (pdf-lib, marked) instead of external APIs:

**Pros:**
- No per-call API costs (maximize profit)
- No rate limits from third parties
- Full control over processing
- Better privacy for customers

**Cons:**
- CPU/memory usage on worker
- Need to manage library updates
- More complex error handling

**Verdict:** Local processing for document services is optimal for early revenue. Will add API arbitrage services (translation, transcription) as scale increases.

### Why jsonl for Usage Logs?

Append-only newline-delimited JSON:

**Pros:**
- Fast writes (no full file read/parse)
- Easy to stream/tail
- Corruption resistant (one bad line doesn't break file)
- Simple log rotation

**Cons:**
- No indexes (need to scan for queries)
- File size grows indefinitely

**Verdict:** Perfect for usage logs. Will add log rotation when file > 100MB.

### Why House Server for Public APIs?

Extending existing House server instead of separate service:

**Pros:**
- Reuse existing HTTP server
- Single process (simpler deployment)
- Share authentication/logging infrastructure
- Lower resource footprint

**Cons:**
- Mixing internal + public APIs
- Potential security surface

**Verdict:** Acceptable for MVP. Will separate public API gateway when traffic grows.

## Environment Variables

```bash
# Enable income services
INCOME_SERVICES_ENABLED=true

# Weekly revenue goal (default 200)
INCOME_WEEKLY_GOAL=200

# Report interval (default 24 hours)
INCOME_REPORT_INTERVAL_HOURS=24

# Stripe keys (for payment processing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Data Storage

```
data/income-services/
├── services.json       # Service configurations
├── usage.jsonl         # Every API call logged
├── revenue.json        # Cached revenue stats (future)
└── customers.json      # API key registry
```

## Testing

```bash
# Test revenue tracking
npm run test:income

# Test PDF service
npm run worker:once  # Initialize system
# Then call API endpoints

# Test dev runner priorities
npm run test:dev
```

## Monitoring

Income skill reports every 24 hours via Telegram:

```
API SERVICE BUSINESS REPORT

Weekly Goal: $200
Current Week: $87.25 (43.6%)
Gap: $112.75 (3 days remaining)

Today: $15.50
All-time: $342.80

TOP SERVICES:
  pdf-merge: 125 calls, $45.30 profit (avg $0.36/call)
  markdown-to-pdf: 89 calls, $32.15 profit (avg $0.36/call)

DEV PRIORITIES:
  [HIGH] Launch translation API (high-margin service)
    Reason: Behind pace - $87.25/$200 this week
  [MEDIUM] Add batch PDF processing
    Reason: Enable higher-value enterprise customers
```

## Next Steps

1. **Set up Stripe** - Get API keys, implement payment flow
2. **Build landing pages** - Marketing sites for each service
3. **Launch first service publicly** - PDF tools on ProductHunt
4. **Implement SEO content generation** - Auto-write tutorials
5. **Add usage-based billing** - Prepaid credits, subscriptions

Goal: $200/week by end of July 2026.
