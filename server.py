import asyncio
import json
import os
import threading
import time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, unquote

import websockets
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

BASE_DIR = Path(__file__).parent
WEB_DIR = BASE_DIR / "web"
PATTERNS_DIR = BASE_DIR / "patterns"
SAMPLES_DIR = BASE_DIR / "samples"
HTTP_PORT = 8000
WS_PORT = 8001

# ── WebSocket broadcast ────────────────────────────────────────────────────────

ws_clients: set = set()
ws_loop: asyncio.AbstractEventLoop | None = None

def broadcast(message: dict):
    if ws_loop is None:
        return
    payload = json.dumps(message)
    async def _send():
        dead = set()
        for ws in ws_clients:
            try:
                await ws.send(payload)
            except Exception:
                dead.add(ws)
        ws_clients.difference_update(dead)
    asyncio.run_coroutine_threadsafe(_send(), ws_loop)

# ── Watchdog ──────────────────────────────────────────────────────────────────

class ReloadHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if not event.is_directory:
            broadcast({"type": "reload", "file": event.src_path})

    def on_created(self, event):
        if not event.is_directory:
            broadcast({"type": "reload", "file": event.src_path})

    def on_deleted(self, event):
        if not event.is_directory:
            broadcast({"type": "reload", "file": event.src_path})

# ── HTTP handler ──────────────────────────────────────────────────────────────

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wav":  "audio/wav",
    ".mp3":  "audio/mpeg",
    ".ogg":  "audio/ogg",
    ".flac": "audio/flac",
    ".aif":  "audio/aiff",
    ".aiff": "audio/aiff",
    ".ico":  "image/x-icon",
    ".svg":  "image/svg+xml",
}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # silence access log

    def _send(self, code, content_type, body: bytes):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self._send(code, "application/json; charset=utf-8", body)

    def _send_file(self, path: Path):
        ext = path.suffix.lower()
        mime = MIME.get(ext, "application/octet-stream")
        try:
            data = path.read_bytes()
            self._send(200, mime, data)
        except FileNotFoundError:
            self._send_json(404, {"error": "not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        # ── API ──
        if path == "/api/patterns":
            names = [p.stem for p in sorted(PATTERNS_DIR.glob("*.json"))]
            self._send_json(200, names)
            return

        if path.startswith("/api/patterns/"):
            name = path[len("/api/patterns/"):]
            file = PATTERNS_DIR / f"{name}.json"
            if file.exists():
                self._send_json(200, json.loads(file.read_text("utf-8")))
            else:
                self._send_json(404, {"error": "pattern not found"})
            return

        # ── Samples ──
        if path.startswith("/samples/"):
            rel = path[len("/samples/"):]
            self._send_file(SAMPLES_DIR / rel)
            return

        # ── Static files ──
        if path == "/" or path == "":
            self._send_file(WEB_DIR / "index.html")
            return

        file = WEB_DIR / path.lstrip("/")
        if file.exists() and file.is_file():
            self._send_file(file)
        else:
            self._send_file(WEB_DIR / "index.html")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path.startswith("/api/patterns/"):
            name = path[len("/api/patterns/"):]
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self._send_json(400, {"error": "invalid JSON"})
                return
            PATTERNS_DIR.mkdir(exist_ok=True)
            (PATTERNS_DIR / f"{name}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), "utf-8")
            self._send_json(200, {"ok": True})
            return

        self._send_json(404, {"error": "not found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path.startswith("/api/patterns/"):
            name = path[len("/api/patterns/"):]
            file = PATTERNS_DIR / f"{name}.json"
            if file.exists():
                file.unlink()
                self._send_json(200, {"ok": True})
            else:
                self._send_json(404, {"error": "pattern not found"})
            return

        self._send_json(404, {"error": "not found"})

# ── HTTP server thread ────────────────────────────────────────────────────────

def run_http():
    server = ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), Handler)
    print(f"HTTP  -> http://localhost:{HTTP_PORT}")
    server.serve_forever()

# ── WebSocket server ──────────────────────────────────────────────────────────

async def ws_handler(websocket):
    ws_clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        ws_clients.discard(websocket)

async def main():
    global ws_loop
    ws_loop = asyncio.get_running_loop()

    # Watchdog
    observer = Observer()
    handler = ReloadHandler()
    observer.schedule(handler, str(PATTERNS_DIR), recursive=False)
    observer.schedule(handler, str(WEB_DIR), recursive=True)
    observer.start()

    # HTTP thread
    t = threading.Thread(target=run_http, daemon=True)
    t.start()

    # WebSocket
    print(f"WS    -> ws://localhost:{WS_PORT}")
    print("Ctrl+C pour arrêter\n")
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nArrêt.")
