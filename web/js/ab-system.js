/**
 * ABSystem — two editable track sets (A and B) + crossfader blend.
 *
 * Public API:
 *   ABSystem.init(getA, getB)
 *   ABSystem.copyAtoB()        copy Set A state → Set B tracks
 *   ABSystem.copyBtoA()        copy Set B state → Set A tracks
 *   ABSystem.setCrossfader(0–100)
 *   ABSystem.resolveStep(trackIndex, stepIndex) → boolean | null
 */

const ABSystem = (() => {
  let getTracksA = null;
  let getTracksB = null;
  let crossfader = 0;   // 0 = full A, 100 = full B

  function init(getFnA, getFnB) {
    getTracksA = getFnA;
    getTracksB = getFnB;
  }

  function copyAtoB() {
    const a = getTracksA();
    const b = getTracksB();
    a.forEach((t, i) => { if (b[i]) b[i].fromJSON(t.toJSON()); });
  }

  function copyBtoA() {
    const a = getTracksA();
    const b = getTracksB();
    b.forEach((t, i) => { if (a[i]) a[i].fromJSON(t.toJSON()); });
  }

  function setCrossfader(v) {
    crossfader = Math.max(0, Math.min(100, v));
    _updateButtons();
  }

  function _updateButtons() {
    document.getElementById('btn-a')?.classList.toggle('active', crossfader < 50);
    document.getElementById('btn-b')?.classList.toggle('active', crossfader >= 50);
  }

  /**
   * Returns the step value for a track, blending A and B.
   * null = use Set A live state as-is (sequencer reads it directly).
   */
  function resolveStep(trackIndex, stepIndex) {
    if (crossfader === 0) return null;   // pure A live

    const b = getTracksB();
    const bt = b[trackIndex];
    const bStep = bt ? (bt.steps[stepIndex % bt.stepMode] ?? false) : false;

    if (crossfader === 100) return bStep;

    // Probabilistic blend
    return (Math.random() < crossfader / 100) ? bStep : null;
  }

  // Legacy compat (copyToSet / loadFromSet still called from some paths)
  function copyToSet(set) {
    if (set === 'B') copyAtoB();
    if (set === 'A') copyBtoA();
  }
  function loadFromSet() {}

  return { init, copyAtoB, copyBtoA, copyToSet, loadFromSet, setCrossfader, resolveStep };
})();
