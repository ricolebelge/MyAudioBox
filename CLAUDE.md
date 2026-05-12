# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AngelsAudioBox — live coding web drum machine (TR-909 style, Binance yellow #F0B90B on black).
Beat'N'Block / Binance Angel project.

## Launch

```bat
start.bat          # double-click — activates venv, starts server.py
```

Or manually:
```powershell
.\venv\Scripts\Activate.ps1
python server.py
# → HTTP :8000   WS :8001
# Open http://localhost:8000
```

## Stack

- **Backend**: Python 3.13 (`venv\`), stdlib only + `watchdog` + `websockets`
- **Frontend**: Vanilla HTML/CSS/JS, Web Audio API, no framework

## Architecture

```
server.py          HTTP :8000 (static + /api/patterns) + WS :8001 (hot-reload) + watchdog
start.bat          launcher
requirements.txt

web/
├── index.html     shell — imports all JS in order (knob → expressions → audio → sequencer → track → ab → ws → app)
├── css/style.css  TR-909 theme
└── js/
    ├── knob.js         canvas knob — upgrades <canvas class="knob">, emits knob:change
    ├── expressions.js  Expressions.evaluate(src, n) → bool[] — euclidean/fill/rotate/every/mirror/$var
    ├── audio.js        Audio.init/loadSample/loadFile/playStep/setMaster/setReverb/setDelay
    ├── sequencer.js    Sequencer — look-ahead clock, Sequencer.onStep(fn(step,time,beat))
    ├── track.js        Track class — renders row, handles drag-paint, toJSON/fromJSON
    ├── ab-system.js    ABSystem — sets A/B, crossfader, ABSystem.resolveStep(ti, si)
    ├── ws-client.js    WSClient — auto-reconnect, triggers page reload or App.refreshPatterns()
    └── app.js          App.init() — wires everything, transport, pattern CRUD

patterns/          JSON pattern files served by /api/patterns
samples/           audio files served by /samples/<file>
```

## Key design points

- **Script load order matters**: knob.js → expressions.js → audio.js → sequencer.js → track.js → ab-system.js → ws-client.js → app.js
- **Knob naming**: global knobs use `data-name="BPM"` etc.; per-track knobs use `data-name="VOL_0"` (suffix = track index)
- **Sequencer clock**: look-ahead via `AudioContext.currentTime` — do not use `setInterval` for audio scheduling
- **Expressions**: `evaluate(src, stepCount)` returns `boolean[]` or `null` on parse error; `$var` names must match knob `data-var` attributes
- **A/B blend**: `ABSystem.resolveStep(trackIndex, stepIndex)` returns `boolean | null` — null means use live state
- **Sample storage**: `Audio.loadFile(file)` returns `{ url, buffer }` — URL is a `blob:` URL stored on the track; server-saved patterns store the `/samples/` path

## Git

- Never add `Co-Authored-By: Claude` (or any Claude/Anthropic attribution) in commit messages.

## API

```
GET    /api/patterns          → string[]  (names without .json)
GET    /api/patterns/<name>   → JSON object
POST   /api/patterns/<name>   body: JSON → saves patterns/<name>.json
DELETE /api/patterns/<name>   → deletes file
GET    /samples/<file>        → streams from samples/
```
