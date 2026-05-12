/**
 * Knob — canvas-based rotary knob.
 * Each <canvas class="knob"> element is upgraded by initKnobs().
 *
 * data attributes:
 *   data-name    required  unique identifier
 *   data-min     default 0
 *   data-max     default 100
 *   data-value   default 0
 *   data-step    default 1
 *   data-var     optional  "$varname" → publishes to Expressions registry
 *
 * Events dispatched on the canvas element:
 *   "knob:change" → { detail: { name, value } }
 */

const Knob = (() => {
  const YELLOW = '#F0B90B';
  const BG     = '#1a1a1a';
  const TRACK  = '#2a2a2a';
  const START_ANGLE = Math.PI * 0.75;   // 135°
  const SWEEP       = Math.PI * 1.5;    // 270°
  const DRAG_SENSITIVITY = 0.4;         // px per unit

  function draw(canvas, normalized) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const r  = Math.min(W, H) / 2 - 3;

    ctx.clearRect(0, 0, W, H);

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = BG;
    ctx.fill();

    // Track arc (grey)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, START_ANGLE, START_ANGLE + SWEEP);
    ctx.strokeStyle = TRACK;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Value arc (yellow)
    const endAngle = START_ANGLE + SWEEP * normalized;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, START_ANGLE, endAngle);
    ctx.strokeStyle = YELLOW;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Indicator dot
    const dotAngle = endAngle;
    const dotR = r - 6;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(dotAngle) * dotR,
      cy + Math.sin(dotAngle) * dotR,
      2.5, 0, Math.PI * 2
    );
    ctx.fillStyle = YELLOW;
    ctx.fill();
  }

  function normalize(value, min, max) {
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function upgrade(canvas) {
    const name  = canvas.dataset.name  || 'knob';
    const min   = parseFloat(canvas.dataset.min   ?? 0);
    const max   = parseFloat(canvas.dataset.max   ?? 100);
    const step  = parseFloat(canvas.dataset.step  ?? 1);
    const varName = canvas.dataset.var || null;

    let value = parseFloat(canvas.dataset.value ?? min);

    // Set canvas internal resolution
    const size = canvas.offsetWidth || 40;
    canvas.width  = size * devicePixelRatio;
    canvas.height = size * devicePixelRatio;

    function setValue(v, source) {
      value = Math.round(clamp(v, min, max) / step) * step;
      draw(canvas, normalize(value, min, max));
      updateLabel(canvas, name, value);
      canvas.dispatchEvent(new CustomEvent('knob:change', {
        bubbles: true,
        detail: { name, value, source: source || 'user' }
      }));
      if (varName && typeof Expressions !== 'undefined') {
        Expressions.setVar(varName, normalize(value, min, max));
      }
    }

    // Initial draw
    draw(canvas, normalize(value, min, max));

    // ── Drag ──────────────────────────────────────────────────────────────
    let dragStart = null;
    let dragValue = null;

    canvas.addEventListener('mousedown', e => {
      e.preventDefault();
      dragStart = e.clientY;
      dragValue = value;
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', onUp);
    });

    function onDrag(e) {
      const delta = (dragStart - e.clientY) * DRAG_SENSITIVITY;
      setValue(dragValue + delta * (max - min) / 100);
    }

    function onUp() {
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onUp);
    }

    // ── Dblclick → inline edit ─────────────────────────────────────────────
    canvas.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = value;
      input.style.cssText = `
        position:absolute; width:50px; font-family:monospace; font-size:10px;
        background:#111; color:#F0B90B; border:1px solid #F0B90B;
        border-radius:3px; text-align:center; z-index:100; padding:2px;
      `;
      const rect = canvas.getBoundingClientRect();
      input.style.left = (rect.left + window.scrollX) + 'px';
      input.style.top  = (rect.top  + window.scrollY + rect.height) + 'px';
      document.body.appendChild(input);
      input.focus();
      input.select();
      function commit() {
        setValue(parseFloat(input.value) || value);
        input.remove();
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') input.remove();
      });
    });

    // ── Keyboard ───────────────────────────────────────────────────────────
    canvas.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp')   { e.preventDefault(); setValue(value + step); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setValue(value - step); }
    });

    // ── Touch ──────────────────────────────────────────────────────────────
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      dragStart = e.touches[0].clientY;
      dragValue = value;
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const delta = (dragStart - e.touches[0].clientY) * DRAG_SENSITIVITY;
      setValue(dragValue + delta * (max - min) / 100);
    }, { passive: false });

    // ── Public API on element ──────────────────────────────────────────────
    canvas._knob = { getValue: () => value, setValue };
  }

  function updateLabel(canvas, name, value) {
    const label = document.querySelector(`.knob-val[data-for="${name}"]`);
    if (label) label.textContent = Math.round(value * 10) / 10;
  }

  function initKnobs(root = document) {
    root.querySelectorAll('canvas.knob').forEach(upgrade);
  }

  function getKnobValue(name) {
    const el = document.querySelector(`canvas.knob[data-name="${name}"]`);
    return el?._knob?.getValue() ?? null;
  }

  function setKnobValue(name, value, silent = false) {
    const el = document.querySelector(`canvas.knob[data-name="${name}"]`);
    if (el?._knob) el._knob.setValue(value, silent ? 'load' : 'user');
  }

  return { initKnobs, getKnobValue, setKnobValue, upgrade };
})();
