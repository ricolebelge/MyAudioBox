/**
 * Sequencer — look-ahead clock using AudioContext.currentTime.
 *
 * Public API:
 *   Sequencer.start()
 *   Sequencer.stop()
 *   Sequencer.reset()
 *   Sequencer.setBpm(bpm)
 *   Sequencer.setSwing(0–100)
 *   Sequencer.onStep(fn)   fn(stepIndex, time, beat) called for each scheduled step
 *   Sequencer.isPlaying    boolean
 *   Sequencer.currentStep  integer
 */

const Sequencer = (() => {
  const SCHEDULE_AHEAD = 0.15; // seconds — wider buffer against JS jitter
  const LOOKAHEAD_MS   = 25;   // setTimeout interval

  let bpm         = 120;
  let swing       = 0;       // 0–100
  let playing     = false;
  let nextStepTime = 0;
  let currentStep  = 0;
  let beat         = 0;      // total beats elapsed (for every())
  let stepHandlers = [];
  let timerId      = null;
  let stepCount    = 16;     // global step count (max of all tracks)

  // Ring buffer of scheduled {step, time} pairs — drives the visual cursor
  const _sched = [];

  function stepDuration() {
    return 60 / bpm / 4; // 16th note in seconds
  }

  function swingOffset(step) {
    if (swing === 0) return 0;
    const amount = (swing / 100) * stepDuration() * 0.5;
    return (step % 2 === 1) ? amount : 0;
  }

  function schedule() {
    const ctx = Audio.ctx;
    if (!ctx) return;

    while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
      const time = nextStepTime + swingOffset(currentStep);
      stepHandlers.forEach(fn => fn(currentStep, time, beat));

      // Record for visual cursor
      _sched.push({ step: currentStep, time });
      if (_sched.length > 128) _sched.shift();

      // Advance
      nextStepTime += stepDuration();
      currentStep = (currentStep + 1) % stepCount;
      if (currentStep === 0) {
        beat++;
        Expressions.setGlobalBeat(beat);
      }
    }
  }

  // Returns the step actually playing right now (for rAF visual cursor).
  function getVisualStep() {
    if (!Audio.ctx || !playing) return -1;
    const now = Audio.ctx.currentTime;
    let best = null;
    for (const s of _sched) {
      if (s.time <= now && (!best || s.time > best.time)) best = s;
    }
    return best ? best.step : -1;
  }

  function tick() {
    if (!playing) return;
    schedule();
    timerId = setTimeout(tick, LOOKAHEAD_MS);
  }

  function start() {
    if (playing) return;
    Audio.init();
    const _run = () => {
      playing      = true;
      nextStepTime = Audio.ctx.currentTime + 0.05;
      currentStep  = 0;
      beat         = 0;
      _sched.length = 0;
      Expressions.setGlobalBeat(0);
      tick();
    };
    if (Audio.ctx.state !== 'running') {
      Audio.ctx.resume().then(_run);
    } else {
      _run();
    }
  }

  function stop() {
    playing = false;
    clearTimeout(timerId);
    _sched.length = 0;
  }

  function reset() {
    stop();
    currentStep = 0;
    beat = 0;
  }

  function setBpm(v) {
    bpm = Math.max(20, Math.min(300, v));
  }

  function setSwing(v) {
    swing = Math.max(0, Math.min(100, v));
  }

  function setStepCount(n) {
    stepCount = n;
  }

  function onStep(fn) {
    stepHandlers.push(fn);
    return () => { stepHandlers = stepHandlers.filter(h => h !== fn); };
  }

  return {
    start, stop, reset,
    setBpm, setSwing, setStepCount, onStep, getVisualStep,
    get isPlaying()    { return playing;     },
    get currentStep()  { return currentStep; },
    get bpm()          { return bpm;         },
  };
})();
