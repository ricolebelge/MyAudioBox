/**
 * ABSystem — manages two pattern sets (A and B) with a live crossfader.
 *
 * Public API:
 *   ABSystem.init(getTracks)    getTracks() → Track[]
 *   ABSystem.copyToSet(set)     'A' | 'B'
 *   ABSystem.loadFromSet(set)
 *   ABSystem.setCrossfader(0–100)
 *   ABSystem.resolveStep(stepIndex, trackSteps) → boolean
 *     Called by the sequencer to blend A/B at runtime.
 */

const ABSystem = (() => {
  let getTracks = null;
  let crossfader = 0;  // 0 = full A, 100 = full B

  const sets = {
    A: null,
    B: null,
  };

  function init(getTracksFunc) {
    getTracks = getTracksFunc;
  }

  function snapshot() {
    return getTracks().map(t => t.toJSON());
  }

  function copyToSet(set) {
    sets[set] = snapshot();
    console.log(`[AB] Copied to ${set}`);
  }

  function loadFromSet(set) {
    const data = sets[set];
    if (!data) return;
    const tracks = getTracks();
    data.forEach((tdata, i) => {
      if (tracks[i]) tracks[i].fromJSON(tdata);
    });
  }

  function setCrossfader(v) {
    crossfader = Math.max(0, Math.min(100, v));
    _updateButtons();
  }

  function _updateButtons() {
    const btnA = document.getElementById('btn-a');
    const btnB = document.getElementById('btn-b');
    if (!btnA || !btnB) return;
    btnA.classList.toggle('active', crossfader < 50);
    btnB.classList.toggle('active', crossfader >= 50);
  }

  /**
   * Resolve whether a step is active for a track, blending A and B.
   * Used at runtime during playback.
   * trackIndex: 0–7
   * stepIndex: 0–15
   */
  function resolveStep(trackIndex, stepIndex) {
    if (crossfader === 0 || !sets.B) return null; // use live state
    if (crossfader === 100 && sets.B) {
      const t = sets.B[trackIndex];
      return t ? (t.steps[stepIndex % t.steps.length] ?? false) : false;
    }

    // Blend: probabilistic selection
    const probB = crossfader / 100;
    const useB  = Math.random() < probB;

    if (useB && sets.B) {
      const t = sets.B[trackIndex];
      return t ? (t.steps[stepIndex % t.steps.length] ?? false) : false;
    }
    if (!useB && sets.A) {
      const t = sets.A[trackIndex];
      return t ? (t.steps[stepIndex % t.steps.length] ?? false) : false;
    }
    return null; // fall through to live state
  }

  return { init, copyToSet, loadFromSet, setCrossfader, resolveStep };
})();
