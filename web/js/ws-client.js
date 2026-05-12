/**
 * WSClient — WebSocket connection to the Python server for hot-reload.
 * Reconnects automatically every 2 seconds when disconnected.
 *
 * Messages from server:
 *   { type: "reload", file: "..." }
 *     - If file is a pattern (.json) → reload pattern list only
 *     - Otherwise → full page reload
 */

const WSClient = (() => {
  const WS_URL = `ws://${location.hostname}:8001`;
  let ws = null;
  let retryTimer = null;
  const isFileProtocol = location.protocol === 'file:';

  function connect() {
    if (isFileProtocol) return; // no server in file:// mode
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[WS] Connected');
        clearTimeout(retryTimer);
      };

      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'reload') {
            const file = (msg.file || '').replace(/\\/g, '/');
            if (file.endsWith('.json') && file.includes('patterns')) {
              // Soft reload: refresh pattern list
              if (typeof App !== 'undefined' && App.refreshPatterns) {
                App.refreshPatterns();
              }
            } else if (!file.includes('patterns')) {
              // Hard reload for CSS/JS changes
              window.location.reload();
            }
          }
        } catch {}
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        console.log('[WS] Disconnected — retry in 2s');
        retryTimer = setTimeout(connect, 2000);
      };
    } catch {
      retryTimer = setTimeout(connect, 2000);
    }
  }

  function start() {
    connect();
  }

  return { start };
})();
