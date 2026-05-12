/**
 * App — entry point. Initializes all modules and wires UI together.
 */

const App = (() => {
  const TRACK_NAMES = ['KICK', 'SNARE', 'HI-HAT', 'OPEN-HH', 'CLAP', 'TOM', 'PERC', 'FX'];
  const NUM_TRACKS  = 8;

  let tracks = [];
  let selectedPattern = null;

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  function init() {
    // Build tracks
    const container = document.getElementById('tracks-container');
    for (let i = 0; i < NUM_TRACKS; i++) {
      const t = new Track({ index: i, name: TRACK_NAMES[i] });
      tracks.push(t);
      container.appendChild(t.el);
    }

    // Global knobs
    Knob.initKnobs(document.getElementById('global-knobs'));

    // Wire global knob events
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

    // Wire sequencer → tracks
    Sequencer.onStep((stepIndex, time) => {
      tracks.forEach((t, ti) => {
        const blended = ABSystem.resolveStep(ti, stepIndex);
        if (blended !== null) {
          // Override live steps with A/B blend result
          const prev = t.steps[stepIndex % t.stepMode];
          t.steps[stepIndex % t.stepMode] = blended;
          t.scheduleStep(stepIndex, time);
          t.steps[stepIndex % t.stepMode] = prev;
        } else {
          t.scheduleStep(stepIndex, time);
        }
      });
    });

    // Compute max stepMode for global step count
    function updateStepCount() {
      const max = tracks.reduce((m, t) => Math.max(m, t.stepMode), 16);
      Sequencer.setStepCount(max);
    }
    // Re-check whenever a track's step mode changes (listen on container)
    container.addEventListener('click', e => {
      if (e.target.matches('.steps-btn')) updateStepCount();
    });

    // Transport
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    document.getElementById('btn-reset').addEventListener('click', () => {
      Sequencer.reset();
      document.getElementById('btn-play').textContent = '▶';
      document.getElementById('btn-play').classList.remove('playing');
    });

    // A/B system
    ABSystem.init(() => tracks);
    document.getElementById('btn-a').addEventListener('click', () => {
      ABSystem.setCrossfader(0);
      document.getElementById('crossfader').value = 0;
      ABSystem.loadFromSet('A');
    });
    document.getElementById('btn-b').addEventListener('click', () => {
      ABSystem.setCrossfader(100);
      document.getElementById('crossfader').value = 100;
      ABSystem.loadFromSet('B');
    });
    document.getElementById('btn-copy-ab').addEventListener('click', () => ABSystem.copyToSet('A'));
    document.getElementById('btn-copy-ba').addEventListener('click', () => ABSystem.copyToSet('B'));
    document.getElementById('crossfader').addEventListener('input', e => {
      ABSystem.setCrossfader(parseInt(e.target.value));
    });

    // Patterns bar
    document.getElementById('btn-save').addEventListener('click', savePattern);
    document.getElementById('btn-load').addEventListener('click', () => {
      const name = selectedPattern || document.getElementById('pattern-name').value.trim();
      if (name) loadPattern(name);
    });
    document.getElementById('btn-delete').addEventListener('click', deletePattern);

    // WebSocket hot-reload
    WSClient.start();

    // Load pattern list
    refreshPatterns();
  }

  // ── Transport ──────────────────────────────────────────────────────────────
  function togglePlay() {
    const btn = document.getElementById('btn-play');
    if (Sequencer.isPlaying) {
      Sequencer.stop();
      btn.textContent = '▶';
      btn.classList.remove('playing');
    } else {
      Sequencer.start();
      btn.textContent = '⏹';
      btn.classList.add('playing');
    }
  }

  // ── Patterns ───────────────────────────────────────────────────────────────
  async function refreshPatterns() {
    try {
      const res = await fetch('/api/patterns');
      const names = await res.json();
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
        chip.addEventListener('dblclick', () => loadPattern(name));
        list.appendChild(chip);
      });
    } catch {}
  }

  function buildStateJSON() {
    return {
      bpm:    Knob.getKnobValue('BPM')    ?? 120,
      swing:  Knob.getKnobValue('SWING')  ?? 0,
      reverb: Knob.getKnobValue('REVERB') ?? 0,
      delay:  Knob.getKnobValue('DELAY')  ?? 0,
      master: Knob.getKnobValue('MASTER') ?? 80,
      tracks: tracks.map(t => t.toJSON()),
    };
  }

  async function savePattern() {
    const name = document.getElementById('pattern-name').value.trim();
    if (!name) return alert('Enter a pattern name');
    await fetch(`/api/patterns/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildStateJSON()),
    });
    selectedPattern = name;
    await refreshPatterns();
  }

  async function loadPattern(name) {
    const res = await fetch(`/api/patterns/${encodeURIComponent(name)}`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.bpm)    Knob.setKnobValue('BPM',    data.bpm);
    if (data.swing)  Knob.setKnobValue('SWING',  data.swing);
    if (data.reverb) Knob.setKnobValue('REVERB', data.reverb);
    if (data.delay)  Knob.setKnobValue('DELAY',  data.delay);
    if (data.master) Knob.setKnobValue('MASTER', data.master);

    if (Array.isArray(data.tracks)) {
      data.tracks.forEach((tdata, i) => {
        if (tracks[i]) tracks[i].fromJSON(tdata);
      });
    }
    selectedPattern = name;
    document.getElementById('pattern-name').value = name;
    await refreshPatterns();
  }

  async function deletePattern() {
    const name = selectedPattern || document.getElementById('pattern-name').value.trim();
    if (!name || !confirm(`Supprimer "${name}" ?`)) return;
    await fetch(`/api/patterns/${encodeURIComponent(name)}`, { method: 'DELETE' });
    selectedPattern = null;
    document.getElementById('pattern-name').value = '';
    await refreshPatterns();
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  });

  return { init, refreshPatterns };
})();

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
