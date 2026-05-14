"""bot.py — Crowd interaction bot for MyAudioBox (port 8002)."""
import asyncio
import json
import logging
from datetime import datetime

import websockets
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

# ── .env loader ──────────────────────────────────────────────────────────────

def _load_env(path: str = ".env") -> dict:
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env

_e       = _load_env()
TOKEN    = _e["TELEGRAM_TOKEN"]
CHAT_ID  = int(_e["TELEGRAM_CHAT_ID"])
OWNER_ID = int(_e["TELEGRAM_OWNER_ID"])

WS_PORT = 8002

# ── Server-side accumulator (reference only — not sent on connect) ────────────

def _fresh() -> dict:
    return {
        "votes":    {"encore": 0, "stop": 0, "change": 0},
        "bpm":      {"faster": 0, "slower": 0, "delta": 0},
        "genres":   [],
        "messages": [],
    }

state: dict     = _fresh()
ws_clients: set = set()

# ── Broadcast ────────────────────────────────────────────────────────────────
# Each crowd_update carries only the INCREMENT that just happened.
# Clients accumulate from 0; only crowd_reset zeroes them out.

async def _send_all(payload: str) -> None:
    dead = set()
    for ws in ws_clients:
        try:
            await ws.send(payload)
        except Exception:
            dead.add(ws)
    ws_clients.difference_update(dead)

async def _broadcast_increment(
    votes:  dict,
    bpm:    dict,
    genres: list,
    msg:    str,
) -> None:
    await _send_all(json.dumps({
        "type":     "crowd_update",
        "votes":    votes,
        "bpm":      bpm,
        "genres":   genres,
        "messages": [msg],
    }))

async def _broadcast_reset() -> None:
    await _send_all(json.dumps({"type": "crowd_reset"}))

# ── Message log ───────────────────────────────────────────────────────────────

def _log(username: str, text: str) -> str:
    ts    = datetime.now().strftime("%H:%M")
    entry = f"[{ts}] {username}: {text}"
    state["messages"].append(entry)
    if len(state["messages"]) > 100:
        state["messages"] = state["messages"][-100:]
    return entry

def _in_group(update: Update) -> bool:
    return update.effective_chat.id == CHAT_ID

# ── Command handlers — broadcast increment only ──────────────────────────────

async def cmd_encore(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    if not _in_group(update): return
    state["votes"]["encore"] += 1
    await _broadcast_increment(
        votes={"encore": 1, "stop": 0, "change": 0},
        bpm={"faster": 0, "slower": 0, "delta": 0},
        genres=[],
        msg=_log(update.effective_user.first_name, "/encore"),
    )

async def cmd_stop(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    if not _in_group(update): return
    state["votes"]["stop"] += 1
    await _broadcast_increment(
        votes={"encore": 0, "stop": 1, "change": 0},
        bpm={"faster": 0, "slower": 0, "delta": 0},
        genres=[],
        msg=_log(update.effective_user.first_name, "/stop"),
    )

async def cmd_change(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    if not _in_group(update): return
    state["votes"]["change"] += 1
    await _broadcast_increment(
        votes={"encore": 0, "stop": 0, "change": 1},
        bpm={"faster": 0, "slower": 0, "delta": 0},
        genres=[],
        msg=_log(update.effective_user.first_name, "/change"),
    )

async def cmd_faster(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    if not _in_group(update): return
    state["bpm"]["faster"] += 1
    state["bpm"]["delta"]  += 5
    await _broadcast_increment(
        votes={"encore": 0, "stop": 0, "change": 0},
        bpm={"faster": 1, "slower": 0, "delta": 5},
        genres=[],
        msg=_log(update.effective_user.first_name, "/faster"),
    )

async def cmd_slower(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    if not _in_group(update): return
    state["bpm"]["slower"] += 1
    state["bpm"]["delta"]  -= 5
    await _broadcast_increment(
        votes={"encore": 0, "stop": 0, "change": 0},
        bpm={"faster": 0, "slower": 1, "delta": -5},
        genres=[],
        msg=_log(update.effective_user.first_name, "/slower"),
    )

async def cmd_genre(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not _in_group(update): return
    genre = " ".join(ctx.args).strip() if ctx.args else ""
    if not genre: return
    state["genres"].append(genre)
    await _broadcast_increment(
        votes={"encore": 0, "stop": 0, "change": 0},
        bpm={"faster": 0, "slower": 0, "delta": 0},
        genres=[genre],
        msg=_log(update.effective_user.first_name, f"/genre {genre}"),
    )

async def cmd_reset(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_user.id != OWNER_ID: return
    state.update(_fresh())
    await _broadcast_reset()

# ── WebSocket server ──────────────────────────────────────────────────────────
# No initial state on connect — client starts at 0 and accumulates.

async def _ws_handler(websocket) -> None:
    ws_clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        ws_clients.discard(websocket)

# ── Entry point ──────────────────────────────────────────────────────────────

async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%H:%M:%S",
    )
    log = logging.getLogger(__name__)

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("encore", cmd_encore))
    app.add_handler(CommandHandler("stop",   cmd_stop))
    app.add_handler(CommandHandler("change", cmd_change))
    app.add_handler(CommandHandler("faster", cmd_faster))
    app.add_handler(CommandHandler("slower", cmd_slower))
    app.add_handler(CommandHandler("genre",  cmd_genre))
    app.add_handler(CommandHandler("reset",  cmd_reset))

    async with app:
        await app.start()
        await app.updater.start_polling(allowed_updates=["message"])
        log.info("Telegram polling  ->  chat %d", CHAT_ID)

        async with websockets.serve(_ws_handler, "0.0.0.0", WS_PORT):
            log.info("WS crowd server   ->  ws://localhost:%d", WS_PORT)
            log.info("/reset owner-only — votes accumulate until manual reset")
            await asyncio.Future()

        await app.updater.stop()
        await app.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nArret.")
