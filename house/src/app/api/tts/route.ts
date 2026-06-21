import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<Response> {
  const { text } = (await request.json()) as { text?: string };
  const cleaned = text?.trim();

  if (!cleaned) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ fallback: "web-speech" }, { status: 200 });
  }

  const model = process.env.HOUSE_TTS_MODEL?.trim() || "tts-1";
  const voice = process.env.HOUSE_TTS_VOICE?.trim() || "nova";

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: cleaned.slice(0, 4096),
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json({ error: detail, fallback: "web-speech" }, { status: 502 });
  }

  const audio = await response.arrayBuffer();
  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
