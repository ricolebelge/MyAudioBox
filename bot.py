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

# ── State ────────────────────────────────────────────────────────────────────

def _fresh() -> dict:
    return {
        "votes":    {"encore": 0, "stop": 0, "change": 0},
        "bpm":      {"faster": 0, "slower": 0, "delta": 0},
        "genres":   [],
        "messages": [],
    }

state: dict      = _fresh()
ws_clients: set  = set()

# ── Helpers ──────────────────────────────────────────────────────────────────

def _log_msg(username: str, text: str) -> None:
    ts = datetime.now().strftime("%H:%M")
    state["messages"].append(f"[{ts}] {username}: {text}")
    if len(state["messages"]) > 20:
        state["messages"] = state["messages"][-20:]

async def broadcast() -> None:
    if not ws_clients:
        return
    payload = json.dumps({
        "type":     "crowd_update",
        "votes":    state["votes"],
        "bpm":      state["bpm"],
        "genres":   state["genres"],
        "messages": state["messages"],
    })
    dead = set()
    for ws in ws_clients:
        try:
            await ws.send(payload)
        except Exception:
            dead.add(ws)
    ws_clients.difference_update(dead)

def _in_group(update: Update) -> bool:
    return update.effective_chat.id == CHAT_ID

# ── Command handlers ─────────────────────────────────────────────────────────

async def _vote(update: Update, key: str) -> None:
    if not _in_group(update):
        return
    state["votes"][key] += 1
    _log_msg(update.effective_user.first_name, f"/{key}")
    await broadcast()

async def cmd_encore(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    await _vote(update, "encore")

async def cmd_stop(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    await _vote(update, "stop")

async def cmd_change(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    await _vote(update, "change")

async def cmd_faster(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    if not _in_group(update):
        return
    state["bpm"]["faster"] += 1
    state["bpm"]["delta"]  += 5
    _log_msg(update.effective_user.first_name, "/faster")
    await broadcast()

async def cmd_slower(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    if not _in_group(update):
        return
    state["bpm"]["slower"] += 1
    state["bpm"]["delta"]  -= 5
    _log_msg(update.effective_user.first_name, "/slower")
    await broadcast()

async def cmd_genre(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not _in_group(update):
        return
    genre = " ".join(ctx.args).strip() if ctx.args else ""
    if not genre:
        return
    state["genres"].append(genre)
    if len(state["genres"]) > 10:
        state["genres"] = state["genres"][-10:]
    _log_msg(update.effective_user.first_name, f"/genre {genre}")
    await broadcast()

async def cmd_reset(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_user.id != OWNER_ID:
        return
    state.update(_fresh())
    await broadcast()

# ── WebSocket server ─────────────────────────────────────────────────────────

async def _ws_handler(websocket) -> None:
    ws_clients.add(websocket)
    try:
        await websocket.send(json.dumps({
            "type":     "crowd_update",
            "votes":    state["votes"],
            "bpm":      state["bpm"],
            "genres":   state["genres"],
            "messages": state["messages"],
        }))
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
        log.info("Telegram polling  →  chat %d", CHAT_ID)

        async with websockets.serve(_ws_handler, "0.0.0.0", WS_PORT):
            log.info("WS crowd server   ->  ws://localhost:%d", WS_PORT)
            log.info("/reset owner-only — votes accumulate until manual reset")
            await asyncio.Future()  # run forever

        await app.updater.stop()
        await app.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nArrêt.")
