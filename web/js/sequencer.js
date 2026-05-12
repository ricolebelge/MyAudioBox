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
  const SCHEDULE_AHEAD = 0.10; // seconds
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

      // Advance
      nextStepTime += stepDuration();
      currentStep = (currentStep + 1) % stepCount;
      if (currentStep === 0) {
        beat++;
        Expressions.setGlobalBeat(beat);
      }
    }
  }

  function tick() {
    if (!playing) return;
    schedule();
    timerId = setTimeout(tick, LOOKAHEAD_MS);
  }

  function start() {
    if (playing) return;
    Audio.init();
    playing = true;
    nextStepTime = Audio.ctx.currentTime + 0.05;
    currentStep  = 0;
    beat         = 0;
    Expressions.setGlobalBeat(0);
    tick();
  }

  function stop() {
    playing = false;
    clearTimeout(timerId);
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
    setBpm, setSwing, setStepCount, onStep,
    get isPlaying()    { return playing;     },
    get currentStep()  { return currentStep; },
    get bpm()          { return bpm;         },
  };
})();
