import type { NextRequest } from "next/server";

function getWorkerBaseUrl(): string {
  return (process.env.SAG_WORKER_URL ?? "http://127.0.0.1:9473").replace(/\/$/, "");
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const suffix = path.join("/");
  const target = `${getWorkerBaseUrl()}/${suffix}`;

  if (suffix === "events") {
    const upstream = await fetch(target, {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const upstream = await fetch(target, { cache: "no-store" });
  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  return proxyWorkerRequest(request, context, "POST");
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  return proxyWorkerRequest(request, context, "PATCH");
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  return proxyWorkerRequest(request, context, "DELETE");
}

async function proxyWorkerRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: "POST" | "PATCH" | "DELETE",
): Promise<Response> {
  const { path } = await context.params;
  const suffix = path.join("/");
  const target = `${getWorkerBaseUrl()}/${suffix}`;
  const body = method === "DELETE" ? undefined : await request.text();

  const upstream = await fetch(target, {
    method,
    headers: method === "DELETE" ? undefined : { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const responseBody = await upstream.text();
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
