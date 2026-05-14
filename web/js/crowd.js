const Crowd = (() => {
  const WS_URL = `ws://${location.hostname}:8002`;
  let ws = null;
  let retryTimer = null;
  const isFile = location.protocol === 'file:';

  // Persistent state — never reset on reconnect or new crowd_update
  const _s = {
    votes:    { encore: 0, stop: 0, change: 0 },
    bpm:      { faster: 0, slower: 0, delta: 0 },
    genres:   [],
    messages: [],   // full client-side history
  };
  const _seen = new Set();  // deduplicate messages across reconnects

  // ── Merge ────────────────────────────────────────────────────────────────
  // votes/bpm/genres: server is authoritative (it accumulates since last /reset)
  // messages: client keeps full history, appends only new entries

  function _merge(data) {
    if (data.votes)  Object.assign(_s.votes, data.votes);
    if (data.bpm)    Object.assign(_s.bpm,   data.bpm);
    if (data.genres) _s.genres = data.genres;

    for (const m of (data.messages || [])) {
      if (!_seen.has(m)) {
        _seen.add(m);
        _s.messages.push(m);
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function pct(n, max) {
    return max > 0 ? Math.round((n / max) * 100) : 0;
  }

  function voteRow(label, n, max, colorClass = '') {
    return `<div class="cv-row">
      <span class="cv-label">${label}</span>
      <div class="cv-bar"><div class="cv-fill${colorClass ? ' ' + colorClass : ''}" style="width:${pct(n, max)}%"></div></div>
      <span class="cv-count">${n}</span>
    </div>`;
  }

  function render() {
    const el = document.getElementById('crowd-live');
    if (!el) return;

    const { votes, bpm, genres, messages } = _s;

    const totalVotes = Math.max(1, votes.encore + votes.stop + votes.change);
    const maxBpm     = Math.max(1, bpm.faster, bpm.slower);
    const delta      = bpm.delta;
    const deltaClass = delta > 0 ? 'cv-delta--pos' : delta < 0 ? 'cv-delta--neg' : '';
    const deltaStr   = delta > 0 ? `+${delta}` : `${delta}`;

    const genresHtml = genres.length
      ? genres.slice(-10).reverse().map(g => `<span class="genre-chip">${g}</span>`).join('')
      : '<span class="cv-empty">—</span>';

    const msgsHtml = messages.length
      ? messages.slice().reverse().map(m => `<div class="crowd-item">${m}</div>`).join('')
      : '<div class="cv-empty">— en attente —</div>';

    el.innerHTML = `
      <div class="crowd-title">LIVE</div>

      <div class="crowd-section">
        <div class="cv-section-label">VOTES</div>
        ${voteRow('ENCORE', votes.encore, totalVotes)}
        ${voteRow('STOP',   votes.stop,   totalVotes, 'cv-fill--red')}
        ${voteRow('CHANGE', votes.change, totalVotes, 'cv-fill--dim')}
      </div>

      <div class="crowd-section">
        <div class="cv-section-label">BPM</div>
        ${voteRow('FASTER', bpm.faster, maxBpm, 'cv-fill--green')}
        ${voteRow('SLOWER', bpm.slower, maxBpm, 'cv-fill--blue')}
        <div class="cv-delta-row">
          <span class="cv-section-label">DELTA</span>
          <span class="cv-delta ${deltaClass}">${deltaStr}</span>
        </div>
      </div>

      <div class="crowd-section">
        <div class="cv-section-label">GENRES</div>
        <div class="crowd-genre-list">${genresHtml}</div>
      </div>

      <div class="crowd-section crowd-section--msgs">
        <div class="cv-section-label">FEED</div>
        ${msgsHtml}
      </div>`;
  }

  // ── WebSocket ────────────────────────────────────────────────────────────

  function connect() {
    if (isFile) return;
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        clearTimeout(retryTimer);
        console.log('[Crowd] connected :8002');
      };

      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'crowd_update') { _merge(msg); render(); }
        } catch {}
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        // keep showing last known state — do NOT reset _s
        retryTimer = setTimeout(connect, 2000);
      };
    } catch {
      retryTimer = setTimeout(connect, 2000);
    }
  }

  function start() { connect(); }

  return { start };
})();

document.addEventListener('DOMContentLoaded', () => Crowd.start());
