const SLOT_LABELS = ['A','B','C','D','E','F','G','H'];

class Track {
  constructor({ index, name = `T${index + 1}` }) {
    this.index      = index;
    this.name       = name;
    this.steps      = Array(16).fill(false);
    this.stepMode   = 16;
    this.sampleUrl  = null;
    this.sampleName = null;
    this.buffer     = null;
    this.expression = '';
    this.exprError  = false;

    this.vol    = 80;
    this.pitch  = 50;
    this.pan    = 50;
    this.filter = 100;
    this.send   = 0;

    // 8 slot memories per track (store step patterns)
    this.slotData    = Array(8).fill(null);
    this.activeSlot  = null;

    this.el = this._render();
    this._bindEvents();
    this._initKnobs();

    this._offVarChange = Expressions.onVarChange(() => this._applyExpression());
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  _render() {
    const el = document.createElement('div');
    el.className = 'track';
    el.dataset.index = this.index;
    el.innerHTML = `
      <!-- Row 1: name · expr · drop -->
      <div class="track-top">
        <span class="track-name">${this.name}</span>
        <input class="track-expr" data-role="expr" placeholder="euclidean(5,16)" spellcheck="false" />
        <span class="sample-name" data-role="sample-name">—</span>
        <label class="drop-btn" data-role="drop" title="Charger un fichier audio local">
          <input type="file" accept=".wav,.mp3,.ogg,.flac,.aif,.aiff" style="display:none" data-role="file-input">
          &#x2B06; FILE
        </label>
      </div>

      <!-- Row 2: slots A–H · step toggle -->
      <div class="track-slots">
        ${SLOT_LABELS.map((l, i) => `<button class="slot-btn" data-slot="${i}">${l}</button>`).join('')}
        <span class="slot-sep"></span>
        <div class="steps-toggle">
          <button class="steps-btn ${this.stepMode===8?'active':''}" data-steps="8">8</button>
          <button class="steps-btn ${this.stepMode===16?'active':''}" data-steps="16">16</button>
        </div>
      </div>

      <!-- Row 3: step grid -->
      <div class="track-grid" data-role="grid">
        ${this._renderGrid()}
      </div>

      <!-- Row 4: knobs -->
      <div class="track-knobs">
        <div class="knob-wrap">
          <canvas class="knob" data-name="VOL_${this.index}"   data-min="0" data-max="100" data-value="80"  tabindex="0"></canvas>
          <span class="knob-label">VOL</span>
          <span class="knob-val" data-for="VOL_${this.index}">80</span>
        </div>
        <div class="knob-wrap">
          <canvas class="knob" data-name="PCH_${this.index}"   data-min="0" data-max="100" data-value="50"  tabindex="0"></canvas>
          <span class="knob-label">PCH</span>
          <span class="knob-val" data-for="PCH_${this.index}">50</span>
        </div>
        <div class="knob-wrap">
          <canvas class="knob" data-name="PAN_${this.index}"   data-min="0" data-max="100" data-value="50"  tabindex="0"></canvas>
          <span class="knob-label">PAN</span>
          <span class="knob-val" data-for="PAN_${this.index}">50</span>
        </div>
        <div class="knob-wrap">
          <canvas class="knob" data-name="FLT_${this.index}"   data-min="0" data-max="100" data-value="100" tabindex="0"></canvas>
          <span class="knob-label">FLT</span>
          <span class="knob-val" data-for="FLT_${this.index}">100</span>
        </div>
        <div class="knob-wrap">
          <canvas class="knob" data-name="SND_${this.index}"   data-min="0" data-max="100" data-value="0"   tabindex="0"></canvas>
          <span class="knob-label">SND</span>
          <span class="knob-val" data-for="SND_${this.index}">0</span>
        </div>
      </div>
    `;
    return el;
  }

  _renderGrid() {
    const n   = this.stepMode;
    const cls = n === 16 ? 's16' : 's8';
    let html  = `<div class="step-row ${cls}">`;
    for (let i = 0; i < n; i++) {
      html += `<div class="step${this.steps[i] ? ' active' : ''}" data-step="${i}"></div>`;
    }
    return html + '</div>';
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
      btn.addEventListener('click', () => this._setStepMode(parseInt(btn.dataset.steps)));
    });

    // Expression input
    const exprInput = this.el.querySelector('[data-role="expr"]');
    exprInput.addEventListener('input', () => {
      this.expression = exprInput.value;
      this._applyExpression();
    });

    // File input inside the label
    const fileInput = this.el.querySelector('[data-role="file-input"]');
    fileInput.addEventListener('change', e => {
      if (e.target.files[0]) this._loadFile(e.target.files[0]);
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
      if (file?.type.startsWith('audio/')) this._loadFile(file);
    });

    // Slot buttons: left-click = store if empty / recall if filled
    //               right-click = always store
    this.el.querySelectorAll('.slot-btn').forEach(btn => {
      const si = parseInt(btn.dataset.slot);
      btn.addEventListener('click', () => {
        if (this.slotData[si] === null) {
          this._slotStore(si);
        } else {
          this._slotRecall(si);
        }
      });
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        this._slotStore(si);
      });
    });

    this._bindGridDrag();
  }

  _bindGridDrag() {
    const grid = this.el.querySelector('[data-role="grid"]');
    let painting = null;

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
      if (stepEl) this._setStep(parseInt(stepEl.dataset.step), painting);
    });

    document.addEventListener('mouseup', () => { painting = null; });
  }

  // ── Slot memories ──────────────────────────────────────────────────────────
  _slotStore(si) {
    this.slotData[si] = this.steps.slice(0, this.stepMode);
    this.activeSlot   = si;
    this._refreshSlots();
  }

  _slotRecall(si) {
    const data = this.slotData[si];
    if (!data) return;
    data.forEach((v, i) => this._setStep(i, v));
    // clear steps beyond stored length
    for (let i = data.length; i < this.stepMode; i++) this._setStep(i, false);
    this.activeSlot = si;
    this._refreshSlots();
  }

  _refreshSlots() {
    this.el.querySelectorAll('.slot-btn').forEach((btn, i) => {
      btn.classList.toggle('filled',  this.slotData[i] !== null && i !== this.activeSlot);
      btn.classList.toggle('active',  i === this.activeSlot);
    });
  }

  // ── Step logic ─────────────────────────────────────────────────────────────
  _setStep(index, active) {
    this.steps[index] = active;
    const stepEl = this.el.querySelector(`[data-step="${index}"]`);
    if (stepEl) stepEl.classList.toggle('active', active);
  }

  _setStepMode(n) {
    this.stepMode = n;
    while (this.steps.length < n) this.steps.push(false);
    this.el.querySelectorAll('.steps-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.steps) === n)
    );
    this._refreshGrid();
    this._applyExpression();
  }

  _applyExpression() {
    if (!this.expression.trim()) { this.exprError = false; return; }
    const result = Expressions.evaluate(this.expression, this.stepMode);
    const input  = this.el.querySelector('[data-role="expr"]');
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
      this.sampleUrl  = url;
      this.buffer     = buffer;
      this.sampleName = file.name;
      this._showSampleName(file.name);
    } catch (e) {
      console.error('Sample load failed:', e);
    }
  }

  async loadFromUrl(url, displayName = null) {
    try {
      Audio.init();
      this.sampleUrl  = url;
      this.buffer     = await Audio.loadSample(url);
      const name      = displayName || url.split('/').pop();
      this.sampleName = name;
      this._showSampleName(name);
    } catch (e) {
      console.error('Sample load failed:', e);
    }
  }

  _showSampleName(name) {
    const el = this.el.querySelector('[data-role="sample-name"]');
    if (el) el.textContent = name;
  }

  // ── Knobs ──────────────────────────────────────────────────────────────────
  _initKnobs() {
    Knob.initKnobs(this.el);
    this.el.addEventListener('knob:change', e => {
      const { name, value } = e.detail;
      if (name === `VOL_${this.index}`)  this.vol    = value;
      if (name === `PCH_${this.index}`)  this.pitch  = value;
      if (name === `PAN_${this.index}`)  this.pan    = value;
      if (name === `FLT_${this.index}`)  this.filter = value;
      if (name === `SND_${this.index}`)  this.send   = value;
    });
  }

  // ── Sequencer callback ─────────────────────────────────────────────────────
  tick(globalStep) {
    this._highlightStep(globalStep % this.stepMode);
  }

  scheduleStep(globalStep, time, bufferOverride = null) {
    const localStep = globalStep % this.stepMode;
    if (!this.steps[localStep]) return;
    const buf = bufferOverride || this.buffer;
    if (!buf) return;

    Audio.playStep(buf, time, {
      vol:        this.vol / 100,
      pitch:      Math.pow(2, (this.pitch - 50) / 50),
      pan:        (this.pan - 50) / 50,
      filterFreq: 200 + (this.filter / 100) * 19800,
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

  // ── Knob reset ─────────────────────────────────────────────────────────────
  resetKnobs() {
    this.vol = 80; this.pitch = 50; this.pan = 50; this.filter = 100; this.send = 0;
    const s = (prefix, val) => Knob.setKnobValue(`${prefix}_${this.index}`, val);
    s('VOL', 80); s('PCH', 50); s('PAN', 50); s('FLT', 100); s('SND', 0);
  }

  // ── Serialization ──────────────────────────────────────────────────────────
  toJSON() {
    return {
      name:       this.name,
      steps:      this.steps.slice(0, this.stepMode),
      stepMode:   this.stepMode,
      expression: this.expression,
      sampleUrl:  this.sampleUrl,
      sampleName: this.sampleName,
      vol:        this.vol,
      pitch:      this.pitch,
      pan:        this.pan,
      filter:     this.filter,
      send:       this.send,
      slotData:   this.slotData,
    };
  }

  fromJSON(data) {
    this.resetKnobs();
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
    if (data.sampleUrl) this.loadFromUrl(data.sampleUrl, data.sampleName || null);
    if (Array.isArray(data.slotData)) {
      this.slotData = data.slotData;
      this._refreshSlots();
    }

    const setK = (prefix, val) => Knob.setKnobValue(`${prefix}_${this.index}`, val);
    if (data.vol    !== undefined) { this.vol    = data.vol;    setK('VOL', data.vol);   }
    if (data.pitch  !== undefined) { this.pitch  = data.pitch;  setK('PCH', data.pitch); }
    if (data.pan    !== undefined) { this.pan    = data.pan;    setK('PAN', data.pan);   }
    if (data.filter !== undefined) { this.filter = data.filter; setK('FLT', data.filter);}
    if (data.send   !== undefined) { this.send   = data.send;   setK('SND', data.send);  }
  }

  destroy() {
    if (this._offVarChange) this._offVarChange();
    this.el.remove();
  }
}
