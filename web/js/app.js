const App = (() => {
  const TRACK_NAMES = ['KICK', 'SNARE', 'HI-HAT', 'OPEN-HH', 'CLAP', 'TOM', 'PERC', 'FX'];

  let tracksA = [];   // Set A — indices 0–7  (sequencer live)
  let tracksB = [];   // Set B — indices 8–15 (crossfader target)
  let selectedPattern = null;

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  function init() {
    const contA = document.getElementById('tracks-a');
    const contB = document.getElementById('tracks-b');

    TRACK_NAMES.forEach((name, i) => {
      const ta = new Track({ index: i,     name });
      const tb = new Track({ index: i + 8, name });
      tracksA.push(ta);
      tracksB.push(tb);
      contA.appendChild(ta.el);
      contB.appendChild(tb.el);
    });

    // Global knobs
    Knob.initKnobs(document.getElementById('global-knobs'));

    document.addEventListener('knob:change', e => {
      const { name, value } = e.detail;
      switch (name) {
        case 'BPM':    Sequencer.setBpm(value); break;
        case 'SWING':  Sequencer.setSwing(value); break;
        case 'REVERB': Audio.setReverb(value / 100); break;
        case 'DELAY':  Audio.setDelay(value / 100, Sequencer.bpm); break;
        case 'MASTER': Audio.setMaster(value / 100); break;
      }
    });

    // Sequencer → audio scheduling only (visual cursor handled by rAF below)
    Sequencer.onStep((stepIndex, time) => {
      tracksA.forEach((t, ti) => {
        const blended = ABSystem.resolveStep(ti, stepIndex);
        if (blended !== null) {
          const prev = t.steps[stepIndex % t.stepMode];
          t.steps[stepIndex % t.stepMode] = blended;
          t.scheduleStep(stepIndex, time, tracksB[ti]?.buffer || null);
          t.steps[stepIndex % t.stepMode] = prev;
        } else {
          t.scheduleStep(stepIndex, time);
        }
      });
    });

    // Max step count across all tracks
    function updateStepCount() {
      const max = [...tracksA, ...tracksB].reduce((m, t) => Math.max(m, t.stepMode), 16);
      Sequencer.setStepCount(max);
    }
    contA.addEventListener('click', e => { if (e.target.matches('.steps-btn')) updateStepCount(); });
    contB.addEventListener('click', e => { if (e.target.matches('.steps-btn')) updateStepCount(); });

    // Transport
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    document.getElementById('btn-reset').addEventListener('click', () => {
      Sequencer.reset();
      const btn = document.getElementById('btn-play');
      btn.textContent = '▶';
      btn.classList.remove('playing');
    });

    // A/B system
    ABSystem.init(() => tracksA, () => tracksB);

    const cfEl = document.getElementById('crossfader');
    function updateCrossfader(v) {
      ABSystem.setCrossfader(v);
      cfEl.style.setProperty('--cf-val', v + '%');
    }

    document.getElementById('btn-a').addEventListener('click', () => {
      cfEl.value = 0;
      updateCrossfader(0);
    });
    document.getElementById('btn-b').addEventListener('click', () => {
      cfEl.value = 100;
      updateCrossfader(100);
    });
    document.getElementById('btn-copy-ab').addEventListener('click', () => {
      ABSystem.copyAtoB();
    });
    document.getElementById('btn-copy-ba').addEventListener('click', () => {
      ABSystem.copyBtoA();
    });
    cfEl.addEventListener('input', e => {
      updateCrossfader(parseInt(e.target.value));
    });


    // Patterns bar
    document.getElementById('btn-save').addEventListener('click', savePattern);
    document.getElementById('btn-load-a').addEventListener('click', () => {
      const name = selectedPattern || document.getElementById('pattern-name').value.trim();
      if (name) loadPatternToSet(name, 'A');
    });
    document.getElementById('btn-load-b').addEventListener('click', () => {
      const name = selectedPattern || document.getElementById('pattern-name').value.trim();
      if (name) loadPatternToSet(name, 'B');
    });
    document.getElementById('btn-delete').addEventListener('click', deletePattern);

    // Visual cursor — driven by AudioContext time, not the look-ahead scheduler
    let _lastVS = -2;
    (function _rafLoop() {
      const vs = Sequencer.isPlaying ? Sequencer.getVisualStep() : -1;
      if (vs !== _lastVS) {
        tracksA.forEach(t => t.tick(vs));
        tracksB.forEach(t => t.tick(vs));
        _lastVS = vs;
      }
      requestAnimationFrame(_rafLoop);
    }());

    WSClient.start();
    refreshPatterns();
    refreshSamples();
  }

  async function refreshSamples() {
    try {
      const res = await fetch('/api/samples');
      if (!res.ok) return;
      const names = await res.json();
      [...tracksA, ...tracksB].forEach(t => t.setSampleList(names));
    } catch {}
  }

  // ── Transport ──────────────────────────────────────────────────────────────
  function togglePlay() {
    const btn = document.getElementById('btn-play');
    if (Sequencer.isPlaying) {
      Sequencer.stop();
      btn.textContent = '▶';
      btn.classList.remove('playing');
    } else {
      Audio.init();
      Audio.ctx?.resume();
      Sequencer.start();
      btn.textContent = '⏹';
      btn.classList.add('playing');
    }
  }

  // ── Pattern storage (HTTP or localStorage fallback) ────────────────────────
  const LS_KEY = 'angelsaudiobox_patterns';

  function lsGetAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
  }
  function lsSave(name, data)  { const all = lsGetAll(); all[name] = data; localStorage.setItem(LS_KEY, JSON.stringify(all)); }
  function lsDelete(name)      { const all = lsGetAll(); delete all[name]; localStorage.setItem(LS_KEY, JSON.stringify(all)); }

  // ── Patterns ───────────────────────────────────────────────────────────────
  async function refreshPatterns() {
    let names = [];
    try {
      const res = await fetch('/api/patterns');
      if (res.ok) names = await res.json(); else throw 0;
    } catch {
      names = Object.keys(lsGetAll());
    }
    const list = document.getElementById('patterns-list');
    list.innerHTML = '';
    names.forEach(name => {
      const chip = document.createElement('button');
      chip.className = 'pattern-chip' + (name === selectedPattern ? ' selected' : '');
      chip.textContent = name;
      chip.addEventListener('click', () => {
        selectedPattern = name;
        document.getElementById('pattern-name').value = name;
        list.querySelectorAll('.pattern-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
      chip.addEventListener('dblclick', () => loadPatternToSet(name, 'A'));
      list.appendChild(chip);
    });
  }

  function buildStateJSON() {
    return {
      bpm:     Knob.getKnobValue('BPM')    ?? 120,
      swing:   Knob.getKnobValue('SWING')  ?? 0,
      reverb:  Knob.getKnobValue('REVERB') ?? 0,
      delay:   Knob.getKnobValue('DELAY')  ?? 0,
      master:  Knob.getKnobValue('MASTER') ?? 80,
      tracksA: tracksA.map(t => t.toJSON()),
      tracksB: tracksB.map(t => t.toJSON()),
    };
  }

  async function savePattern() {
    const name = document.getElementById('pattern-name').value.trim();
    if (!name) return alert('Enter a pattern name');
    const payload = buildStateJSON();
    let saved = false;
    try {
      const res = await fetch(`/api/patterns/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) saved = true;
    } catch {}
    if (!saved) lsSave(name, payload);
    selectedPattern = name;
    await refreshPatterns();
  }

  async function _fetchPattern(name) {
    let data = null;
    try {
      const res = await fetch(`/api/patterns/${encodeURIComponent(name)}`);
      if (res.ok) data = await res.json();
    } catch {}
    return data || lsGetAll()[name] || null;
  }

  async function loadPatternToSet(name, set) {
    const data = await _fetchPattern(name);
    if (!data) return;

    // Primary tracks stored in tracksA; fall back to legacy 'tracks' key
    const tracks = data.tracksA || data.tracks || [];

    if (set === 'A') {
      tracks.forEach((d, i) => { if (tracksA[i]) tracksA[i].fromJSON(d); });
    } else {
      tracks.forEach((d, i) => { if (tracksB[i]) tracksB[i].fromJSON(d); });
    }

    selectedPattern = name;
    document.getElementById('pattern-name').value = name;
    await refreshPatterns();
  }

  async function deletePattern() {
    const name = selectedPattern || document.getElementById('pattern-name').value.trim();
    if (!name || !confirm(`Supprimer "${name}" ?`)) return;
    let deleted = false;
    try {
      const res = await fetch(`/api/patterns/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (res.ok) deleted = true;
    } catch {}
    if (!deleted) lsDelete(name);
    selectedPattern = null;
    document.getElementById('pattern-name').value = '';
    await refreshPatterns();
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  });

  return { init, refreshPatterns };
})();

document.addEventListener('DOMContentLoaded', App.init);
