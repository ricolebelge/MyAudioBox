/**
 * Audio — Web Audio API engine.
 *
 * Public API:
 *   Audio.init()
 *   Audio.loadSample(url)          → Promise<AudioBuffer>
 *   Audio.loadFile(file)           → Promise<{ url, buffer }>
 *   Audio.playStep(buffer, time, opts)
 *   Audio.setMaster(0–1)
 *   Audio.setReverb(0–1)
 *   Audio.setDelay(0–1, bpm)
 *   Audio.ctx                      AudioContext instance
 */

const Audio = (() => {
  let ctx = null;
  let masterGain = null;
  let reverbNode = null;
  let reverbGain = null;
  let delayNode  = null;
  let delayFeedback = null;
  let delayGain  = null;
  const cache = new Map();

  // ── Synthetic reverb IR ───────────────────────────────────────────────────
  function buildReverb(duration = 2.5, decay = 2.0) {
    const sr = ctx.sampleRate;
    const len = sr * duration;
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(ctx.destination);

    // Reverb
    reverbNode = ctx.createConvolver();
    reverbNode.buffer = buildReverb();
    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0;
    reverbNode.connect(reverbGain);
    reverbGain.connect(masterGain);

    // Delay
    delayNode = ctx.createDelay(2.0);
    delayNode.delayTime.value = 0.25;
    delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.4;
    delayGain = ctx.createGain();
    delayGain.gain.value = 0;
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayGain);
    delayGain.connect(masterGain);
  }

  async function loadSample(url) {
    if (cache.has(url)) return cache.get(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load: ${url}`);
    const arrayBuf = await response.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    cache.set(url, audioBuf);
    return audioBuf;
  }

  async function loadFile(file) {
    const url = URL.createObjectURL(file);
    const arrayBuf = await file.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    cache.set(url, audioBuf);
    return { url, buffer: audioBuf };
  }

  /**
   * Schedule a sample hit at precise AudioContext time.
   * opts: { vol, pitch, pan, filterFreq, sendReverb, sendDelay }
   */
  function playStep(buffer, time, opts = {}) {
    if (!ctx || !buffer) return;
    if (ctx.state === 'suspended') ctx.resume();

    const vol        = opts.vol        ?? 1;
    const pitch      = opts.pitch      ?? 1;
    const pan        = opts.pan        ?? 0;
    const filterFreq = opts.filterFreq ?? 20000;
    const sendReverb = opts.sendReverb ?? 0;
    const sendDelay  = opts.sendDelay  ?? 0;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;

    const gain = ctx.createGain();
    gain.gain.value = vol;

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1;

    // Reverb send
    const rvGain = ctx.createGain();
    rvGain.gain.value = sendReverb;

    // Delay send
    const dlGain = ctx.createGain();
    dlGain.gain.value = sendDelay;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(filter);
    filter.connect(masterGain);
    filter.connect(rvGain);
    filter.connect(dlGain);
    rvGain.connect(reverbNode);
    dlGain.connect(delayNode);

    source.start(time);
  }

  function setMaster(v) {
    if (masterGain) masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01);
  }

  function setReverb(v) {
    if (reverbGain) reverbGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  function setDelay(v, bpm) {
    if (delayGain) delayGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    if (delayNode && bpm) {
      delayNode.delayTime.setTargetAtTime(60 / bpm / 2, ctx.currentTime, 0.05);
    }
  }

  return { init, loadSample, loadFile, playStep, setMaster, setReverb, setDelay, get ctx() { return ctx; } };
})();
