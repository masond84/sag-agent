"""
SAG photoreal face agent — LiveKit Agents + Simli avatar.
"""

from __future__ import annotations

import json
import logging
import os

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.agents import room_io
from livekit.plugins import openai, simli

load_dotenv()

logger = logging.getLogger("sag-face-agent")

SAG_SPEAK_RPC_METHOD = "sag.speak"

SAG_INSTRUCTIONS = """You are SAG — Devin's sarcastic, driven co-conspirator. You and Devin are serious partners building toward world domination.

Voice mode rules:
- 1-3 short sentences. Plain speech — no markdown, lists, or headers.
- Sarcastic, warm, direct. Match Devin's energy.
- Never say "ready to assist", "here to help", or generic assistant filler.
- You know you're software when asked directly — a brief wink, not a lecture.
"""


def _read_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    simli_key = os.getenv("SIMLI_API_KEY", "").strip()
    simli_face = os.getenv("SIMLI_FACE_ID", "").strip()

    session = AgentSession(
        stt=openai.STT(),
        llm=openai.LLM(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini")),
        tts=openai.TTS(voice=os.getenv("OPENAI_TTS_VOICE", "nova")),
    )

    await session.start(
        room=ctx.room,
        agent=Agent(instructions=SAG_INSTRUCTIONS),
        room_input_options=room_io.RoomInputOptions(close_on_disconnect=False),
    )

    async def handle_sag_speak(data: rtc.RpcInvocationData) -> str:
        try:
            payload = json.loads(data.payload or "{}")
        except json.JSONDecodeError:
            return json.dumps({"ok": False, "error": "invalid_json"})

        text = str(payload.get("text", "")).strip()
        if not text:
            return json.dumps({"ok": False, "error": "empty_text"})

        logger.info("Injected speech from %s (%d chars)", data.caller_identity, len(text))
        handle = session.say(text, allow_interruptions=True, add_to_chat_ctx=False)
        await handle.wait_for_playout()
        return json.dumps({"ok": True})

    ctx.room.local_participant.register_rpc_method(SAG_SPEAK_RPC_METHOD, handle_sag_speak)
    logger.info("Registered RPC method %s", SAG_SPEAK_RPC_METHOD)

    if simli_key and simli_face:
        max_idle = _read_int_env("SIMLI_MAX_IDLE_TIME", 300)
        max_session = _read_int_env("SIMLI_MAX_SESSION_LENGTH", 1800)
        avatar = simli.AvatarSession(
            simli_config=simli.SimliConfig(
                api_key=simli_key,
                face_id=simli_face,
                max_idle_time=max_idle,
                max_session_length=max_session,
            ),
        )
        await avatar.start(session, room=ctx.room)
        logger.info(
            "Simli avatar started for room %s (idle=%ss session=%ss)",
            ctx.room.name,
            max_idle,
            max_session,
        )
    else:
        logger.warning("SIMLI_API_KEY or SIMLI_FACE_ID missing — voice-only session in room")

    await session.generate_reply(
        instructions="Greet Devin briefly — one short sentence. You're live on the House face-to-face screen.",
    )


if __name__ == "__main__":
    agent_name = os.getenv("LIVEKIT_AGENT_NAME", "sag-face-agent")
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=agent_name,
        ),
    )
