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
import { buildDevStatusPayload } from "./dev-status.js";
import {
  buildSkillGoalDevTask,
  getSkillGoalForNode,
  loadSkillGoals,
} from "./skill-goals.js";
import { isDevRunnerEnabled, queueManualDevTask } from "../dev/state.js";
import {
  endFaceSession,
  getFaceSessionConfig,
  getFaceSessionStatus,
  setFaceSessionAvatarStatus,
  startFaceSession,
} from "./livekit-session.js";
import { buildAssistantReply } from "./assistant-reply.js";
import type { InteractiveSkillContext } from "../../types.js";
import { getRevenueStats, getServiceStats, validateAPIKey } from "../income/revenue-tracking.js";
import { getEnabledServices } from "../income/service-config.js";
import { mergePDFs, splitPDF, compressPDF } from "../income/services/pdf-processor.js";
import { markdownToPDF } from "../income/services/markdown-processor.js";

export type HouseContextProvider = () => Promise<AgentHealthContext>;
export type HouseInteractiveContextProvider = () => Promise<InteractiveSkillContext>;

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

function activityEventId(event: ActivityEvent, sequence?: number): string {
  const digest = Buffer.from(event.summary, "utf8").toString("base64url").slice(0, 10);
  const seq = sequence === undefined ? "" : `-${sequence}`;
  return `act-${event.at}-${event.type}-${digest}${seq}`;
}

function activityToHouseEvent(event: ActivityEvent, sequence?: number): HouseEvent {
  return {
    id: activityEventId(event, sequence),
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
  getInteractiveContext?: HouseInteractiveContextProvider,
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
    const ordered = [...recent].reverse();
    for (const [index, item] of ordered.entries()) {
      send(activityToHouseEvent(item, index));
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

  if (path === "/face-session/config" && req.method === "GET") {
    sendJson(res, 200, getFaceSessionConfig());
    return;
  }

  if (path === "/face-session" && req.method === "POST") {
    const raw = await readBody(req);
    let participantName: string | undefined;
    let forceNew = false;
    try {
      const parsed = JSON.parse(raw || "{}") as { participantName?: string; forceNew?: boolean };
      participantName = parsed.participantName;
      forceNew = parsed.forceNew === true;
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const result = await startFaceSession({ participantName, forceNew });
    sendJson(res, result.ok ? 200 : 503, result);
    return;
  }

  const faceSessionStatusMatch = path.match(/^\/face-session\/([^/]+)\/status$/);
  if (faceSessionStatusMatch && req.method === "GET") {
    const sessionId = decodeURIComponent(faceSessionStatusMatch[1]!);
    const status = getFaceSessionStatus(sessionId);
    if (!status) {
      sendJson(res, 404, { error: "Session not found" });
      return;
    }
    sendJson(res, 200, status);
    return;
  }

  const faceSessionAvatarStatusMatch = path.match(/^\/face-session\/([^/]+)\/avatar-status$/);
  if (faceSessionAvatarStatusMatch && req.method === "POST") {
    const sessionId = decodeURIComponent(faceSessionAvatarStatusMatch[1]!);
    const raw = await readBody(req);
    try {
      const parsed = JSON.parse(raw || "{}") as { status?: string; error?: string };
      const status = parsed.status?.trim();
      if (status !== "pending" && status !== "ready" && status !== "error") {
        sendJson(res, 400, { error: "Invalid status" });
        return;
      }
      const result = setFaceSessionAvatarStatus(sessionId, status, parsed.error);
      sendJson(res, result.ok ? 200 : 404, result);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  const faceSessionMatch = path.match(/^\/face-session\/([^/]+)$/);
  if (faceSessionMatch && req.method === "DELETE") {
    const sessionId = decodeURIComponent(faceSessionMatch[1]!);
    const result = await endFaceSession(sessionId);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (path === "/assistant/reply" && req.method === "POST") {
    if (!getInteractiveContext) {
      sendJson(res, 503, { error: "Assistant bridge is not configured" });
      return;
    }

    const raw = await readBody(req);
    let text = "";
    let chatId: number | string | undefined;
    try {
      const parsed = JSON.parse(raw) as { text?: string; chatId?: number | string };
      text = (parsed.text ?? "").trim();
      chatId = parsed.chatId;
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    try {
      const result = await buildAssistantReply(text, getInteractiveContext, chatId);
      sendJson(res, 200, result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      sendJson(res, 400, { error: detail });
    }
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

  if (path === "/dev/status" && req.method === "GET") {
    sendJson(res, 200, await buildDevStatusPayload());
    return;
  }

  if (path === "/skill-goals" && req.method === "GET") {
    const goals = await loadSkillGoals();
    sendJson(res, 200, { goals });
    return;
  }

  const skillGoalMatch = path.match(/^\/skill-goals\/([^/]+)\/request$/);
  if (skillGoalMatch && req.method === "POST") {
    if (!isDevRunnerEnabled()) {
      sendJson(res, 400, { error: "Dev runner is disabled" });
      return;
    }

    const nodeId = decodeURIComponent(skillGoalMatch[1]!);
    const goal = await getSkillGoalForNode(nodeId);
    if (!goal) {
      sendJson(res, 404, { error: "No skill goal for this node" });
      return;
    }

    const detail = await buildSkillNodeDetail(nodeId, (await getContext()).skills);
    if (detail?.status !== "planned") {
      sendJson(res, 400, { error: "Node is already implemented or unlocked" });
      return;
    }

    const task = buildSkillGoalDevTask(goal);
    await queueManualDevTask(task);
    sendJson(res, 200, {
      ok: true,
      nodeId,
      title: goal.title,
      message: `Queued build for ${goal.title}. Dev runner will pick it up on the next cycle.`,
    });
    return;
  }

  if (path === "/api/income/stats" && req.method === "GET") {
    const stats = await getRevenueStats();
    const serviceStats = await getServiceStats();
    sendJson(res, 200, { revenue: stats, services: serviceStats });
    return;
  }

  if (path === "/api/income/services" && req.method === "GET") {
    const services = await getEnabledServices();
    sendJson(res, 200, { services });
    return;
  }

  if (path === "/api/services/pdf/merge" && req.method === "POST") {
    const raw = await readBody(req);
    let files: Buffer[] = [];
    let customerId: string | undefined;
    
    try {
      const parsed = JSON.parse(raw) as { files: string[]; metadata?: { title?: string; author?: string }; customerId?: string };
      files = parsed.files.map(f => Buffer.from(f, "base64"));
      customerId = parsed.customerId;
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
      return;
    }
    
    try {
      const result = await mergePDFs({ files }, customerId);
      sendJson(res, 200, { pdf: result.toString("base64") });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: detail });
    }
    return;
  }

  if (path === "/api/services/pdf/split" && req.method === "POST") {
    const raw = await readBody(req);
    let file: Buffer;
    let pages: number[] | undefined;
    let customerId: string | undefined;
    
    try {
      const parsed = JSON.parse(raw) as { file: string; pages?: number[]; customerId?: string };
      file = Buffer.from(parsed.file, "base64");
      pages = parsed.pages;
      customerId = parsed.customerId;
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
      return;
    }
    
    try {
      const results = await splitPDF({ file, pages }, customerId);
      sendJson(res, 200, { pdfs: results.map(r => r.toString("base64")) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: detail });
    }
    return;
  }

  if (path === "/api/services/pdf/compress" && req.method === "POST") {
    const raw = await readBody(req);
    let file: Buffer;
    let customerId: string | undefined;
    
    try {
      const parsed = JSON.parse(raw) as { file: string; customerId?: string };
      file = Buffer.from(parsed.file, "base64");
      customerId = parsed.customerId;
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
      return;
    }
    
    try {
      const result = await compressPDF({ file }, customerId);
      sendJson(res, 200, { pdf: result.toString("base64") });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: detail });
    }
    return;
  }

  if (path === "/api/services/markdown-to-pdf" && req.method === "POST") {
    const raw = await readBody(req);
    let markdown: string;
    let options: { title?: string; author?: string; fontSize?: number; pageSize?: "letter" | "a4" } | undefined;
    let customerId: string | undefined;
    
    try {
      const parsed = JSON.parse(raw) as { markdown: string; options?: typeof options; customerId?: string };
      markdown = parsed.markdown;
      options = parsed.options;
      customerId = parsed.customerId;
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
      return;
    }
    
    try {
      const result = await markdownToPDF({ markdown, options }, customerId);
      sendJson(res, 200, { pdf: result.toString("base64") });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { error: detail });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

export function startHouseServer(
  getContext: HouseContextProvider,
  getInteractiveContext?: HouseInteractiveContextProvider,
): void {
  if (!isHouseServerEnabled()) {
    return;
  }

  const host = getHouseServerHost();
  const port = getHouseServerPort();

  const server = createServer((req, res) => {
    handleRequest(req, res, getContext, getInteractiveContext).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[error] House server:", detail);
      if (!res.headersSent) {
        sendJson(res, 500, { error: detail });
      }
    });
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.warn(
        `[warn] House server port ${port} already in use — another worker may be running. Chat/Telegram will continue without house API on this process.`,
      );
      return;
    }
    console.error(`[error] House server failed to start: ${error.message}`);
  });

  server.listen(port, host, () => {
    console.log(`[info] SAG house server listening on http://${host}:${port}`);
  });
}
