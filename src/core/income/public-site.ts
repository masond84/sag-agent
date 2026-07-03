import { promises as fs } from "node:fs";
import path from "node:path";
import type { ServiceConfig } from "../../types.js";
import { getBillingBaseUrl, getCreditPacks, isBillingEnabled } from "./billing.js";
import { getEnabledServices } from "./service-config.js";

/** Services visitors can try without an API key (browser tools page). */
export const FREE_TIER_SERVICES = new Set(["markdown-to-pdf", "image-optimize"]);

const FREE_DAILY_LIMIT = Number(process.env.INCOME_FREE_DAILY_LIMIT ?? 5);
const FREE_USAGE_FILE = path.join(process.cwd(), "data", "income-services", "free-usage.json");

interface FreeUsageStore {
  /** dayKey -> ip -> count */
  days: Record<string, Record<string, number>>;
}

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function readFreeUsage(): Promise<FreeUsageStore> {
  try {
    return JSON.parse(await fs.readFile(FREE_USAGE_FILE, "utf-8")) as FreeUsageStore;
  } catch {
    return { days: {} };
  }
}

async function writeFreeUsage(store: FreeUsageStore): Promise<void> {
  await fs.mkdir(path.dirname(FREE_USAGE_FILE), { recursive: true });
  // Keep only today + yesterday
  const keep = new Set([dayKey(), dayKey(new Date(Date.now() - 86_400_000))]);
  for (const key of Object.keys(store.days)) {
    if (!keep.has(key)) {
      delete store.days[key];
    }
  }
  await fs.writeFile(FREE_USAGE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function isFreeTierService(serviceId: string): boolean {
  return FREE_TIER_SERVICES.has(serviceId);
}

export async function consumeFreeTierSlot(
  clientKey: string,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  const store = await readFreeUsage();
  const today = dayKey();
  const byIp = store.days[today] ?? {};
  const used = byIp[clientKey] ?? 0;
  if (used >= FREE_DAILY_LIMIT) {
    return {
      ok: false,
      error: `Free daily limit reached (${FREE_DAILY_LIMIT}). Buy credits to continue.`,
    };
  }
  byIp[clientKey] = used + 1;
  store.days[today] = byIp;
  await writeFreeUsage(store);
  return { ok: true, remaining: FREE_DAILY_LIMIT - used - 1 };
}

function formatPrice(service: ServiceConfig): string {
  if (service.pricing.model === "per_call") {
    return `$${(service.pricing.pricePerCall ?? 0).toFixed(2)} / call`;
  }
  if (service.pricing.model === "per_unit") {
    return `$${(service.pricing.pricePerUnit ?? 0).toFixed(2)} / ${service.pricing.unit ?? "unit"}`;
  }
  return "Contact us";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; --bg: #0b0d10; --card: #14181f; --text: #e8eaed; --muted: #9aa3b2; --accent: #6ea8fe; --border: #2a3140; --ok: #3dd68c; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    a { color: var(--accent); }
    .wrap { max-width: 52rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    header { margin-bottom: 2rem; }
    h1 { font-size: 1.75rem; margin: 0 0 0.35rem; letter-spacing: -0.02em; }
    .lead { color: var(--muted); margin: 0; max-width: 40rem; }
    .grid { display: grid; gap: 1rem; }
    @media (min-width: 720px) { .grid.two { grid-template-columns: 1fr 1fr; } }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.1rem 1.2rem; }
    .card h2 { font-size: 1rem; margin: 0 0 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }
    .svc { display: flex; justify-content: space-between; gap: 1rem; padding: 0.65rem 0; border-top: 1px solid var(--border); }
    .svc:first-of-type { border-top: 0; padding-top: 0; }
    .svc strong { display: block; }
    .svc span { color: var(--muted); font-size: 0.9rem; }
    .badge { display: inline-block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.45rem; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
    .badge.free { color: var(--ok); border-color: rgba(61,214,140,0.35); }
    label { display: block; font-size: 0.85rem; color: var(--muted); margin: 0.75rem 0 0.3rem; }
    input, textarea, select, button { width: 100%; font: inherit; border-radius: 8px; border: 1px solid var(--border); background: #0f1319; color: var(--text); padding: 0.55rem 0.7rem; }
    textarea { min-height: 7rem; resize: vertical; }
    button, .btn { display: inline-block; width: auto; background: var(--accent); color: #061018; border: 0; font-weight: 600; cursor: pointer; text-decoration: none; padding: 0.55rem 0.9rem; border-radius: 8px; }
    button.secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .pack { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.7rem 0; border-top: 1px solid var(--border); }
    .pack:first-of-type { border-top: 0; padding-top: 0; }
    .muted { color: var(--muted); font-size: 0.9rem; }
    .ok { color: var(--ok); }
    .err { color: #ff8e8e; }
    pre.key { background: #0f1319; border: 1px solid var(--border); padding: 0.75rem; border-radius: 8px; overflow: auto; word-break: break-all; font-size: 0.85rem; }
    footer { margin-top: 2.5rem; color: var(--muted); font-size: 0.85rem; }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.75rem; }
  </style>
</head>
<body>
  <div class="wrap">
    ${body}
  </div>
</body>
</html>`;
}

export async function renderPublicToolsPage(options?: {
  notice?: string;
  error?: string;
}): Promise<string> {
  const services = await getEnabledServices();
  const packs = getCreditPacks();
  const billingOn = isBillingEnabled();
  const baseUrl = getBillingBaseUrl();

  const serviceRows = services
    .map((service) => {
      const free = isFreeTierService(service.id);
      return `<div class="svc">
        <div>
          <strong>${escapeHtml(service.name)}</strong>
          <span>${escapeHtml(service.description)}</span>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div>${escapeHtml(formatPrice(service))}</div>
          <span class="badge${free ? " free" : ""}">${free ? "Free try" : "Paid API"}</span>
        </div>
      </div>`;
    })
    .join("\n");

  const packRows = packs
    .map(
      (pack) => `<div class="pack">
      <div>
        <strong>${escapeHtml(pack.name)}</strong>
        <div class="muted">${escapeHtml(pack.description)} · $${(pack.credits).toFixed(0)} credits</div>
      </div>
      <form method="POST" action="/api/billing/buy">
        <input type="hidden" name="packId" value="${escapeHtml(pack.id)}" />
        <input type="hidden" name="email" id="email-for-${escapeHtml(pack.id)}" class="pack-email" />
        <button type="submit" ${billingOn ? "" : "disabled"}>${billingOn ? "Buy" : "Stripe off"}</button>
      </form>
    </div>`,
    )
    .join("\n");

  const notice = options?.notice
    ? `<p class="ok">${escapeHtml(options.notice)}</p>`
    : options?.error
      ? `<p class="err">${escapeHtml(options.error)}</p>`
      : "";

  const body = `
    <header>
      <h1>SAG API Tools</h1>
      <p class="lead">Document and image APIs you can try for free, then buy prepaid credits for production use. More tools will land here over time.</p>
    </header>
    ${notice}
    <div class="grid two">
      <section class="card">
        <h2>Available services</h2>
        ${serviceRows || `<p class="muted">No services enabled yet.</p>`}
        <p class="muted" style="margin-top:1rem">Paid calls use <code>Authorization: Bearer sag_…</code> against <code>${escapeHtml(baseUrl)}/api/services/…</code></p>
      </section>
      <section class="card">
        <h2>Buy credits</h2>
        <label>Email for receipt
          <input type="email" id="buyer-email" placeholder="you@example.com" autocomplete="email" />
        </label>
        ${
          billingOn
            ? packRows
            : `<p class="muted">Stripe is not configured yet. Set <code>STRIPE_SECRET_KEY</code> to enable checkout.</p>`
        }
        <p class="muted" style="margin-top:0.75rem">After payment you receive an API key and credit balance.</p>
      </section>
    </div>

    <div class="grid two" style="margin-top:1rem">
      <section class="card">
        <h2>Try free — Markdown → PDF</h2>
        <p class="muted">${FREE_DAILY_LIMIT} free runs / day / visitor. No API key.</p>
        <form id="free-md" onsubmit="return tryMarkdown(event)">
          <label>Markdown
            <textarea name="markdown" id="md-input"># Hello from SAG

This is a **free** preview.</textarea>
          </label>
          <div class="row">
            <button type="submit">Convert free</button>
          </div>
          <p id="md-status" class="muted"></p>
        </form>
      </section>
      <section class="card">
        <h2>Try free — Image optimize</h2>
        <p class="muted">${FREE_DAILY_LIMIT} free runs / day / visitor (shared with markdown).</p>
        <form id="free-img" onsubmit="return tryImage(event)">
          <label>Image file
            <input type="file" id="img-input" accept="image/*" />
          </label>
          <div class="row">
            <button type="submit">Optimize free</button>
          </div>
          <p id="img-status" class="muted"></p>
          <img id="img-preview" alt="" style="max-width:100%;margin-top:0.75rem;display:none;border-radius:8px" />
        </form>
      </section>
    </div>

    <footer>
      SAG API · prepaid credits · extendable tool suite
    </footer>
    <script>
      const emailInput = document.getElementById('buyer-email');
      document.querySelectorAll('form[action="/api/billing/buy"]').forEach((form) => {
        form.addEventListener('submit', () => {
          const hidden = form.querySelector('.pack-email');
          if (hidden && emailInput) hidden.value = emailInput.value || '';
        });
      });

      async function tryMarkdown(event) {
        event.preventDefault();
        const status = document.getElementById('md-status');
        status.textContent = 'Working…';
        status.className = 'muted';
        try {
          const markdown = document.getElementById('md-input').value;
          const res = await fetch('/api/public/try/markdown-to-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdown }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Request failed');
          status.textContent = 'Done. Remaining free today: ' + data.remainingFree;
          status.className = 'ok';
          const bytes = Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'sag-free.pdf';
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          status.textContent = err.message || String(err);
          status.className = 'err';
        }
        return false;
      }

      async function tryImage(event) {
        event.preventDefault();
        const status = document.getElementById('img-status');
        const preview = document.getElementById('img-preview');
        const file = document.getElementById('img-input').files[0];
        status.textContent = 'Working…';
        status.className = 'muted';
        preview.style.display = 'none';
        if (!file) {
          status.textContent = 'Choose an image first.';
          status.className = 'err';
          return false;
        }
        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          const res = await fetch('/api/public/try/image-optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: base64, format: 'webp', quality: 80 }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Request failed');
          status.textContent = 'Done. Remaining free today: ' + data.remainingFree;
          status.className = 'ok';
          preview.src = 'data:image/' + (data.format || 'webp') + ';base64,' + data.image;
          preview.style.display = 'block';
        } catch (err) {
          status.textContent = err.message || String(err);
          status.className = 'err';
        }
        return false;
      }
    </script>
  `;

  return layout("SAG API Tools", body);
}

export function renderCheckoutSuccessHtml(result: {
  apiKey: string;
  creditsBalance: number;
  creditsAdded: number;
  customerId: string;
}): string {
  const body = `
    <header>
      <h1>Credits ready</h1>
      <p class="lead">Save your API key — it will not be shown again in full on later visits.</p>
    </header>
    <section class="card">
      <p class="ok">Added $${result.creditsAdded.toFixed(2)} · Balance $${result.creditsBalance.toFixed(2)}</p>
      <p class="muted">Customer <code>${escapeHtml(result.customerId)}</code></p>
      <p>API key</p>
      <pre class="key">${escapeHtml(result.apiKey)}</pre>
      <div class="row">
        <a class="btn" href="/tools">Back to tools</a>
      </div>
      <p class="muted" style="margin-top:1rem">Example:</p>
      <pre class="key">curl -X POST ${escapeHtml(getBillingBaseUrl())}/api/services/markdown-to-pdf \\
  -H "Authorization: Bearer ${escapeHtml(result.apiKey)}" \\
  -H "Content-Type: application/json" \\
  -d '{"markdown":"# Hello"}'</pre>
    </section>
  `;
  return layout("SAG credits ready", body);
}

export function renderCheckoutCancelHtml(): string {
  const body = `
    <header>
      <h1>Checkout cancelled</h1>
      <p class="lead">No charge was made.</p>
    </header>
    <div class="row">
      <a class="btn" href="/tools">Back to tools</a>
    </div>
  `;
  return layout("Checkout cancelled", body);
}

export function clientKeyFromRequest(req: { headers: { [key: string]: string | string[] | undefined }; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.socket?.remoteAddress || "unknown";
}
