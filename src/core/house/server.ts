import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getRecentActivity, type ActivityEvent } from "../activity-log.js";
import type { AgentHealthContext } from "../../types.js";
import {
  getHouseServerHost,
  getHouseServerPort,
  isHouseServerEnabled,
  publishHouseEvent,
  subscribeHouseEvents,
  type HouseEvent,
} from "./events.js";
import { buildSkillTreePayload } from "./skill-tree.js";
import { buildSkillNodeDetail, toggleSkillEnabled } from "./skill-detail.js";
import { listAllSkillConfigs } from "./skill-config.js";

export type HouseContextProvider = () => Promise<AgentHealthContext>;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function activityToHouseEvent(event: ActivityEvent): HouseEvent {
  return {
    id: `act-${event.at}-${event.type}`,
    at: event.at,
    kind: "activity",
    text: event.summary,
    meta: { type: event.type, ...(event.meta ?? {}) },
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  getContext: HouseContextProvider,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (path === "/health" && req.method === "GET") {
    const context = await getContext();
    sendJson(res, 200, {
      ok: true,
      at: new Date().toISOString(),
      dryRun: context.dryRun,
      gmailConfigured: context.gmailConfigured,
      telegramConfigured: context.telegramConfigured,
      skills: context.skills,
    });
    return;
  }

  if (path === "/activity" && req.method === "GET") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);
    const sinceHours = Number(url.searchParams.get("since_hours") ?? 24);
    const events = await getRecentActivity({ limit, sinceHours });
    sendJson(res, 200, { events });
    return;
  }

  if (path === "/skill-tree" && req.method === "GET") {
    const context = await getContext();
    sendJson(res, 200, buildSkillTreePayload(context.skills));
    return;
  }

  const skillNodeMatch = path.match(/^\/skill-node\/([^/]+)$/);
  if (skillNodeMatch && req.method === "GET") {
    const context = await getContext();
    const detail = await buildSkillNodeDetail(skillNodeMatch[1]!, context.skills);
    if (!detail) {
      sendJson(res, 404, { error: "Node not found" });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  const skillConfigMatch = path.match(/^\/skills\/([^/]+)$/);
  if (skillConfigMatch && req.method === "PATCH") {
    const raw = await readBody(req);
    let enabled = false;
    try {
      const parsed = JSON.parse(raw) as { enabled?: boolean };
      enabled = Boolean(parsed.enabled);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    try {
      const result = await toggleSkillEnabled(skillConfigMatch[1]!, enabled);
      publishHouseEvent("status", {
        text: `Skill ${result.skillId} ${enabled ? "enabled" : "disabled"}`,
        meta: { skillId: result.skillId, enabled },
      });
      sendJson(res, 200, result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      sendJson(res, 400, { error: detail });
    }
    return;
  }

  if (path === "/skills" && req.method === "GET") {
    const configs = await listAllSkillConfigs();
    sendJson(res, 200, { skills: configs });
    return;
  }

  if (path === "/events" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");

    const send = (event: HouseEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({
      id: "connected",
      at: new Date().toISOString(),
      kind: "connected",
      text: "SAG house stream connected",
    });

    const context = await getContext();
    send({
      id: "status-boot",
      at: new Date().toISOString(),
      kind: "status",
      text: `Worker online — ${context.skills.length} skills loaded`,
      meta: {
        dryRun: context.dryRun,
        skillCount: context.skills.length,
      },
    });

    const recent = await getRecentActivity({ limit: 15, sinceHours: 24 });
    for (const item of recent.reverse()) {
      send(activityToHouseEvent(item));
    }

    const unsubscribe = subscribeHouseEvents(send);
    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    return;
  }

  if (path === "/speech" && req.method === "POST") {
    const raw = await readBody(req);
    let speech = "";
    try {
      const parsed = JSON.parse(raw) as { text?: string; speech?: string };
      speech = (parsed.speech ?? parsed.text ?? "").trim();
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    if (!speech) {
      sendJson(res, 400, { error: "Missing text" });
      return;
    }

    publishHouseEvent("speech", { speech, text: speech, meta: { source: "manual" } });
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

export function startHouseServer(getContext: HouseContextProvider): void {
  if (!isHouseServerEnabled()) {
    return;
  }

  const host = getHouseServerHost();
  const port = getHouseServerPort();

  const server = createServer((req, res) => {
    handleRequest(req, res, getContext).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[error] House server:", detail);
      if (!res.headersSent) {
        sendJson(res, 500, { error: detail });
      }
    });
  });

  server.listen(port, host, () => {
    console.log(`[info] SAG house server listening on http://${host}:${port}`);
  });
}
