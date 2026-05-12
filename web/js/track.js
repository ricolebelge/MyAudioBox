/**
 * Track — one drum track (row) in the sequencer.
 *
 * Usage:
 *   const t = new Track({ index: 0, name: 'KICK' });
 *   document.getElementById('tracks-container').appendChild(t.el);
 *   t.scheduleStep(stepIndex, time);  // called by Sequencer.onStep
 *
 * Serialization:
 *   t.toJSON()   / t.fromJSON(data)
 */

class Track {
  constructor({ index, name = `T${index + 1}` }) {
    this.index      = index;
    this.name       = name;
    this.steps      = Array(16).fill(false);
    this.stepMode   = 16;      // 8 or 16
    this.sampleUrl  = null;
    this.buffer     = null;
    this.expression = '';
    this.exprError  = false;

    // Knob state
    this.vol    = 80;
    this.pitch  = 50;   // 0→0.5x  50→1x  100→2x
    this.pan    = 50;   // 0→-1  50→0  100→+1
    this.filter = 100;  // 0→200Hz  100→20kHz
    this.send   = 0;    // reverb send %

    this.el = this._render();
    this._bindEvents();
    this._initKnobs();

    // Re-evaluate expression when a $var changes
    this._offVarChange = Expressions.onVarChange(() => this._applyExpression());
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  _render() {
    const el = document.createElement('div');
    el.className = 'track';
    el.dataset.index = this.index;
    el.innerHTML = `
      <div class="track-header">
        <span class="track-name">${this.name}</span>
        <div class="sample-drop" data-role="drop">DROP SAMPLE</div>
        <div class="track-expr-wrap">
          <input class="track-expr" data-role="expr" placeholder="euclidean(5,16)" spellcheck="false" />
        </div>
        <div class="steps-toggle">
          <button class="steps-btn ${this.stepMode===8?'active':''}" data-steps="8">8</button>
          <button class="steps-btn ${this.stepMode===16?'active':''}" data-steps="16">16</button>
        </div>
      </div>

      <div class="track-grid" data-role="grid">
        ${this._renderGrid()}
      </div>

      <div class="track-knobs">
        <div class="knob-wrap">
          <canvas class="knob" data-name="VOL_${this.index}"   data-min="0"  data-max="100" data-value="80"  tabindex="0"></canvas>
          <span class="knob-label">VOL</span>
          <span class="knob-val" data-for="VOL_${this.index}">80</span>
        </div>
        <div class="knob-wrap">
          <canvas class="knob" data-name="PITCH_${this.index}" data-min="0"  data-max="100" data-value="50"  tabindex="0"></canvas>
          <span class="knob-label">PITCH</span>
          <span class="knob-val" data-for="PITCH_${this.index}">50</span>
        </div>
        <div class="knob-wrap">
          <canvas class="knob" data-name="PAN_${this.index}"   data-min="0"  data-max="100" data-value="50"  tabindex="0"></canvas>
          <span class="knob-label">PAN</span>
          <span class="knob-val" data-for="PAN_${this.index}">50</span>
        </div>
        <div class="knob-wrap">
          <canvas class="knob" data-name="FILT_${this.index}"  data-min="0"  data-max="100" data-value="100" tabindex="0"></canvas>
          <span class="knob-label">FILT</span>
          <span class="knob-val" data-for="FILT_${this.index}">100</span>
        </div>
        <div class="knob-wrap">
          <canvas class="knob" data-name="SEND_${this.index}"  data-min="0"  data-max="100" data-value="0"   tabindex="0"></canvas>
          <span class="knob-label">SEND</span>
          <span class="knob-val" data-for="SEND_${this.index}">0</span>
        </div>
      </div>
    `;
    return el;
  }

  _renderGrid() {
    const n = this.stepMode;
    const cls = n === 16 ? 's16' : '';
    let html = `<div class="step-row ${cls}">`;
    for (let i = 0; i < n; i++) {
      const active = this.steps[i] ? 'active' : '';
      html += `<div class="step ${active}" data-step="${i}"></div>`;
    }
    html += '</div>';
    return html;
  }

  _refreshGrid() {
    const grid = this.el.querySelector('[data-role="grid"]');
    grid.innerHTML = this._renderGrid();
    this._bindGridDrag();
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  _bindEvents() {
    // Steps toggle
    this.el.querySelectorAll('.steps-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.dataset.steps);
        this._setStepMode(n);
      });
    });

    // Expression input
    const exprInput = this.el.querySelector('[data-role="expr"]');
    exprInput.addEventListener('input', () => {
      this.expression = exprInput.value;
      this._applyExpression();
    });

    // Drag & drop samples
    const drop = this.el.querySelector('[data-role="drop"]');
    drop.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'audio/*';
      inp.onchange = e => {
        if (e.target.files[0]) this._loadFile(e.target.files[0]);
      };
      inp.click();
    });

    this.el.addEventListener('dragover', e => {
      e.preventDefault();
      this.el.classList.add('drag-over');
    });
    this.el.addEventListener('dragleave', () => this.el.classList.remove('drag-over'));
    this.el.addEventListener('drop', e => {
      e.preventDefault();
      this.el.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) this._loadFile(file);
    });

    this._bindGridDrag();
  }

  _bindGridDrag() {
    const grid = this.el.querySelector('[data-role="grid"]');
    let painting = null; // true = activate, false = deactivate

    const getStep = el => el.dataset.step !== undefined ? el : null;

    grid.addEventListener('mousedown', e => {
      const stepEl = getStep(e.target);
      if (!stepEl) return;
      e.preventDefault();
      const i = parseInt(stepEl.dataset.step);
      painting = !this.steps[i];
      this._setStep(i, painting);
    });

    grid.addEventListener('mouseover', e => {
      if (painting === null) return;
      const stepEl = getStep(e.target);
      if (!stepEl) return;
      this._setStep(parseInt(stepEl.dataset.step), painting);
    });

    document.addEventListener('mouseup', () => { painting = null; });
  }

  // ── Step logic ─────────────────────────────────────────────────────────────
  _setStep(index, active) {
    this.steps[index] = active;
    const stepEl = this.el.querySelector(`[data-step="${index}"]`);
    if (stepEl) stepEl.classList.toggle('active', active);
  }

  _setStepMode(n) {
    this.stepMode = n;
    if (this.steps.length < n) {
      while (this.steps.length < n) this.steps.push(false);
    }
    this.el.querySelectorAll('.steps-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.steps) === n)
    );
    this._refreshGrid();
    this._applyExpression();
  }

  _applyExpression() {
    if (!this.expression.trim()) { this.exprError = false; return; }
    const result = Expressions.evaluate(this.expression, this.stepMode);
    const input = this.el.querySelector('[data-role="expr"]');
    if (result === null) {
      this.exprError = true;
      input.classList.add('error');
    } else {
      this.exprError = false;
      input.classList.remove('error');
      result.forEach((v, i) => this._setStep(i, v));
    }
  }

  // ── Sample loading ─────────────────────────────────────────────────────────
  async _loadFile(file) {
    try {
      Audio.init();
      const { url, buffer } = await Audio.loadFile(file);
      this.sampleUrl = url;
      this.buffer    = buffer;
      const drop = this.el.querySelector('[data-role="drop"]');
      drop.textContent = file.name;
      drop.classList.add('loaded');
    } catch (e) {
      console.error('Sample load failed:', e);
    }
  }

  async loadFromUrl(url) {
    try {
      Audio.init();
      this.sampleUrl = url;
      this.buffer = await Audio.loadSample(url);
      const drop = this.el.querySelector('[data-role="drop"]');
      drop.textContent = url.split('/').pop();
      drop.classList.add('loaded');
    } catch (e) {
      console.error('Sample load failed:', e);
    }
  }

  // ── Knobs ──────────────────────────────────────────────────────────────────
  _initKnobs() {
    Knob.initKnobs(this.el);
    this.el.addEventListener('knob:change', e => {
      const { name, value } = e.detail;
      if (name === `VOL_${this.index}`)   this.vol    = value;
      if (name === `PITCH_${this.index}`) this.pitch  = value;
      if (name === `PAN_${this.index}`)   this.pan    = value;
      if (name === `FILT_${this.index}`)  this.filter = value;
      if (name === `SEND_${this.index}`)  this.send   = value;
    });
  }

  // ── Sequencer callback ─────────────────────────────────────────────────────
  scheduleStep(globalStep, time) {
    const localStep = globalStep % this.stepMode;
    this._highlightStep(localStep);
    if (!this.steps[localStep] || !this.buffer) return;

    Audio.playStep(this.buffer, time, {
      vol:        this.vol / 100,
      pitch:      Math.pow(2, (this.pitch - 50) / 50),  // 0.5x – 2x
      pan:        (this.pan - 50) / 50,                 // -1 to +1
      filterFreq: 200 + (this.filter / 100) * 19800,    // 200–20000 Hz
      sendReverb: this.send / 100,
      sendDelay:  0,
    });
  }

  _highlightStep(index) {
    const grid = this.el.querySelector('[data-role="grid"]');
    if (!grid) return;
    grid.querySelectorAll('.step').forEach((el, i) => {
      el.classList.toggle('current', i === index);
    });
  }

  // ── Serialization ──────────────────────────────────────────────────────────
  toJSON() {
    return {
      name:       this.name,
      steps:      this.steps.slice(0, this.stepMode),
      stepMode:   this.stepMode,
      expression: this.expression,
      sampleUrl:  this.sampleUrl,
      vol:        this.vol,
      pitch:      this.pitch,
      pan:        this.pan,
      filter:     this.filter,
      send:       this.send,
    };
  }

  fromJSON(data) {
    if (data.stepMode && data.stepMode !== this.stepMode) this._setStepMode(data.stepMode);
    if (data.steps) {
      this.steps = [...data.steps];
      while (this.steps.length < this.stepMode) this.steps.push(false);
      this._refreshGrid();
    }
    if (data.expression !== undefined) {
      this.expression = data.expression;
      const inp = this.el.querySelector('[data-role="expr"]');
      if (inp) inp.value = data.expression;
      this._applyExpression();
    }
    if (data.sampleUrl) this.loadFromUrl(data.sampleUrl);

    const setK = (suffix, val) => Knob.setKnobValue(`${suffix}_${this.index}`, val);
    if (data.vol   !== undefined) { this.vol    = data.vol;   setK('VOL',   data.vol); }
    if (data.pitch !== undefined) { this.pitch  = data.pitch; setK('PITCH', data.pitch); }
    if (data.pan   !== undefined) { this.pan    = data.pan;   setK('PAN',   data.pan); }
    if (data.filter!== undefined) { this.filter = data.filter;setK('FILT',  data.filter); }
    if (data.send  !== undefined) { this.send   = data.send;  setK('SEND',  data.send); }
  }

  destroy() {
    if (this._offVarChange) this._offVarChange();
    this.el.remove();
  }
}
