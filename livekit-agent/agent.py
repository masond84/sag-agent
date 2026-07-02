"""
SAG photoreal face agent — LiveKit Agents + Simli avatar.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

import aiohttp
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentSession, JobContext, StopResponse, WorkerOptions, cli, llm
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


def _bridge_enabled() -> bool:
    return os.getenv("SAG_BRIDGE_ENABLED", "true").lower() != "false"


def _voice_input_enabled() -> bool:
    return os.getenv("SAG_VOICE_INPUT_ENABLED", "false").lower() == "true"


def _worker_url() -> str:
    return os.getenv("SAG_WORKER_URL", "http://127.0.0.1:9473").rstrip("/")


def _telegram_chat_id() -> str:
    return os.getenv("TELEGRAM_CHAT_ID", "").strip()


async def _fetch_assistant_reply(text: str) -> tuple[str, str | None]:
    payload: dict[str, str] = {"text": text}
    chat_id = _telegram_chat_id()
    if chat_id:
        payload["chatId"] = chat_id

    timeout = aiohttp.ClientTimeout(total=120)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{_worker_url()}/assistant/reply",
            json=payload,
            headers={"Content-Type": "application/json"},
        ) as response:
            body = await response.text()
            if response.status >= 400:
                raise RuntimeError(f"worker reply failed ({response.status}): {body[:240]}")

            data = json.loads(body)
            reply = str(data.get("reply", "")).strip()
            speakable_raw = data.get("speakable")
            speakable = str(speakable_raw).strip() if speakable_raw else None
            return reply, speakable or None


class SAGBridgedAgent(Agent):
    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        if not _bridge_enabled():
            return

        text = (new_message.text_content or "").strip()
        if not text:
            return

        try:
            reply, speakable = await _fetch_assistant_reply(text)
        except Exception:
            logger.exception("Worker assistant bridge failed — falling back to local LLM")
            return

        spoken = speakable or reply[:320].strip()
        if not spoken:
            raise StopResponse()

        logger.info("Bridged user turn to worker (%d chars in, %d spoken)", len(text), len(spoken))

        chat_ctx = self.chat_ctx.copy()
        chat_ctx.items.append(new_message)
        chat_ctx.items.append(llm.ChatMessage(role="assistant", content=[spoken]))
        await self.update_chat_ctx(chat_ctx)

        handle = self.session.say(spoken, allow_interruptions=True, add_to_chat_ctx=False)
        await handle.wait_for_playout()
        raise StopResponse()


async def _report_avatar_status(session_id: str, status: str, error: str | None = None) -> None:
    if not session_id:
        return

    payload: dict[str, str] = {"status": status}
    if error:
        payload["error"] = error[:500]

    timeout = aiohttp.ClientTimeout(total=10)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{_worker_url()}/face-session/{session_id}/avatar-status",
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as response:
                if response.status >= 400:
                    body = await response.text()
                    logger.warning(
                        "Avatar status report failed (%s): %s",
                        response.status,
                        body[:200],
                    )
    except Exception:
        logger.warning("Avatar status report to worker failed", exc_info=True)


def _session_id_from_room(room: rtc.Room) -> str:
    try:
        meta = json.loads(room.metadata or "{}")
        return str(meta.get("sessionId", "")).strip()
    except json.JSONDecodeError:
        return ""


def _is_avatar_participant(identity: str) -> bool:
    ident = identity.lower()
    return "simli" in ident or ("avatar" in ident and "agent" in ident)


def _room_has_avatar_video(room: rtc.Room) -> bool:
    for participant in room.remote_participants.values():
        if not _is_avatar_participant(participant.identity):
            continue
        for publication in participant.track_publications.values():
            if publication.kind == rtc.TrackKind.KIND_VIDEO:
                return True
    return False


async def _wait_for_avatar_video(room: rtc.Room, timeout: float = 25.0) -> bool:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if _room_has_avatar_video(room):
            return True
        await asyncio.sleep(0.5)
    return False


async def _start_simli_avatar(
    avatar: simli.AvatarSession,
    session: AgentSession,
    room: rtc.Room,
    session_id: str,
) -> bool:
    retry_delays = [0, 5, 15, 35]
    last_error = "Avatar video did not appear"

    for attempt, delay in enumerate(retry_delays):
        if delay > 0:
            await asyncio.sleep(delay)

        try:
            await avatar.start(session, room=room)
        except Exception as exc:
            last_error = str(exc)
            logger.warning("Simli avatar start attempt %d failed: %s", attempt + 1, last_error)
            if "429" not in last_error and "rate limit" not in last_error.lower():
                if attempt >= len(retry_delays) - 1:
                    break
                continue
            if attempt >= len(retry_delays) - 1:
                break
            continue

        if await _wait_for_avatar_video(room):
            await _report_avatar_status(session_id, "ready")
            logger.info("Simli avatar video live for room %s", room.name)
            return True

        last_error = "Avatar connected but video track never appeared"
        logger.warning("Simli avatar attempt %d: no video track in room", attempt + 1)

    await _report_avatar_status(session_id, "error", last_error)
    logger.error("Simli avatar failed for room %s: %s", room.name, last_error)
    return False


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    session_id = _session_id_from_room(ctx.room)
    if session_id:
        await _report_avatar_status(session_id, "pending")

    simli_key = os.getenv("SIMLI_API_KEY", "").strip()
    simli_face = os.getenv("SIMLI_FACE_ID", "").strip()
    voice_input = _voice_input_enabled()

    if voice_input:
        session = AgentSession(
            stt=openai.STT(),
            llm=openai.LLM(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini")),
            tts=openai.TTS(voice=os.getenv("OPENAI_TTS_VOICE", "nova")),
        )
        agent = SAGBridgedAgent(instructions=SAG_INSTRUCTIONS)
    else:
        session = AgentSession(
            tts=openai.TTS(voice=os.getenv("OPENAI_TTS_VOICE", "nova")),
        )
        agent = Agent(
            instructions="Output-only SAG avatar. Speak only when text is injected via sag.speak.",
        )

    await session.start(
        room=ctx.room,
        agent=agent,
        room_input_options=room_io.RoomInputOptions(
            audio_enabled=voice_input,
            text_enabled=voice_input,
            close_on_disconnect=False,
        ),
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

    if voice_input:
        if _bridge_enabled():
            logger.info("Voice input enabled — assistant bridge at %s", _worker_url())
        else:
            logger.info("Voice input enabled — using local LLM only")
    else:
        logger.info("Voice input disabled — avatar speaks via sag.speak only (e.g. Telegram → House)")

    if simli_key and simli_face:
        max_idle = _read_int_env("SIMLI_MAX_IDLE_TIME", 1800)
        max_session = _read_int_env("SIMLI_MAX_SESSION_LENGTH", 7200)
        avatar = simli.AvatarSession(
            simli_config=simli.SimliConfig(
                api_key=simli_key,
                face_id=simli_face,
                max_idle_time=max_idle,
                max_session_length=max_session,
            ),
        )
        started = await _start_simli_avatar(avatar, session, ctx.room, session_id)
        if started:
            logger.info(
                "Simli avatar started for room %s (idle=%ss session=%ss)",
                ctx.room.name,
                max_idle,
                max_session,
            )
        else:
            logger.error(
                "Simli avatar unavailable for room %s — voice-only fallback",
                ctx.room.name,
            )
    else:
        await _report_avatar_status(
            session_id,
            "error",
            "SIMLI_API_KEY or SIMLI_FACE_ID missing on face agent",
        )
        logger.warning("SIMLI_API_KEY or SIMLI_FACE_ID missing — voice-only session in room")

    if voice_input:
        await session.generate_reply(
            instructions="Greet Devin briefly — one short sentence. You're live on the House face-to-face screen.",
        )


if __name__ == "__main__":
    agent_name = os.getenv("LIVEKIT_AGENT_NAME", "sag-face-agent")
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=agent_name,
            num_idle_processes=1,
        ),
    )
