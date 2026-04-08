# Piano Piece Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based sheet music editor that renders notation via VexFlow, plays back via Web Audio API, and persists to localStorage. Zero build tools — open `index.html` and it works.

## Architecture
```
Editor (mouse+keyboard) --> Score Model (JSON) --> Renderer (VexFlow --> SVG)
                                                --> Playback (Web Audio)
                          Score Model <--> Storage (localStorage)
```
The Score Model is the single source of truth. The Editor mutates it; Renderer and Playback read from it.

## Tech Stack
- **Rendering**: VexFlow 4.2.5 via CDN (`https://cdn.jsdelivr.net/npm/vexflow@4.2.5/build/cjs/vexflow.js`)
- **Playback**: Web Audio API (OscillatorNode + GainNode with ADSR envelope)
- **Persistence**: localStorage (JSON serialization)
- **UI**: HTML + CSS + vanilla JavaScript (ES modules via `<script type="module">`)
- **No frameworks, no build tools, no npm**

## Files to Create

| File | Purpose |
|------|---------|
| `index.html` | Single page with full layout (4 zones), loads VexFlow CDN + app module |
| `css/style.css` | All styling -- dark chrome, light score area, toolbar, playback bar |
| `js/score-model.js` | Score data structure, CRUD operations, duration math, validation |
| `js/renderer.js` | VexFlow rendering pipeline: Stave, StaveNote, Voice, Formatter, StaveConnector |
| `js/editor.js` | Mouse click-to-place notes, keyboard shortcuts, selection cursor |
| `js/playback.js` | Web Audio scheduler, oscillator+ADSR, visual cursor, dynamics |
| `js/storage.js` | Save/load/export/new score, localStorage management |
| `js/undo-redo.js` | Command pattern undo/redo stack |
| `js/app.js` | Bootstrap: wire all modules together, event delegation, toolbar bindings |

---

## Task 1: Project Scaffolding (index.html + style.css + VexFlow CDN)

**Goal / Objetivo**: Create the HTML page with all 4 layout zones and CSS styling. Load VexFlow from CDN. Verify it loads without errors.

### Step 1.1: Create directory structure

```bash
mkdir -p /Users/vi/Developer_vtc/piano-piece-editor/css
mkdir -p /Users/vi/Developer_vtc/piano-piece-editor/js
```

### Step 1.2: Create `index.html`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Piano Piece Editor</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/vexflow@4.2.5/build/cjs/vexflow.js"></script>
</head>
<body>
  <div id="app">

    <!-- Zone 1: Top Bar -->
    <header id="top-bar">
      <div class="app-title">Piano Piece Editor</div>
      <div class="file-actions">
        <button id="btn-new" class="bar-btn" title="New Score">New</button>
        <button id="btn-save" class="bar-btn" title="Save">Save</button>
        <button id="btn-load" class="bar-btn" title="Load">Load</button>
        <button id="btn-export" class="bar-btn" title="Export JSON">Export</button>
      </div>
    </header>

    <!-- Zone 2: Toolbar -->
    <div id="toolbar">
      <!-- Duration group -->
      <div class="tool-group">
        <span class="tool-label">DURATION:</span>
        <button class="tool-btn duration-btn active" data-duration="w" title="Whole (1)">&#119133;</button>
        <button class="tool-btn duration-btn" data-duration="h" title="Half (2)">&#119134;</button>
        <button class="tool-btn duration-btn" data-duration="q" title="Quarter (3)">&#119135;</button>
        <button class="tool-btn duration-btn" data-duration="8" title="Eighth (4)">&#119136;</button>
        <button class="tool-btn duration-btn" data-duration="16" title="Sixteenth (5)">&#119137;</button>
      </div>

      <!-- Accidental group -->
      <div class="tool-group">
        <span class="tool-label">ACCIDENTAL:</span>
        <button class="tool-btn accidental-btn" data-accidental="#" title="Sharp (S)">&#9839;</button>
        <button class="tool-btn accidental-btn" data-accidental="b" title="Flat (F)">&#9837;</button>
        <button class="tool-btn accidental-btn" data-accidental="n" title="Natural">&#9838;</button>
      </div>

      <!-- Rest toggle -->
      <div class="tool-group">
        <span class="tool-label">REST:</span>
        <button class="tool-btn" id="btn-rest" title="Rest (R)">&#119102;</button>
      </div>

      <!-- Dynamics group -->
      <div class="tool-group">
        <span class="tool-label">DYNAMICS:</span>
        <button class="tool-btn dynamics-btn" data-dynamics="pp">pp</button>
        <button class="tool-btn dynamics-btn" data-dynamics="p">p</button>
        <button class="tool-btn dynamics-btn" data-dynamics="mp">mp</button>
        <button class="tool-btn dynamics-btn" data-dynamics="mf">mf</button>
        <button class="tool-btn dynamics-btn" data-dynamics="f">f</button>
        <button class="tool-btn dynamics-btn" data-dynamics="ff">ff</button>
      </div>

      <!-- Tie -->
      <div class="tool-group">
        <button class="tool-btn" id="btn-tie" title="Tie (T)">Tie</button>
      </div>

      <!-- Undo/Redo -->
      <div class="tool-group tool-group-right">
        <button class="tool-btn" id="btn-undo" title="Undo (Cmd+Z)">&#8617; Undo</button>
        <button class="tool-btn" id="btn-redo" title="Redo (Cmd+Shift+Z)">&#8618; Redo</button>
      </div>
    </div>

    <!-- Zone 3: Score Area -->
    <div id="score-area">
      <div id="score-header">
        <div id="score-title" contenteditable="true" spellcheck="false">Untitled</div>
        <div id="score-composer" contenteditable="true" spellcheck="false">Composer</div>
      </div>
      <div id="score-container"></div>
    </div>

    <!-- Zone 4: Playback Bar -->
    <div id="playback-bar">
      <button id="btn-play" class="playback-btn play-btn" title="Play (Space)">&#9654; Play</button>
      <button id="btn-stop" class="playback-btn" title="Stop">&#9632; Stop</button>
      <div id="progress-bar">
        <div id="progress-fill"></div>
      </div>
      <label class="bpm-control">
        <span>BPM:</span>
        <input type="number" id="bpm-input" min="20" max="300" value="120" step="1">
      </label>
    </div>

  </div>

  <!-- Load dialog (hidden by default) -->
  <dialog id="load-dialog">
    <h3>Load Score</h3>
    <ul id="saved-scores-list"></ul>
    <div class="dialog-actions">
      <button id="load-dialog-cancel">Cancel</button>
    </div>
  </dialog>

  <!-- New score dialog (hidden by default) -->
  <dialog id="new-dialog">
    <h3>New Score</h3>
    <div class="dialog-field">
      <label>Title: <input type="text" id="new-title" value="Untitled"></label>
    </div>
    <div class="dialog-field">
      <label>Composer: <input type="text" id="new-composer" value="Composer"></label>
    </div>
    <div class="dialog-field">
      <label>Time Signature:
        <select id="new-time-sig">
          <option value="4/4" selected>4/4</option>
          <option value="3/4">3/4</option>
          <option value="2/4">2/4</option>
          <option value="6/8">6/8</option>
        </select>
      </label>
    </div>
    <div class="dialog-field">
      <label>Key:
        <select id="new-key-sig">
          <option value="C" selected>C Major</option>
          <option value="G">G Major</option>
          <option value="D">D Major</option>
          <option value="F">F Major</option>
          <option value="Bb">Bb Major</option>
          <option value="Eb">Eb Major</option>
          <option value="A">A Major</option>
          <option value="E">E Major</option>
        </select>
      </label>
    </div>
    <div class="dialog-field">
      <label>BPM: <input type="number" id="new-bpm" value="120" min="20" max="300"></label>
    </div>
    <div class="dialog-field">
      <label>Measures: <input type="number" id="new-measures" value="4" min="1" max="64"></label>
    </div>
    <div class="dialog-actions">
      <button id="new-dialog-cancel">Cancel</button>
      <button id="new-dialog-create">Create</button>
    </div>
  </dialog>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

### Step 1.3: Create `css/style.css`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/css/style.css`

```css
/* ============================================
   Piano Piece Editor — Styles
   ============================================ */

/* --- Reset & Base --- */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  background: #0f0f23;
  color: #e0e0e0;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* --- Zone 1: Top Bar --- */
#top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 16px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
  flex-shrink: 0;
}

.app-title {
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.5px;
}

.file-actions {
  display: flex;
  gap: 6px;
}

.bar-btn {
  background: #0f3460;
  color: #e0e0e0;
  border: 1px solid #1a4a8a;
  padding: 4px 14px;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
}

.bar-btn:hover {
  background: #1a4a8a;
}

/* --- Zone 2: Toolbar --- */
#toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 16px;
  background: #1a1a3e;
  border-bottom: 1px solid #0f3460;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 3px;
}

.tool-group-right {
  margin-left: auto;
}

.tool-label {
  font-size: 0.65rem;
  opacity: 0.5;
  margin-right: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tool-btn {
  background: #2a2a4e;
  color: #e0e0e0;
  border: 1px solid #3a3a6e;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  min-width: 30px;
  text-align: center;
}

.tool-btn:hover {
  background: #3a3a6e;
}

.tool-btn.active {
  background: #533483;
  border-color: #7c52b8;
}

.dynamics-btn {
  font-style: italic;
  font-family: 'Times New Roman', Times, serif;
}

/* --- Zone 3: Score Area --- */
#score-area {
  flex: 1;
  overflow-y: auto;
  background: #f5f0e8;
  color: #333;
  padding: 24px;
}

#score-header {
  text-align: center;
  margin-bottom: 16px;
}

#score-title {
  font-size: 1.5rem;
  font-weight: bold;
  font-family: 'Georgia', 'Times New Roman', serif;
  outline: none;
  min-height: 1.8rem;
}

#score-title:focus {
  border-bottom: 2px solid #2563eb;
}

#score-composer {
  font-size: 0.9rem;
  opacity: 0.6;
  font-family: 'Georgia', 'Times New Roman', serif;
  outline: none;
  min-height: 1.2rem;
}

#score-composer:focus {
  border-bottom: 2px solid #2563eb;
}

#score-container {
  position: relative;
  min-height: 200px;
}

#score-container svg {
  display: block;
  margin: 0 auto;
}

/* Highlight selected note */
.vf-selected .vf-notehead path {
  fill: #2563eb !important;
  stroke: #2563eb !important;
}

.vf-selected .vf-stem path {
  fill: #2563eb !important;
  stroke: #2563eb !important;
}

/* Playback cursor overlay */
.playback-cursor {
  position: absolute;
  width: 3px;
  background: #2563eb;
  opacity: 0.7;
  pointer-events: none;
  transition: left 0.05s linear;
  z-index: 10;
}

/* Ghost note preview on hover */
.ghost-note {
  opacity: 0.3;
  pointer-events: none;
}

/* --- Zone 4: Playback Bar --- */
#playback-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: #16213e;
  border-top: 1px solid #0f3460;
  flex-shrink: 0;
}

.playback-btn {
  background: #2a2a4e;
  color: #e0e0e0;
  border: 1px solid #3a3a6e;
  padding: 6px 14px;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.playback-btn:hover {
  background: #3a3a6e;
}

.play-btn {
  background: #059669;
  border-color: #06b47a;
}

.play-btn:hover {
  background: #06b47a;
}

.play-btn.playing {
  background: #d97706;
  border-color: #e8890a;
}

#progress-bar {
  flex: 1;
  height: 4px;
  background: #2a2a4e;
  border-radius: 2px;
  position: relative;
  overflow: hidden;
}

#progress-fill {
  width: 0%;
  height: 100%;
  background: #059669;
  border-radius: 2px;
  transition: width 0.1s linear;
}

.bpm-control {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  opacity: 0.8;
}

.bpm-control input {
  width: 50px;
  background: #2a2a4e;
  color: #e0e0e0;
  border: 1px solid #3a3a6e;
  border-radius: 4px;
  padding: 3px 6px;
  text-align: center;
  font-size: 0.8rem;
}

/* --- Dialogs --- */
dialog {
  background: #1a1a3e;
  color: #e0e0e0;
  border: 1px solid #3a3a6e;
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
}

dialog h3 {
  margin-bottom: 16px;
  font-size: 1.1rem;
}

.dialog-field {
  margin-bottom: 12px;
}

.dialog-field label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.dialog-field input,
.dialog-field select {
  background: #2a2a4e;
  color: #e0e0e0;
  border: 1px solid #3a3a6e;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.85rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-actions button {
  background: #0f3460;
  color: #e0e0e0;
  border: 1px solid #1a4a8a;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.dialog-actions button:hover {
  background: #1a4a8a;
}

#saved-scores-list {
  list-style: none;
  max-height: 300px;
  overflow-y: auto;
}

#saved-scores-list li {
  padding: 8px 12px;
  margin-bottom: 4px;
  background: #2a2a4e;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#saved-scores-list li:hover {
  background: #3a3a6e;
}

#saved-scores-list .score-delete-btn {
  background: #dc2626;
  border: none;
  color: white;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.75rem;
}
```

### Step 1.4: Create placeholder `js/app.js`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/app.js`

```javascript
// app.js — Bootstrap and orchestration
// Verify VexFlow loaded from CDN
const VF = Vex.Flow;
console.log('VexFlow loaded:', typeof VF !== 'undefined');
console.log('VexFlow classes available:', Object.keys(VF).slice(0, 10).join(', '), '...');

// Quick rendering test
const div = document.getElementById('score-container');
const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
renderer.resize(800, 200);
const context = renderer.getContext();

const trebleStave = new VF.Stave(10, 20, 780);
trebleStave.addClef('treble').addTimeSignature('4/4').addKeySignature('C');
trebleStave.setContext(context).draw();

const bassStave = new VF.Stave(10, 120, 780);
bassStave.addClef('bass').addTimeSignature('4/4').addKeySignature('C');
bassStave.setContext(context).draw();

const connector = new VF.StaveConnector(trebleStave, bassStave);
connector.setType(VF.StaveConnector.type.BRACE);
connector.setContext(context).draw();

const lineConnector = new VF.StaveConnector(trebleStave, bassStave);
lineConnector.setType(VF.StaveConnector.type.SINGLE_LEFT);
lineConnector.setContext(context).draw();

console.log('Scaffolding test: grand staff rendered successfully');
```

### Step 1.5: Verification

Open `/Users/vi/Developer_vtc/piano-piece-editor/index.html` in a browser (use a local server for ES module support):

```bash
cd /Users/vi/Developer_vtc/piano-piece-editor && python3 -m http.server 8080
```

**Check in browser console:**
- No errors
- "VexFlow loaded: true"
- "Scaffolding test: grand staff rendered successfully"

**Visual check:**
- Dark top bar with "Piano Piece Editor" and 4 buttons (New, Save, Load, Export)
- Toolbar with duration buttons, accidental buttons, rest, dynamics, tie, undo/redo
- Light beige score area with title "Untitled" / "Composer"
- Grand staff rendered with treble clef, bass clef, brace connector, 4/4 time, C major
- Dark playback bar at bottom with Play, Stop, progress bar, BPM input

### Step 1.6: Git commit

```bash
cd /Users/vi/Developer_vtc/piano-piece-editor
git init
git add index.html css/style.css js/app.js docs/
git commit -m "Scaffold: index.html with 4-zone layout, style.css, VexFlow CDN, grand staff test render"
```

---

## Task 2: Score Model (score-model.js)

**Goal / Objetivo**: Create the data model representing a musical score -- the single source of truth for the entire application. Includes creation, note manipulation, measure management, and duration math.

### Step 2.1: Create `js/score-model.js`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/score-model.js`

```javascript
// score-model.js — Score data structure and manipulation
// The Score Model is the single source of truth.
// Editor modifies it; Renderer and Playback read from it.

/**
 * Duration values in quarter-note beats.
 * Used for measure fullness validation.
 */
export const DURATION_VALUES = {
  'w': 4,    // whole
  'h': 2,    // half
  'q': 1,    // quarter
  '8': 0.5,  // eighth
  '16': 0.25 // sixteenth
};

/**
 * All valid duration keys in order from longest to shortest.
 */
export const DURATIONS = ['w', 'h', 'q', '8', '16'];

/**
 * Valid accidentals.
 */
export const ACCIDENTALS = ['#', 'b', 'n'];

/**
 * Valid dynamics markings, ordered softest to loudest.
 */
export const DYNAMICS = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];

/**
 * Note names in order (for pitch calculation).
 */
export const NOTE_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

/**
 * Create a new note object.
 * @param {string[]} keys - e.g. ['c/4'] or ['c/4', 'e/4', 'g/4'] for chords
 * @param {string} duration - 'w', 'h', 'q', '8', or '16'
 * @param {object} [options] - { type, accidental, dynamics, tied }
 * @returns {object} note object
 */
export function createNote(keys, duration, options = {}) {
  const note = {
    keys: [...keys],
    duration: duration,
  };
  if (options.type === 'rest') {
    note.type = 'rest';
    // Rest notes use a standard key for vertical positioning
    note.keys = ['b/4'];
  }
  if (options.accidental) {
    note.accidental = options.accidental;
  }
  if (options.dynamics) {
    note.dynamics = options.dynamics;
  }
  if (options.tied) {
    note.tied = true;
  }
  return note;
}

/**
 * Create a rest note.
 * @param {string} duration
 * @returns {object} rest note object
 */
export function createRest(duration) {
  return createNote(['b/4'], duration, { type: 'rest' });
}

/**
 * Create an empty measure filled with a single whole rest.
 * @returns {object} measure object
 */
export function createEmptyMeasure() {
  return {
    notes: [createRest('w')]
  };
}

/**
 * Calculate the total beat duration of all notes in a measure.
 * @param {object} measure
 * @returns {number} total beats
 */
export function measureDuration(measure) {
  return measure.notes.reduce((sum, note) => {
    return sum + (DURATION_VALUES[note.duration] || 0);
  }, 0);
}

/**
 * Check if a measure is full (total beats >= time signature beats).
 * @param {object} measure
 * @param {number} beats - beats per measure from time signature
 * @returns {boolean}
 */
export function isMeasureFull(measure, beats) {
  return measureDuration(measure) >= beats;
}

/**
 * Calculate remaining beats in a measure.
 * @param {object} measure
 * @param {number} beats
 * @returns {number}
 */
export function remainingBeats(measure, beats) {
  return Math.max(0, beats - measureDuration(measure));
}

/**
 * Create a new blank score with default settings.
 * @param {object} [options]
 * @returns {object} score object
 */
export function createScore(options = {}) {
  const title = options.title || 'Untitled';
  const composer = options.composer || 'Composer';
  const tempo = options.tempo || 120;
  const timeSigStr = options.timeSignature || '4/4';
  const [beats, beatValue] = timeSigStr.split('/').map(Number);
  const keySignature = options.keySignature || 'C';
  const numMeasures = options.measures || 4;

  const measures = [];
  for (let i = 0; i < numMeasures; i++) {
    measures.push(createEmptyMeasure());
  }

  return {
    title,
    composer,
    tempo,
    timeSignature: { beats, beatValue },
    keySignature,
    staves: [
      {
        clef: 'treble',
        measures: measures.map(m => ({ notes: m.notes.map(n => ({ ...n, keys: [...n.keys] })) }))
      },
      {
        clef: 'bass',
        measures: measures.map(m => ({ notes: m.notes.map(n => ({ ...n, keys: [...n.keys] })) }))
      }
    ]
  };
}

/**
 * Deep clone a score object (for undo/redo snapshots).
 * @param {object} score
 * @returns {object} deep copy
 */
export function cloneScore(score) {
  return JSON.parse(JSON.stringify(score));
}

/**
 * Add a note to a specific position in a measure.
 * If the measure contains only a whole rest, replace it.
 * If the measure is full, do nothing and return false.
 * @param {object} score
 * @param {number} staffIndex - 0=treble, 1=bass
 * @param {number} measureIndex
 * @param {number} noteIndex - position to insert at (-1 = append)
 * @param {object} note - note object to insert
 * @returns {boolean} true if note was added
 */
export function addNote(score, staffIndex, measureIndex, noteIndex, note) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;

  const measure = staff.measures[measureIndex];
  const beats = score.timeSignature.beats;

  // Check if adding this note would exceed the measure
  const currentDuration = measureDuration(measure);
  const noteDuration = DURATION_VALUES[note.duration] || 0;

  // If measure has only a single whole rest, replace it
  if (measure.notes.length === 1 &&
      measure.notes[0].type === 'rest' &&
      measure.notes[0].duration === 'w') {
    measure.notes = [{ ...note, keys: [...note.keys] }];
    // Fill remaining with appropriate rests
    fillMeasureWithRests(measure, beats);
    return true;
  }

  if (currentDuration + noteDuration > beats) {
    return false; // measure would overflow
  }

  const idx = noteIndex === -1 ? measure.notes.length : noteIndex;
  measure.notes.splice(idx, 0, { ...note, keys: [...note.keys] });
  return true;
}

/**
 * Replace a note at a specific position.
 * @param {object} score
 * @param {number} staffIndex
 * @param {number} measureIndex
 * @param {number} noteIndex
 * @param {object} newNote
 * @returns {boolean}
 */
export function replaceNote(score, staffIndex, measureIndex, noteIndex, newNote) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const measure = staff.measures[measureIndex];
  if (noteIndex < 0 || noteIndex >= measure.notes.length) return false;

  const oldDuration = DURATION_VALUES[measure.notes[noteIndex].duration] || 0;
  const newDuration = DURATION_VALUES[newNote.duration] || 0;
  const beats = score.timeSignature.beats;
  const currentTotal = measureDuration(measure);

  if (currentTotal - oldDuration + newDuration > beats) {
    return false;
  }

  measure.notes[noteIndex] = { ...newNote, keys: [...newNote.keys] };
  return true;
}

/**
 * Remove a note from a measure. If measure becomes empty, fill with whole rest.
 * @param {object} score
 * @param {number} staffIndex
 * @param {number} measureIndex
 * @param {number} noteIndex
 * @returns {boolean}
 */
export function removeNote(score, staffIndex, measureIndex, noteIndex) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const measure = staff.measures[measureIndex];
  if (noteIndex < 0 || noteIndex >= measure.notes.length) return false;

  measure.notes.splice(noteIndex, 1);

  if (measure.notes.length === 0) {
    measure.notes = [createRest('w')];
  }

  return true;
}

/**
 * Add an empty measure at the end of every staff.
 * @param {object} score
 */
export function addMeasure(score) {
  for (const staff of score.staves) {
    staff.measures.push(createEmptyMeasure());
  }
}

/**
 * Remove the last measure from every staff (keep at least 1).
 * @param {object} score
 * @returns {boolean}
 */
export function removeMeasure(score) {
  if (score.staves[0].measures.length <= 1) return false;
  for (const staff of score.staves) {
    staff.measures.pop();
  }
  return true;
}

/**
 * Fill remaining beats in a measure with rests of appropriate durations.
 * Used after replacing a whole rest with a shorter note.
 * @param {object} measure
 * @param {number} totalBeats
 */
function fillMeasureWithRests(measure, totalBeats) {
  let current = measureDuration(measure);
  const sortedDurations = ['h', 'q', '8', '16']; // descending value

  while (current < totalBeats - 0.001) { // float tolerance
    let filled = false;
    for (const dur of sortedDurations) {
      if (current + DURATION_VALUES[dur] <= totalBeats + 0.001) {
        measure.notes.push(createRest(dur));
        current += DURATION_VALUES[dur];
        filled = true;
        break;
      }
    }
    if (!filled) break; // safety
  }
}

/**
 * Parse a pitch string like "c/4", "d#/5", "bb/3" into components.
 * @param {string} key - VexFlow key format "note/octave"
 * @returns {{ name: string, accidental: string, octave: number }}
 */
export function parseKey(key) {
  const parts = key.split('/');
  const pitchStr = parts[0];
  const octave = parseInt(parts[1], 10);
  const name = pitchStr[0];
  const accidental = pitchStr.substring(1) || '';
  return { name, accidental, octave };
}

/**
 * Build a VexFlow key string from components.
 * @param {string} name - note letter (c-b)
 * @param {string} accidental - '#', 'b', 'n', or ''
 * @param {number} octave
 * @returns {string} e.g. "c#/4"
 */
export function buildKey(name, accidental, octave) {
  return `${name}${accidental}/${octave}`;
}

/**
 * Convert a VexFlow key to a MIDI-like numeric pitch (for comparison/sorting).
 * C4 = 60, C#4 = 61, etc.
 * @param {string} key
 * @returns {number}
 */
export function keyToMidi(key) {
  const { name, accidental, octave } = parseKey(key);
  const semitones = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  let midi = (octave + 1) * 12 + (semitones[name] || 0);
  if (accidental === '#') midi += 1;
  if (accidental === 'b') midi -= 1;
  return midi;
}

/**
 * Convert a MIDI note number to a frequency in Hz.
 * A4 (MIDI 69) = 440 Hz.
 * @param {number} midi
 * @returns {number} frequency in Hz
 */
export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Get the total number of measures in the score.
 * @param {object} score
 * @returns {number}
 */
export function getMeasureCount(score) {
  return score.staves[0].measures.length;
}

/**
 * Convert a Y pixel position on a staff to a VexFlow key string.
 * Used for mouse click → pitch mapping.
 * @param {number} yOnStaff - Y position relative to top line of the staff
 * @param {string} clef - 'treble' or 'bass'
 * @param {number} lineSpacing - pixels between staff lines (default ~10)
 * @returns {string} VexFlow key like "c/4"
 */
export function yToKey(yOnStaff, clef, lineSpacing = 10) {
  // Each half-line-spacing is one diatonic step.
  // Top line of treble clef = F5, each step down = one note down.
  // Top line of bass clef = A3, each step down = one note down.
  const halfSpace = lineSpacing / 2;
  const steps = Math.round(yOnStaff / halfSpace);

  let noteIndex, octave;

  if (clef === 'treble') {
    // Top line (step 0) = F5
    // Step 1 = E5, step 2 = D5, etc.
    const f5Index = 3; // f in NOTE_NAMES
    const startOctave = 5;
    const totalSemisteps = f5Index - steps; // negative = going down
    octave = startOctave + Math.floor(totalSemisteps / 7);
    noteIndex = ((totalSemisteps % 7) + 7) % 7;
  } else {
    // Top line (step 0) = A3
    const a3Index = 5; // a in NOTE_NAMES
    const startOctave = 3;
    const totalSemisteps = a3Index - steps;
    octave = startOctave + Math.floor(totalSemisteps / 7);
    noteIndex = ((totalSemisteps % 7) + 7) % 7;
  }

  // Clamp to reasonable range
  octave = Math.max(1, Math.min(8, octave));
  const name = NOTE_NAMES[noteIndex];
  return `${name}/${octave}`;
}
```

### Step 2.2: Verification (browser console)

After loading the page, run these verification functions in the browser console:

```javascript
// Import the module dynamically for testing
const SM = await import('./js/score-model.js');

// Test 1: Create a score
const score = SM.createScore({ title: 'Test', measures: 2 });
console.assert(score.staves.length === 2, 'Should have 2 staves (treble+bass)');
console.assert(score.staves[0].clef === 'treble', 'First staff is treble');
console.assert(score.staves[1].clef === 'bass', 'Second staff is bass');
console.assert(score.staves[0].measures.length === 2, 'Should have 2 measures');
console.log('Test 1 passed: createScore');

// Test 2: Measure starts with whole rest
const m = score.staves[0].measures[0];
console.assert(m.notes.length === 1, 'Empty measure has 1 note');
console.assert(m.notes[0].type === 'rest', 'It is a rest');
console.assert(m.notes[0].duration === 'w', 'Whole rest');
console.log('Test 2 passed: empty measure');

// Test 3: Add a note (replaces whole rest)
const note = SM.createNote(['c/4'], 'q');
const added = SM.addNote(score, 0, 0, 0, note);
console.assert(added === true, 'Note added');
console.assert(score.staves[0].measures[0].notes[0].keys[0] === 'c/4', 'Note is c/4');
console.assert(score.staves[0].measures[0].notes[0].duration === 'q', 'Quarter note');
// After replacing whole rest with quarter, should have rests filling the remaining 3 beats
const total = SM.measureDuration(score.staves[0].measures[0]);
console.assert(total === 4, 'Measure totals 4 beats');
console.log('Test 3 passed: addNote (replace whole rest)');

// Test 4: Duration values
console.assert(SM.DURATION_VALUES['w'] === 4, 'Whole = 4');
console.assert(SM.DURATION_VALUES['q'] === 1, 'Quarter = 1');
console.assert(SM.DURATION_VALUES['16'] === 0.25, 'Sixteenth = 0.25');
console.log('Test 4 passed: duration values');

// Test 5: MIDI / frequency
console.assert(SM.keyToMidi('a/4') === 69, 'A4 = MIDI 69');
console.assert(SM.keyToMidi('c/4') === 60, 'C4 = MIDI 60');
console.assert(Math.abs(SM.midiToFrequency(69) - 440) < 0.01, 'MIDI 69 = 440 Hz');
console.log('Test 5 passed: keyToMidi, midiToFrequency');

// Test 6: Clone score (deep copy)
const clone = SM.cloneScore(score);
clone.title = 'Modified';
console.assert(score.title === 'Test', 'Original unchanged after clone modification');
console.log('Test 6 passed: cloneScore');

// Test 7: Remove note
SM.removeNote(score, 0, 0, 0);
console.assert(score.staves[0].measures[0].notes.length >= 1, 'Measure still has notes');
console.log('Test 7 passed: removeNote');

// Test 8: Add/remove measures
SM.addMeasure(score);
console.assert(score.staves[0].measures.length === 3, 'Now 3 measures');
SM.removeMeasure(score);
console.assert(score.staves[0].measures.length === 2, 'Back to 2 measures');
console.log('Test 8 passed: addMeasure, removeMeasure');

console.log('ALL score-model tests passed');
```

### Step 2.3: Git commit

```bash
git add js/score-model.js
git commit -m "Add score-model.js: data structure, CRUD operations, duration math, pitch utilities"
```

---

## Task 3: Renderer (renderer.js)

**Goal / Objetivo**: Render the Score Model as a VexFlow SVG grand staff with proper clefs, key/time signatures, notes, accidentals, rests, ties, beams, and dynamics.

### Step 3.1: Create `js/renderer.js`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/renderer.js`

```javascript
// renderer.js — VexFlow rendering of the score model to SVG
// Reads from the Score Model and produces a visual grand staff.

const VF = Vex.Flow;

/**
 * Renderer state — holds the VexFlow renderer, context, and references
 * to rendered note elements (for click detection and highlighting).
 */
let vfRenderer = null;
let vfContext = null;
let noteElementMap = []; // { staffIndex, measureIndex, noteIndex, staveNote, boundingBox }

/**
 * Padding and layout constants.
 */
const LAYOUT = {
  leftPadding: 10,
  topPadding: 20,
  staffWidth: 250,       // width per measure
  firstMeasureExtra: 80, // extra width for first measure (clef, key sig, time sig)
  trebleBassGap: 80,     // vertical gap between treble and bass staff
  systemGap: 60,         // gap between systems (rows of measures)
  staffHeight: 100,      // approximate height of a single staff
  measuresPerLine: 3,    // how many measures fit on one line
  maxWidth: 820,         // max SVG width
};

/**
 * Initialize the renderer: create VexFlow SVG renderer attached to the container.
 * @param {HTMLElement} container - the #score-container div
 */
export function initRenderer(container) {
  // Clear any previous content
  container.innerHTML = '';
  vfRenderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  vfContext = vfRenderer.getContext();
  noteElementMap = [];
}

/**
 * Render the full score.
 * @param {object} score - the Score Model object
 * @param {HTMLElement} container - the #score-container div
 * @param {object} [selection] - { staffIndex, measureIndex, noteIndex } for highlighting
 * @returns {Array} noteElementMap for click detection
 */
export function renderScore(score, container, selection = null) {
  initRenderer(container);
  noteElementMap = [];

  const measureCount = score.staves[0].measures.length;
  const measuresPerLine = LAYOUT.measuresPerLine;
  const numLines = Math.ceil(measureCount / measuresPerLine);

  // Calculate total SVG height
  const lineHeight = LAYOUT.staffHeight + LAYOUT.trebleBassGap + LAYOUT.staffHeight + LAYOUT.systemGap;
  const totalHeight = LAYOUT.topPadding + numLines * lineHeight + 40;
  vfRenderer.resize(LAYOUT.maxWidth, totalHeight);

  const timeSigStr = `${score.timeSignature.beats}/${score.timeSignature.beatValue}`;

  for (let line = 0; line < numLines; line++) {
    const startMeasure = line * measuresPerLine;
    const endMeasure = Math.min(startMeasure + measuresPerLine, measureCount);
    const isFirstLine = line === 0;

    const yOffset = LAYOUT.topPadding + line * lineHeight;

    let xCursor = LAYOUT.leftPadding;

    for (let mi = startMeasure; mi < endMeasure; mi++) {
      const isFirstMeasure = mi === startMeasure;
      const isLastMeasure = mi === measureCount - 1;
      let measWidth = LAYOUT.staffWidth;
      if (isFirstMeasure) measWidth += LAYOUT.firstMeasureExtra;

      // --- Treble Stave ---
      const trebleStave = new VF.Stave(xCursor, yOffset, measWidth);
      if (isFirstMeasure) {
        trebleStave.addClef('treble');
        if (isFirstLine) {
          trebleStave.addKeySignature(score.keySignature);
          trebleStave.addTimeSignature(timeSigStr);
        }
      }
      if (isLastMeasure) {
        trebleStave.setEndBarType(VF.Barline.type.END);
      }
      trebleStave.setContext(vfContext).draw();

      // --- Bass Stave ---
      const bassY = yOffset + LAYOUT.staffHeight + LAYOUT.trebleBassGap;
      const bassStave = new VF.Stave(xCursor, bassY, measWidth);
      if (isFirstMeasure) {
        bassStave.addClef('bass');
        if (isFirstLine) {
          bassStave.addKeySignature(score.keySignature);
          bassStave.addTimeSignature(timeSigStr);
        }
      }
      if (isLastMeasure) {
        bassStave.setEndBarType(VF.Barline.type.END);
      }
      bassStave.setContext(vfContext).draw();

      // --- Connectors (only on first measure of each line) ---
      if (isFirstMeasure) {
        const brace = new VF.StaveConnector(trebleStave, bassStave);
        brace.setType(VF.StaveConnector.type.BRACE);
        brace.setContext(vfContext).draw();

        const lineConn = new VF.StaveConnector(trebleStave, bassStave);
        lineConn.setType(VF.StaveConnector.type.SINGLE_LEFT);
        lineConn.setContext(vfContext).draw();
      }

      // --- Render notes for this measure ---
      renderMeasureNotes(score, 0, mi, trebleStave, selection);
      renderMeasureNotes(score, 1, mi, bassStave, selection);

      xCursor += measWidth;
    }
  }

  return noteElementMap;
}

/**
 * Render notes for a single measure on a single staff.
 * @param {object} score
 * @param {number} staffIndex
 * @param {number} measureIndex
 * @param {VF.Stave} stave
 * @param {object|null} selection
 */
function renderMeasureNotes(score, staffIndex, measureIndex, stave, selection) {
  const staff = score.staves[staffIndex];
  const measure = staff.measures[measureIndex];

  if (!measure || !measure.notes || measure.notes.length === 0) return;

  const vfNotes = [];
  const timeSigStr = `${score.timeSignature.beats}/${score.timeSignature.beatValue}`;

  for (let ni = 0; ni < measure.notes.length; ni++) {
    const noteData = measure.notes[ni];
    const isSelected = selection &&
                       selection.staffIndex === staffIndex &&
                       selection.measureIndex === measureIndex &&
                       selection.noteIndex === ni;

    let vfNote;

    if (noteData.type === 'rest') {
      // Rest: duration string gets 'r' suffix
      vfNote = new VF.StaveNote({
        keys: ['b/4'],
        duration: noteData.duration + 'r',
        clef: staff.clef,
      });
    } else {
      vfNote = new VF.StaveNote({
        keys: noteData.keys,
        duration: noteData.duration,
        clef: staff.clef,
        auto_stem: true,
      });

      // Add accidentals
      if (noteData.accidental) {
        for (let ki = 0; ki < noteData.keys.length; ki++) {
          const keyParts = noteData.keys[ki].split('/');
          const pitchStr = keyParts[0];
          if (pitchStr.length > 1) {
            const acc = pitchStr.substring(1);
            vfNote.addModifier(new VF.Accidental(acc), ki);
          }
        }
      } else {
        // Check each key for inline accidentals
        for (let ki = 0; ki < noteData.keys.length; ki++) {
          const keyParts = noteData.keys[ki].split('/');
          const pitchStr = keyParts[0];
          if (pitchStr.length > 1) {
            const acc = pitchStr.substring(1);
            vfNote.addModifier(new VF.Accidental(acc), ki);
          }
        }
      }
    }

    // Highlight selected note
    if (isSelected) {
      vfNote.setStyle({ fillStyle: '#2563eb', strokeStyle: '#2563eb' });
    }

    vfNotes.push(vfNote);

    // Store reference for click detection
    noteElementMap.push({
      staffIndex,
      measureIndex,
      noteIndex: ni,
      staveNote: vfNote,
      stave: stave,
    });
  }

  if (vfNotes.length === 0) return;

  // Create voice and format
  const voice = new VF.Voice({
    num_beats: score.timeSignature.beats,
    beat_value: score.timeSignature.beatValue,
  }).setMode(VF.Voice.Mode.SOFT); // SOFT mode allows incomplete measures

  voice.addTickables(vfNotes);

  // Auto-beam eighth and sixteenth notes
  const beamableNotes = vfNotes.filter(n => {
    const dur = n.getDuration();
    return (dur === '8' || dur === '16') && !n.isRest();
  });
  let beams = [];
  if (beamableNotes.length >= 2) {
    try {
      beams = VF.Beam.generateBeams(beamableNotes);
    } catch (e) {
      // Beaming can fail for edge cases; silently skip
      beams = [];
    }
  }

  new VF.Formatter()
    .joinVoices([voice])
    .format([voice], stave.getWidth() - 50);

  voice.draw(vfContext, stave);

  for (const beam of beams) {
    beam.setContext(vfContext).draw();
  }

  // Draw ties for notes marked as tied
  for (let ni = 0; ni < measure.notes.length - 1; ni++) {
    if (measure.notes[ni].tied && !measure.notes[ni].type) {
      try {
        const tie = new VF.StaveTie({
          first_note: vfNotes[ni],
          last_note: vfNotes[ni + 1],
          first_indices: [0],
          last_indices: [0],
        });
        tie.setContext(vfContext).draw();
      } catch (e) {
        // Tie rendering can fail if notes are incompatible; skip
      }
    }
  }
}

/**
 * Get the noteElementMap (for editor click detection).
 * @returns {Array}
 */
export function getNoteElementMap() {
  return noteElementMap;
}

/**
 * Get the bounding box of a rendered note for playback cursor positioning.
 * @param {number} staffIndex
 * @param {number} measureIndex
 * @param {number} noteIndex
 * @returns {{ x, y, w, h } | null}
 */
export function getNoteBoundingBox(staffIndex, measureIndex, noteIndex) {
  const entry = noteElementMap.find(
    e => e.staffIndex === staffIndex &&
         e.measureIndex === measureIndex &&
         e.noteIndex === noteIndex
  );
  if (!entry || !entry.staveNote) return null;

  try {
    const bb = entry.staveNote.getBoundingBox();
    return {
      x: bb.getX(),
      y: bb.getY(),
      w: bb.getW(),
      h: bb.getH(),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Get the stave Y position and height for a given staff/measure
 * (used for playback cursor height).
 * @param {number} staffIndex
 * @param {number} measureIndex
 * @returns {{ y, height } | null}
 */
export function getStaveBounds(staffIndex, measureIndex) {
  const entry = noteElementMap.find(
    e => e.staffIndex === staffIndex && e.measureIndex === measureIndex
  );
  if (!entry || !entry.stave) return null;
  return {
    y: entry.stave.getY(),
    height: entry.stave.getHeight(),
  };
}
```

### Step 3.2: Update `js/app.js` to use renderer

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/app.js` (replace content)

```javascript
// app.js — Bootstrap and orchestration
import { createScore } from './score-model.js';
import { renderScore } from './renderer.js';

// Application state
const state = {
  score: null,
  selection: null, // { staffIndex, measureIndex, noteIndex }
};

/**
 * Initialize the application.
 */
function init() {
  state.score = createScore({ title: 'Untitled', composer: 'Composer', measures: 4 });
  render();
  console.log('Piano Piece Editor initialized');
}

/**
 * Re-render the score from the model.
 */
function render() {
  const container = document.getElementById('score-container');
  renderScore(state.score, container, state.selection);

  // Update header fields
  document.getElementById('score-title').textContent = state.score.title;
  document.getElementById('score-composer').textContent = state.score.composer;
  document.getElementById('bpm-input').value = state.score.tempo;
}

// Expose state and render for console testing
window._appState = state;
window._render = render;

// Boot
document.addEventListener('DOMContentLoaded', init);
```

### Step 3.3: Verification

Open the page in the browser and check:

**Console verification:**
```javascript
// Check that the score rendered
console.assert(document.querySelectorAll('#score-container svg').length === 1, 'SVG element exists');
console.assert(document.querySelectorAll('.vf-stave').length > 0, 'Stave elements exist');
console.log('Renderer test passed');
```

**Visual check:**
- 4 measures of grand staff visible (treble + bass)
- First measure has treble/bass clef, C major key sig (no sharps/flats), 4/4 time
- Each measure shows a whole rest
- Brace connector on the left of each system
- Last measure has a final barline

### Step 3.4: Git commit

```bash
git add js/renderer.js js/app.js
git commit -m "Add renderer.js: VexFlow grand staff rendering with notes, rests, accidentals, ties, beams"
```

---

## Task 4: Editor — Mouse Interaction (editor.js)

**Goal / Objetivo**: Click on the staff to position notes. Click existing notes to select them. Maintain a cursor/selection state.

### Step 4.1: Create `js/editor.js`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/editor.js`

```javascript
// editor.js — Mouse and keyboard interaction for the score editor
import {
  createNote, createRest, addNote, removeNote, replaceNote,
  DURATION_VALUES, NOTE_NAMES, parseKey, buildKey, yToKey,
  addMeasure, cloneScore
} from './score-model.js';

/**
 * Editor state — tracks current tool selections and cursor.
 */
const editorState = {
  currentDuration: 'q',    // selected duration
  currentAccidental: '',   // '', '#', 'b', 'n'
  currentDynamics: '',     // '', 'pp', 'p', 'mp', 'mf', 'f', 'ff'
  restMode: false,         // true = insert rests
  currentOctave: 4,        // default octave for keyboard input
  currentStaff: 0,         // 0=treble, 1=bass
};

// Callbacks set by app.js
let onScoreChange = null;
let getScore = null;
let getSelection = null;
let setSelection = null;
let pushUndo = null;

/**
 * Initialize the editor with callbacks.
 * @param {object} callbacks
 *   - onScoreChange: () => void — called after score is mutated, triggers re-render
 *   - getScore: () => object — returns current score
 *   - getSelection: () => object|null
 *   - setSelection: (sel) => void
 *   - pushUndo: () => void — snapshot for undo before mutation
 */
export function initEditor(callbacks) {
  onScoreChange = callbacks.onScoreChange;
  getScore = callbacks.getScore;
  getSelection = callbacks.getSelection;
  setSelection = callbacks.setSelection;
  pushUndo = callbacks.pushUndo;
}

/**
 * Get current editor state (for toolbar display sync).
 */
export function getEditorState() {
  return { ...editorState };
}

/**
 * Set the current duration.
 * @param {string} dur - 'w', 'h', 'q', '8', '16'
 */
export function setDuration(dur) {
  editorState.currentDuration = dur;
}

/**
 * Toggle an accidental. If already active, deactivate it.
 * @param {string} acc - '#', 'b', 'n'
 */
export function toggleAccidental(acc) {
  editorState.currentAccidental = editorState.currentAccidental === acc ? '' : acc;
}

/**
 * Toggle rest mode.
 */
export function toggleRestMode() {
  editorState.restMode = !editorState.restMode;
}

/**
 * Set dynamics for the next note (or clear if same).
 * @param {string} dyn
 */
export function toggleDynamics(dyn) {
  editorState.currentDynamics = editorState.currentDynamics === dyn ? '' : dyn;
}

/**
 * Handle a click on the score SVG to either select an existing note
 * or insert a new note.
 * @param {MouseEvent} event
 * @param {Array} noteElementMap - from renderer
 */
export function handleScoreClick(event, noteElementMap) {
  const score = getScore();
  if (!score) return;

  const container = document.getElementById('score-container');
  const svg = container.querySelector('svg');
  if (!svg) return;

  const rect = svg.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // First check if click is near an existing note
  let closestEntry = null;
  let closestDist = Infinity;

  for (const entry of noteElementMap) {
    try {
      const bb = entry.staveNote.getBoundingBox();
      const cx = bb.getX() + bb.getW() / 2;
      const cy = bb.getY() + bb.getH() / 2;
      const dist = Math.hypot(clickX - cx, clickY - cy);

      if (dist < closestDist && dist < 25) {
        closestDist = dist;
        closestEntry = entry;
      }
    } catch (e) {
      // getBoundingBox can fail for some notes
    }
  }

  if (closestEntry) {
    // Select the existing note
    setSelection({
      staffIndex: closestEntry.staffIndex,
      measureIndex: closestEntry.measureIndex,
      noteIndex: closestEntry.noteIndex,
    });
    onScoreChange();
    return;
  }

  // Otherwise, try to insert a new note based on click position.
  // Determine which staff and measure was clicked.
  let targetStaff = -1;
  let targetMeasure = -1;
  let yOnStaff = 0;
  let bestStaveEntry = null;
  let bestStaveDist = Infinity;

  for (const entry of noteElementMap) {
    const stave = entry.stave;
    if (!stave) continue;
    const sy = stave.getY();
    const sh = stave.getHeight ? stave.getHeight() : 80;
    const sx = stave.getX();
    const sw = stave.getWidth();

    // Check if click is within the stave horizontal bounds (with some margin)
    if (clickX >= sx - 10 && clickX <= sx + sw + 10) {
      const staffCenterY = sy + sh / 2;
      const dist = Math.abs(clickY - staffCenterY);
      if (dist < bestStaveDist) {
        bestStaveDist = dist;
        bestStaveEntry = entry;
        yOnStaff = clickY - sy;
      }
    }
  }

  if (bestStaveEntry && bestStaveDist < 60) {
    targetStaff = bestStaveEntry.staffIndex;
    targetMeasure = bestStaveEntry.measureIndex;

    // Convert Y position to a pitch
    const clef = score.staves[targetStaff].clef;
    const key = yToKey(yOnStaff, clef);

    // Build the note
    let finalKey = key;
    if (editorState.currentAccidental) {
      const parsed = parseKey(key);
      const accStr = editorState.currentAccidental === 'n' ? '' : editorState.currentAccidental;
      finalKey = buildKey(parsed.name, accStr, parsed.octave);
    }

    pushUndo();

    if (editorState.restMode) {
      const rest = createRest(editorState.currentDuration);
      addNote(score, targetStaff, targetMeasure, -1, rest);
    } else {
      const note = createNote([finalKey], editorState.currentDuration, {
        dynamics: editorState.currentDynamics || undefined,
      });
      addNote(score, targetStaff, targetMeasure, -1, note);
    }

    onScoreChange();
  }
}

/**
 * Handle keyboard shortcut for inserting a note by letter.
 * @param {string} noteName - 'c', 'd', 'e', 'f', 'g', 'a', 'b'
 */
export function insertNoteByKey(noteName) {
  const score = getScore();
  const sel = getSelection();
  if (!score) return;

  // Determine where to insert: after selection, or at end of current measure
  let staffIndex = editorState.currentStaff;
  let measureIndex = 0;
  let insertIndex = -1;

  if (sel) {
    staffIndex = sel.staffIndex;
    measureIndex = sel.measureIndex;
    insertIndex = sel.noteIndex + 1;
  }

  // Find first non-full measure if current is full
  const measure = score.staves[staffIndex].measures[measureIndex];
  const beats = score.timeSignature.beats;
  const durVal = DURATION_VALUES[editorState.currentDuration];

  // Build the key
  let accStr = '';
  if (editorState.currentAccidental && editorState.currentAccidental !== 'n') {
    accStr = editorState.currentAccidental;
  }
  const key = buildKey(noteName, accStr, editorState.currentOctave);

  pushUndo();

  if (editorState.restMode) {
    const rest = createRest(editorState.currentDuration);
    const added = addNote(score, staffIndex, measureIndex, insertIndex, rest);
    if (!added) {
      // Try next measure
      if (measureIndex + 1 < score.staves[staffIndex].measures.length) {
        addNote(score, staffIndex, measureIndex + 1, 0, rest);
        measureIndex += 1;
        insertIndex = 0;
      }
    }
  } else {
    const note = createNote([key], editorState.currentDuration, {
      dynamics: editorState.currentDynamics || undefined,
    });
    const added = addNote(score, staffIndex, measureIndex, insertIndex, note);
    if (!added) {
      // Try next measure
      if (measureIndex + 1 < score.staves[staffIndex].measures.length) {
        addNote(score, staffIndex, measureIndex + 1, 0, note);
        measureIndex += 1;
        insertIndex = 0;
      } else {
        // Add a new measure
        addMeasure(score);
        addNote(score, staffIndex, measureIndex + 1, 0, note);
        measureIndex += 1;
        insertIndex = 0;
      }
    }
  }

  // Move selection to newly inserted note
  setSelection({
    staffIndex,
    measureIndex,
    noteIndex: insertIndex === -1 ? 0 : insertIndex,
  });

  onScoreChange();
}

/**
 * Delete the currently selected note.
 */
export function deleteSelectedNote() {
  const score = getScore();
  const sel = getSelection();
  if (!score || !sel) return;

  pushUndo();
  removeNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex);

  // Adjust selection
  const measure = score.staves[sel.staffIndex].measures[sel.measureIndex];
  if (sel.noteIndex >= measure.notes.length) {
    setSelection({
      ...sel,
      noteIndex: Math.max(0, measure.notes.length - 1),
    });
  }

  onScoreChange();
}

/**
 * Navigate selection left/right.
 * @param {number} direction - -1 for left, +1 for right
 */
export function navigateSelection(direction) {
  const score = getScore();
  let sel = getSelection();
  if (!score) return;

  if (!sel) {
    // Start at first note of first measure
    sel = { staffIndex: 0, measureIndex: 0, noteIndex: 0 };
    setSelection(sel);
    onScoreChange();
    return;
  }

  const staff = score.staves[sel.staffIndex];
  const measure = staff.measures[sel.measureIndex];
  let { measureIndex, noteIndex } = sel;

  noteIndex += direction;

  if (noteIndex < 0) {
    // Go to previous measure
    if (measureIndex > 0) {
      measureIndex -= 1;
      noteIndex = staff.measures[measureIndex].notes.length - 1;
    } else {
      noteIndex = 0;
    }
  } else if (noteIndex >= measure.notes.length) {
    // Go to next measure
    if (measureIndex < staff.measures.length - 1) {
      measureIndex += 1;
      noteIndex = 0;
    } else {
      noteIndex = measure.notes.length - 1;
    }
  }

  setSelection({
    staffIndex: sel.staffIndex,
    measureIndex,
    noteIndex,
  });

  onScoreChange();
}

/**
 * Change the octave of the currently selected note.
 * @param {number} delta - +1 or -1
 */
export function changeOctave(delta) {
  const score = getScore();
  const sel = getSelection();

  // Always update default octave
  editorState.currentOctave = Math.max(1, Math.min(8, editorState.currentOctave + delta));

  if (!score || !sel) return;

  const note = score.staves[sel.staffIndex].measures[sel.measureIndex].notes[sel.noteIndex];
  if (note.type === 'rest') return;

  pushUndo();

  note.keys = note.keys.map(key => {
    const parsed = parseKey(key);
    const newOctave = Math.max(1, Math.min(8, parsed.octave + delta));
    return buildKey(parsed.name, parsed.accidental, newOctave);
  });

  onScoreChange();
}

/**
 * Toggle tie on the currently selected note.
 */
export function toggleTie() {
  const score = getScore();
  const sel = getSelection();
  if (!score || !sel) return;

  const note = score.staves[sel.staffIndex].measures[sel.measureIndex].notes[sel.noteIndex];
  if (note.type === 'rest') return;

  pushUndo();
  note.tied = !note.tied;
  onScoreChange();
}

/**
 * Switch active staff (treble/bass) for keyboard input.
 */
export function switchStaff() {
  editorState.currentStaff = editorState.currentStaff === 0 ? 1 : 0;
  const sel = getSelection();
  if (sel) {
    setSelection({
      ...sel,
      staffIndex: editorState.currentStaff,
    });
    onScoreChange();
  }
}
```

### Step 4.2: Verification

```javascript
// In browser console, after modules are wired (in Task 5):
// Click on the treble staff area — a note should appear at the clicked pitch.
// Click on an existing note — it should turn blue (selected).
// Press Left/Right — selection should move between notes.
console.log('Editor module loaded — test via mouse clicks and keyboard after Task 5/6 wiring');
```

### Step 4.3: Git commit

```bash
git add js/editor.js
git commit -m "Add editor.js: mouse click-to-place, note selection, navigation, accidentals, ties"
```

---

## Task 5: Toolbar Wiring + Keyboard Shortcuts

**Goal / Objetivo**: Wire toolbar buttons to editor state. Add all keyboard shortcuts.

### Step 5.1: Update `js/app.js` with full wiring

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/app.js` (replace full content)

```javascript
// app.js — Bootstrap, orchestration, toolbar wiring, keyboard shortcuts
import { createScore, cloneScore } from './score-model.js';
import { renderScore, getNoteElementMap } from './renderer.js';
import {
  initEditor, getEditorState, setDuration, toggleAccidental,
  toggleRestMode, toggleDynamics, handleScoreClick,
  insertNoteByKey, deleteSelectedNote, navigateSelection,
  changeOctave, toggleTie, switchStaff
} from './editor.js';

// ============================================================
// Application State
// ============================================================
const state = {
  score: null,
  selection: null,     // { staffIndex, measureIndex, noteIndex } | null
  undoStack: [],       // array of score snapshots (JSON strings)
  redoStack: [],
  isPlaying: false,
};

const MAX_UNDO = 50;

// ============================================================
// Core functions
// ============================================================

function render() {
  const container = document.getElementById('score-container');
  renderScore(state.score, container, state.selection);
  syncToolbar();
  syncHeader();
}

function syncHeader() {
  const titleEl = document.getElementById('score-title');
  const composerEl = document.getElementById('score-composer');
  if (titleEl.textContent !== state.score.title) {
    titleEl.textContent = state.score.title;
  }
  if (composerEl.textContent !== state.score.composer) {
    composerEl.textContent = state.score.composer;
  }
  document.getElementById('bpm-input').value = state.score.tempo;
}

function syncToolbar() {
  const es = getEditorState();

  // Duration buttons
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.duration === es.currentDuration);
  });

  // Accidental buttons
  document.querySelectorAll('.accidental-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accidental === es.currentAccidental);
  });

  // Rest button
  document.getElementById('btn-rest').classList.toggle('active', es.restMode);

  // Dynamics buttons
  document.querySelectorAll('.dynamics-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dynamics === es.currentDynamics);
  });
}

function pushUndo() {
  state.undoStack.push(JSON.stringify(state.score));
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
  state.redoStack = []; // clear redo on new action
}

function undo() {
  if (state.undoStack.length === 0) return;
  state.redoStack.push(JSON.stringify(state.score));
  state.score = JSON.parse(state.undoStack.pop());
  state.selection = null;
  render();
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(JSON.stringify(state.score));
  state.score = JSON.parse(state.redoStack.pop());
  state.selection = null;
  render();
}

// ============================================================
// Toolbar event handlers
// ============================================================

function setupToolbar() {
  // Duration buttons
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDuration(btn.dataset.duration);
      syncToolbar();
    });
  });

  // Accidental buttons
  document.querySelectorAll('.accidental-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleAccidental(btn.dataset.accidental);
      syncToolbar();
    });
  });

  // Rest button
  document.getElementById('btn-rest').addEventListener('click', () => {
    toggleRestMode();
    syncToolbar();
  });

  // Dynamics buttons
  document.querySelectorAll('.dynamics-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleDynamics(btn.dataset.dynamics);
      syncToolbar();
    });
  });

  // Tie button
  document.getElementById('btn-tie').addEventListener('click', () => {
    toggleTie();
  });

  // Undo/Redo
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  // BPM input
  document.getElementById('bpm-input').addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (val >= 20 && val <= 300) {
      pushUndo();
      state.score.tempo = val;
    }
  });

  // Title/Composer editing
  document.getElementById('score-title').addEventListener('blur', (e) => {
    const newTitle = e.target.textContent.trim();
    if (newTitle && newTitle !== state.score.title) {
      pushUndo();
      state.score.title = newTitle;
    }
  });

  document.getElementById('score-composer').addEventListener('blur', (e) => {
    const newComposer = e.target.textContent.trim();
    if (newComposer && newComposer !== state.score.composer) {
      pushUndo();
      state.score.composer = newComposer;
    }
  });
}

// ============================================================
// Score area click handler
// ============================================================

function setupScoreClick() {
  document.getElementById('score-container').addEventListener('click', (e) => {
    if (state.isPlaying) return;
    handleScoreClick(e, getNoteElementMap());
  });
}

// ============================================================
// Keyboard shortcuts
// ============================================================

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Don't capture when editing title/composer
    if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    const key = e.key;
    const ctrl = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;

    // --- Note entry: C D E F G A B ---
    if (!ctrl && !shift && 'cdefgab'.includes(key.toLowerCase()) && key.length === 1) {
      e.preventDefault();
      insertNoteByKey(key.toLowerCase());
      return;
    }

    // --- Duration: 1=whole, 2=half, 3=quarter, 4=eighth, 5=sixteenth ---
    const durMap = { '1': 'w', '2': 'h', '3': 'q', '4': '8', '5': '16' };
    if (!ctrl && !shift && durMap[key]) {
      e.preventDefault();
      setDuration(durMap[key]);
      syncToolbar();
      return;
    }

    // --- Accidentals: S=sharp, F=flat ---
    // (We use 's' and 'f' but 'f' conflicts with note F.
    //  Spec says S for sharp, F for flat. Since note letters are lowercase
    //  and these are also lowercase, we need a modifier-free approach.
    //  Resolution: Use Shift+S for sharp, Shift+F for flat to avoid conflict.)
    // Actually, re-reading the spec: "Sustenido/Bemol: S / F"
    // and "Notas: C D E F G A B"
    // There IS a conflict with F. The spec intends S and F as modifiers
    // before note entry. We'll treat capital S and capital F (shift+s, shift+f)
    // as accidental toggles to avoid conflict.
    // Wait -- the note keys use lowercase without shift. Let's check:
    // The spec doesn't specify shift. Since notes are "C D E F G A B" (capital shown
    // but keyboard sends lowercase by default), and accidentals are "S / F",
    // we'll use: lowercase c-b for notes, UPPERCASE S/F for accidentals.
    // Actually simplest: since we already handle lowercase c,d,e,f,g,a,b above,
    // let's handle 's' and 'f' specially. 'f' is a note BUT also means flat.
    // Resolution: 's' without prior note context = sharp toggle, 'f' = note F.
    // For flat, use Shift+F. This way we don't lose the F note key.
    // Better: follow spec literally. S toggles sharp (if not in note context).
    // Since 's' is not a note name, it works. For 'f', it IS a note. So:
    // - 's' = toggle sharp (s is not a note)
    // - Shift+F = toggle flat (since f is a note)
    // This preserves both features. For natural, there's no keyboard shortcut in spec.

    // Already handled: lowercase 'f' goes to note entry above.
    // 's' is NOT in 'cdefgab', so it falls through here:
    if (!ctrl && !shift && key === 's') {
      e.preventDefault();
      toggleAccidental('#');
      syncToolbar();
      return;
    }

    // Shift+F for flat (since 'f' alone is the note F)
    if (!ctrl && shift && key === 'F') {
      e.preventDefault();
      toggleAccidental('b');
      syncToolbar();
      return;
    }

    // --- Rest: R ---
    if (!ctrl && !shift && key === 'r') {
      e.preventDefault();
      toggleRestMode();
      syncToolbar();
      return;
    }

    // --- Tie: T ---
    if (!ctrl && !shift && key === 't') {
      e.preventDefault();
      toggleTie();
      return;
    }

    // --- Delete: Delete or Backspace ---
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      deleteSelectedNote();
      return;
    }

    // --- Navigate: ArrowLeft / ArrowRight ---
    if (!shift && key === 'ArrowLeft') {
      e.preventDefault();
      navigateSelection(-1);
      return;
    }
    if (!shift && key === 'ArrowRight') {
      e.preventDefault();
      navigateSelection(1);
      return;
    }

    // --- Octave: Shift+ArrowUp / Shift+ArrowDown ---
    if (shift && key === 'ArrowUp') {
      e.preventDefault();
      changeOctave(1);
      return;
    }
    if (shift && key === 'ArrowDown') {
      e.preventDefault();
      changeOctave(-1);
      return;
    }

    // --- Play/Stop: Space ---
    if (key === ' ') {
      e.preventDefault();
      togglePlayback();
      return;
    }

    // --- Undo: Cmd+Z ---
    if (ctrl && !shift && key === 'z') {
      e.preventDefault();
      undo();
      return;
    }

    // --- Redo: Cmd+Shift+Z ---
    if (ctrl && shift && key === 'Z') {
      e.preventDefault();
      redo();
      return;
    }

    // --- Switch staff: Tab ---
    if (key === 'Tab') {
      e.preventDefault();
      switchStaff();
      return;
    }
  });
}

// ============================================================
// Playback toggle (placeholder until playback.js is wired)
// ============================================================

function togglePlayback() {
  // Will be wired in Task 7
  console.log('Playback toggle — not yet implemented');
}

// ============================================================
// File action buttons (placeholder until storage.js is wired)
// ============================================================

function setupFileActions() {
  document.getElementById('btn-new').addEventListener('click', () => {
    document.getElementById('new-dialog').showModal();
  });

  document.getElementById('new-dialog-cancel').addEventListener('click', () => {
    document.getElementById('new-dialog').close();
  });

  document.getElementById('new-dialog-create').addEventListener('click', () => {
    const title = document.getElementById('new-title').value || 'Untitled';
    const composer = document.getElementById('new-composer').value || 'Composer';
    const timeSig = document.getElementById('new-time-sig').value;
    const keySig = document.getElementById('new-key-sig').value;
    const bpm = parseInt(document.getElementById('new-bpm').value, 10) || 120;
    const measures = parseInt(document.getElementById('new-measures').value, 10) || 4;

    state.score = createScore({
      title, composer, timeSignature: timeSig,
      keySignature: keySig, tempo: bpm, measures,
    });
    state.selection = null;
    state.undoStack = [];
    state.redoStack = [];
    document.getElementById('new-dialog').close();
    render();
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    console.log('Save — not yet wired');
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    console.log('Load — not yet wired');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    console.log('Export — not yet wired');
  });
}

// ============================================================
// Initialize
// ============================================================

function init() {
  state.score = createScore({ title: 'Untitled', composer: 'Composer', measures: 4 });

  // Wire editor callbacks
  initEditor({
    onScoreChange: render,
    getScore: () => state.score,
    getSelection: () => state.selection,
    setSelection: (sel) => { state.selection = sel; },
    pushUndo: pushUndo,
  });

  setupToolbar();
  setupScoreClick();
  setupKeyboard();
  setupFileActions();

  render();
  console.log('Piano Piece Editor initialized');
}

// Expose for console debugging
window._state = state;
window._render = render;
window._undo = undo;
window._redo = redo;

document.addEventListener('DOMContentLoaded', init);
```

### Step 5.2: Verification

Open in browser and test:

**Toolbar checks:**
- Click duration buttons (W, H, Q, 8, 16) — active state highlights correctly
- Click accidental buttons (#, b, nat) — toggles active state
- Click Rest button — toggles active state
- Click dynamics buttons — toggles active state

**Keyboard checks:**
- Press `3` — quarter note selected in toolbar
- Press `1` — whole note selected
- Press `c` then `d` then `e` — three notes appear in treble staff
- Press `Left` / `Right` — selection moves (note turns blue)
- Press `Delete` — selected note is removed
- Press `Shift+Up` / `Shift+Down` — octave changes on selected note
- Press `s` — sharp toggle (then press a note letter)
- Press `r` — rest mode toggle
- Press `t` — tie toggle on selected note
- Press `Cmd+Z` — undo
- Press `Cmd+Shift+Z` — redo
- Press `Space` — console logs "Playback toggle" (not yet wired)
- Press `Tab` — switches between treble/bass staff for keyboard input

**Console verification:**
```javascript
console.assert(window._state.score !== null, 'Score exists');
console.assert(typeof window._undo === 'function', 'Undo function exposed');
console.log('Toolbar + keyboard wiring verified');
```

### Step 5.3: Git commit

```bash
git add js/app.js js/editor.js
git commit -m "Wire toolbar buttons and keyboard shortcuts to editor, undo/redo stack"
```

---

## Task 6: Playback Engine (playback.js)

**Goal / Objetivo**: Web Audio API playback with oscillator+ADSR envelope, scheduler using audioContext.currentTime, visual cursor, dynamics.

### Step 6.1: Create `js/playback.js`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/playback.js`

```javascript
// playback.js — Web Audio API playback engine
// Reads notes from the Score Model, schedules oscillators,
// and animates a visual cursor on the score.

import { keyToMidi, midiToFrequency, DURATION_VALUES } from './score-model.js';

let audioContext = null;
let isPlaying = false;
let scheduledTimeouts = [];
let animationFrameId = null;

// Callback to update UI (progress bar, cursor)
let onPlaybackProgress = null;
let onPlaybackEnd = null;

// Visual cursor element
let cursorElement = null;

/**
 * ADSR envelope parameters (piano-like).
 */
const ENVELOPE = {
  attack: 0.01,   // 10ms attack
  decay: 0.15,    // 150ms decay
  sustain: 0.3,   // 30% sustain level
  release: 0.3,   // 300ms release
};

/**
 * Dynamics to gain mapping.
 */
const DYNAMICS_GAIN = {
  'pp': 0.15,
  'p': 0.25,
  'mp': 0.35,
  'mf': 0.5,
  'f': 0.7,
  'ff': 0.9,
};

/**
 * Initialize playback callbacks.
 * @param {object} callbacks
 *   - onProgress: (currentTime, totalTime, noteInfo) => void
 *   - onEnd: () => void
 */
export function initPlayback(callbacks) {
  onPlaybackProgress = callbacks.onProgress;
  onPlaybackEnd = callbacks.onEnd;
}

/**
 * Create or resume the AudioContext (must be called from a user gesture).
 */
function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

/**
 * Play a single note using an oscillator with ADSR envelope.
 * @param {number} frequency - Hz
 * @param {number} startTime - audioContext time
 * @param {number} duration - seconds
 * @param {number} gain - volume (0-1)
 */
function playTone(frequency, startTime, duration, gain = 0.5) {
  if (!audioContext) return;

  const osc = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  // Use a composite waveform for a richer piano-like tone
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, startTime);

  // ADSR envelope
  const a = ENVELOPE.attack;
  const d = ENVELOPE.decay;
  const s = ENVELOPE.sustain;
  const r = ENVELOPE.release;

  gainNode.gain.setValueAtTime(0, startTime);
  // Attack
  gainNode.gain.linearRampToValueAtTime(gain, startTime + a);
  // Decay to sustain
  gainNode.gain.linearRampToValueAtTime(gain * s, startTime + a + d);
  // Sustain (hold)
  gainNode.gain.setValueAtTime(gain * s, startTime + duration - r);
  // Release
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(audioContext.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05); // small buffer to allow release
}

/**
 * Build a flat timeline of all events from the score.
 * Each event: { time, duration, frequencies[], staffIndex, measureIndex, noteIndex, dynamics }
 * @param {object} score
 * @returns {Array} sorted event list
 */
function buildTimeline(score) {
  const bpm = score.tempo;
  const beatDuration = 60 / bpm; // seconds per beat
  const events = [];

  // Process each staff independently
  for (let si = 0; si < score.staves.length; si++) {
    const staff = score.staves[si];
    let currentTime = 0;

    for (let mi = 0; mi < staff.measures.length; mi++) {
      const measure = staff.measures[mi];

      for (let ni = 0; ni < measure.notes.length; ni++) {
        const noteData = measure.notes[ni];
        const beats = DURATION_VALUES[noteData.duration] || 1;
        const noteDuration = beats * beatDuration;

        if (noteData.type !== 'rest') {
          const frequencies = noteData.keys.map(key => {
            const midi = keyToMidi(key);
            return midiToFrequency(midi);
          });

          events.push({
            time: currentTime,
            duration: noteDuration,
            frequencies,
            staffIndex: si,
            measureIndex: mi,
            noteIndex: ni,
            dynamics: noteData.dynamics || 'mf',
          });
        } else {
          // Still push a rest event for cursor tracking
          events.push({
            time: currentTime,
            duration: noteDuration,
            frequencies: [],
            staffIndex: si,
            measureIndex: mi,
            noteIndex: ni,
            dynamics: '',
            isRest: true,
          });
        }

        currentTime += noteDuration;
      }
    }
  }

  events.sort((a, b) => a.time - b.time);
  return events;
}

/**
 * Start playback of the score.
 * @param {object} score
 * @param {HTMLElement} container - #score-container for cursor overlay
 */
export function startPlayback(score, container) {
  if (isPlaying) return;
  ensureAudioContext();
  isPlaying = true;

  const timeline = buildTimeline(score);
  if (timeline.length === 0) {
    isPlaying = false;
    return;
  }

  // Calculate total duration
  const lastEvent = timeline[timeline.length - 1];
  const totalDuration = lastEvent.time + lastEvent.duration;

  // Create visual cursor
  createCursor(container);

  const startAudioTime = audioContext.currentTime + 0.1; // small delay to let things set up

  // Schedule all notes
  for (const event of timeline) {
    if (!event.isRest) {
      const gain = DYNAMICS_GAIN[event.dynamics] || 0.5;
      for (const freq of event.frequencies) {
        playTone(freq, startAudioTime + event.time, event.duration * 0.9, gain);
      }
    }
  }

  // Animate cursor and progress bar
  const startWallTime = performance.now() + 100; // matches the 0.1s audio delay

  function animate() {
    if (!isPlaying) return;

    const elapsed = (performance.now() - startWallTime) / 1000;

    if (elapsed >= totalDuration) {
      stopPlayback();
      return;
    }

    // Find current event for cursor positioning
    let currentEvent = timeline[0];
    for (const event of timeline) {
      if (event.time <= elapsed) {
        currentEvent = event;
      } else {
        break;
      }
    }

    // Update progress
    if (onPlaybackProgress) {
      onPlaybackProgress(elapsed, totalDuration, currentEvent);
    }

    // Position cursor
    updateCursor(currentEvent, container);

    animationFrameId = requestAnimationFrame(animate);
  }

  animationFrameId = requestAnimationFrame(animate);
}

/**
 * Stop playback.
 */
export function stopPlayback() {
  isPlaying = false;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Close and recreate audio context to stop all sounds immediately
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  removeCursor();

  if (onPlaybackEnd) {
    onPlaybackEnd();
  }
}

/**
 * Is the engine currently playing?
 * @returns {boolean}
 */
export function getIsPlaying() {
  return isPlaying;
}

/**
 * Create the playback cursor element.
 */
function createCursor(container) {
  removeCursor();
  cursorElement = document.createElement('div');
  cursorElement.className = 'playback-cursor';
  cursorElement.style.position = 'absolute';
  cursorElement.style.width = '3px';
  cursorElement.style.background = '#2563eb';
  cursorElement.style.opacity = '0.7';
  cursorElement.style.pointerEvents = 'none';
  cursorElement.style.zIndex = '10';
  cursorElement.style.display = 'none';
  container.style.position = 'relative';
  container.appendChild(cursorElement);
}

/**
 * Update cursor position to match the current note being played.
 */
function updateCursor(event, container) {
  if (!cursorElement || !event) return;

  // Get the SVG and find the note element
  const svg = container.querySelector('svg');
  if (!svg) return;

  // Use the renderer's noteElementMap via the getNoteElementMap import
  // Since we can't import renderer here without circular deps,
  // we'll use a different approach: store bounding boxes during render
  // and access via a global lookup.
  // For now, we use a simpler approach: estimate position from event data.

  // The cursor will be positioned using note element bounding boxes
  // passed through the progress callback.
  // This is handled by app.js which has access to the renderer.

  cursorElement.style.display = 'block';
}

/**
 * Set cursor position directly (called from app.js with bbox data).
 * @param {number} x
 * @param {number} y
 * @param {number} height
 */
export function setCursorPosition(x, y, height) {
  if (!cursorElement) return;
  cursorElement.style.display = 'block';
  cursorElement.style.left = x + 'px';
  cursorElement.style.top = y + 'px';
  cursorElement.style.height = height + 'px';
}

/**
 * Remove the cursor element.
 */
function removeCursor() {
  if (cursorElement && cursorElement.parentNode) {
    cursorElement.parentNode.removeChild(cursorElement);
  }
  cursorElement = null;
}
```

### Step 6.2: Wire playback into `js/app.js`

Add these imports and wire the playback functions into `app.js`. Update the relevant sections:

At the top of `app.js`, add the import:

```javascript
import { initPlayback, startPlayback, stopPlayback, getIsPlaying, setCursorPosition } from './playback.js';
import { getNoteBoundingBox, getStaveBounds } from './renderer.js';
```

Replace the `togglePlayback` placeholder in `app.js`:

```javascript
function togglePlayback() {
  if (getIsPlaying()) {
    stopPlayback();
    state.isPlaying = false;
    document.getElementById('btn-play').textContent = '\u25B6 Play';
    document.getElementById('btn-play').classList.remove('playing');
    document.getElementById('progress-fill').style.width = '0%';
  } else {
    state.isPlaying = true;
    document.getElementById('btn-play').textContent = '\u25A0 Pause';
    document.getElementById('btn-play').classList.add('playing');
    const container = document.getElementById('score-container');
    startPlayback(state.score, container);
  }
}
```

Add playback button handlers in `setupFileActions` (or a new `setupPlayback` function):

```javascript
function setupPlayback() {
  document.getElementById('btn-play').addEventListener('click', togglePlayback);
  document.getElementById('btn-stop').addEventListener('click', () => {
    stopPlayback();
    state.isPlaying = false;
    document.getElementById('btn-play').textContent = '\u25B6 Play';
    document.getElementById('btn-play').classList.remove('playing');
    document.getElementById('progress-fill').style.width = '0%';
  });

  initPlayback({
    onProgress: (currentTime, totalTime, noteEvent) => {
      // Update progress bar
      const pct = (currentTime / totalTime) * 100;
      document.getElementById('progress-fill').style.width = pct + '%';

      // Position cursor using renderer bounding box data
      if (noteEvent) {
        const bb = getNoteBoundingBox(noteEvent.staffIndex, noteEvent.measureIndex, noteEvent.noteIndex);
        const sb = getStaveBounds(noteEvent.staffIndex, noteEvent.measureIndex);
        if (bb && sb) {
          setCursorPosition(bb.x + bb.w / 2, sb.y, sb.height);
        }
      }
    },
    onEnd: () => {
      state.isPlaying = false;
      document.getElementById('btn-play').textContent = '\u25B6 Play';
      document.getElementById('btn-play').classList.remove('playing');
      document.getElementById('progress-fill').style.width = '0%';
    },
  });
}
```

Call `setupPlayback()` from `init()`.

### Step 6.3: Full updated `js/app.js`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/app.js` (complete replacement)

```javascript
// app.js — Bootstrap, orchestration, toolbar, keyboard, playback, file actions
import { createScore, cloneScore } from './score-model.js';
import { renderScore, getNoteElementMap, getNoteBoundingBox, getStaveBounds } from './renderer.js';
import {
  initEditor, getEditorState, setDuration, toggleAccidental,
  toggleRestMode, toggleDynamics, handleScoreClick,
  insertNoteByKey, deleteSelectedNote, navigateSelection,
  changeOctave, toggleTie, switchStaff
} from './editor.js';
import { initPlayback, startPlayback, stopPlayback, getIsPlaying, setCursorPosition } from './playback.js';

// ============================================================
// Application State
// ============================================================
const state = {
  score: null,
  selection: null,
  undoStack: [],
  redoStack: [],
  isPlaying: false,
};

const MAX_UNDO = 50;

// ============================================================
// Core functions
// ============================================================

function render() {
  const container = document.getElementById('score-container');
  renderScore(state.score, container, state.selection);
  syncToolbar();
  syncHeader();
}

function syncHeader() {
  const titleEl = document.getElementById('score-title');
  const composerEl = document.getElementById('score-composer');
  if (document.activeElement !== titleEl) {
    titleEl.textContent = state.score.title;
  }
  if (document.activeElement !== composerEl) {
    composerEl.textContent = state.score.composer;
  }
  document.getElementById('bpm-input').value = state.score.tempo;
}

function syncToolbar() {
  const es = getEditorState();
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.duration === es.currentDuration);
  });
  document.querySelectorAll('.accidental-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accidental === es.currentAccidental);
  });
  document.getElementById('btn-rest').classList.toggle('active', es.restMode);
  document.querySelectorAll('.dynamics-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dynamics === es.currentDynamics);
  });
}

function pushUndo() {
  state.undoStack.push(JSON.stringify(state.score));
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
  state.redoStack = [];
}

function undo() {
  if (state.undoStack.length === 0) return;
  state.redoStack.push(JSON.stringify(state.score));
  state.score = JSON.parse(state.undoStack.pop());
  state.selection = null;
  render();
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(JSON.stringify(state.score));
  state.score = JSON.parse(state.redoStack.pop());
  state.selection = null;
  render();
}

// ============================================================
// Playback
// ============================================================

function togglePlayback() {
  if (getIsPlaying()) {
    stopPlayback();
    state.isPlaying = false;
    document.getElementById('btn-play').textContent = '\u25B6 Play';
    document.getElementById('btn-play').classList.remove('playing');
    document.getElementById('progress-fill').style.width = '0%';
  } else {
    state.isPlaying = true;
    document.getElementById('btn-play').textContent = '\u25A0 Pause';
    document.getElementById('btn-play').classList.add('playing');
    const container = document.getElementById('score-container');
    startPlayback(state.score, container);
  }
}

function setupPlayback() {
  document.getElementById('btn-play').addEventListener('click', togglePlayback);
  document.getElementById('btn-stop').addEventListener('click', () => {
    stopPlayback();
    state.isPlaying = false;
    document.getElementById('btn-play').textContent = '\u25B6 Play';
    document.getElementById('btn-play').classList.remove('playing');
    document.getElementById('progress-fill').style.width = '0%';
  });

  initPlayback({
    onProgress: (currentTime, totalTime, noteEvent) => {
      const pct = (currentTime / totalTime) * 100;
      document.getElementById('progress-fill').style.width = pct + '%';

      if (noteEvent) {
        const bb = getNoteBoundingBox(noteEvent.staffIndex, noteEvent.measureIndex, noteEvent.noteIndex);
        const sb = getStaveBounds(noteEvent.staffIndex, noteEvent.measureIndex);
        if (bb && sb) {
          setCursorPosition(bb.x + bb.w / 2, sb.y, sb.height);
        }
      }
    },
    onEnd: () => {
      state.isPlaying = false;
      document.getElementById('btn-play').textContent = '\u25B6 Play';
      document.getElementById('btn-play').classList.remove('playing');
      document.getElementById('progress-fill').style.width = '0%';
    },
  });
}

// ============================================================
// Toolbar
// ============================================================

function setupToolbar() {
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDuration(btn.dataset.duration);
      syncToolbar();
    });
  });

  document.querySelectorAll('.accidental-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleAccidental(btn.dataset.accidental);
      syncToolbar();
    });
  });

  document.getElementById('btn-rest').addEventListener('click', () => {
    toggleRestMode();
    syncToolbar();
  });

  document.querySelectorAll('.dynamics-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleDynamics(btn.dataset.dynamics);
      syncToolbar();
    });
  });

  document.getElementById('btn-tie').addEventListener('click', () => {
    toggleTie();
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  document.getElementById('bpm-input').addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (val >= 20 && val <= 300) {
      pushUndo();
      state.score.tempo = val;
    }
  });

  document.getElementById('score-title').addEventListener('blur', (e) => {
    const newTitle = e.target.textContent.trim();
    if (newTitle && newTitle !== state.score.title) {
      pushUndo();
      state.score.title = newTitle;
    }
  });

  document.getElementById('score-composer').addEventListener('blur', (e) => {
    const newComposer = e.target.textContent.trim();
    if (newComposer && newComposer !== state.score.composer) {
      pushUndo();
      state.score.composer = newComposer;
    }
  });
}

// ============================================================
// Score area click
// ============================================================

function setupScoreClick() {
  document.getElementById('score-container').addEventListener('click', (e) => {
    if (state.isPlaying) return;
    handleScoreClick(e, getNoteElementMap());
  });
}

// ============================================================
// Keyboard shortcuts
// ============================================================

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    const key = e.key;
    const ctrl = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;

    // Note entry: c d e f g a b
    if (!ctrl && !shift && 'cdefgab'.includes(key.toLowerCase()) && key.length === 1) {
      e.preventDefault();
      insertNoteByKey(key.toLowerCase());
      return;
    }

    // Duration: 1-5
    const durMap = { '1': 'w', '2': 'h', '3': 'q', '4': '8', '5': '16' };
    if (!ctrl && !shift && durMap[key]) {
      e.preventDefault();
      setDuration(durMap[key]);
      syncToolbar();
      return;
    }

    // Sharp: s
    if (!ctrl && !shift && key === 's') {
      e.preventDefault();
      toggleAccidental('#');
      syncToolbar();
      return;
    }

    // Flat: Shift+F
    if (!ctrl && shift && key === 'F') {
      e.preventDefault();
      toggleAccidental('b');
      syncToolbar();
      return;
    }

    // Rest: r
    if (!ctrl && !shift && key === 'r') {
      e.preventDefault();
      toggleRestMode();
      syncToolbar();
      return;
    }

    // Tie: t
    if (!ctrl && !shift && key === 't') {
      e.preventDefault();
      toggleTie();
      return;
    }

    // Delete
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      deleteSelectedNote();
      return;
    }

    // Navigate
    if (!shift && key === 'ArrowLeft') {
      e.preventDefault();
      navigateSelection(-1);
      return;
    }
    if (!shift && key === 'ArrowRight') {
      e.preventDefault();
      navigateSelection(1);
      return;
    }

    // Octave
    if (shift && key === 'ArrowUp') {
      e.preventDefault();
      changeOctave(1);
      return;
    }
    if (shift && key === 'ArrowDown') {
      e.preventDefault();
      changeOctave(-1);
      return;
    }

    // Play/Stop
    if (key === ' ') {
      e.preventDefault();
      togglePlayback();
      return;
    }

    // Undo
    if (ctrl && !shift && key === 'z') {
      e.preventDefault();
      undo();
      return;
    }

    // Redo
    if (ctrl && shift && (key === 'Z' || key === 'z')) {
      e.preventDefault();
      redo();
      return;
    }

    // Switch staff
    if (key === 'Tab') {
      e.preventDefault();
      switchStaff();
      return;
    }
  });
}

// ============================================================
// File actions (Save/Load/Export wired in Task 8)
// ============================================================

function setupFileActions() {
  document.getElementById('btn-new').addEventListener('click', () => {
    document.getElementById('new-dialog').showModal();
  });

  document.getElementById('new-dialog-cancel').addEventListener('click', () => {
    document.getElementById('new-dialog').close();
  });

  document.getElementById('new-dialog-create').addEventListener('click', () => {
    const title = document.getElementById('new-title').value || 'Untitled';
    const composer = document.getElementById('new-composer').value || 'Composer';
    const timeSig = document.getElementById('new-time-sig').value;
    const keySig = document.getElementById('new-key-sig').value;
    const bpm = parseInt(document.getElementById('new-bpm').value, 10) || 120;
    const measures = parseInt(document.getElementById('new-measures').value, 10) || 4;

    state.score = createScore({
      title, composer, timeSignature: timeSig,
      keySignature: keySig, tempo: bpm, measures,
    });
    state.selection = null;
    state.undoStack = [];
    state.redoStack = [];
    document.getElementById('new-dialog').close();
    render();
  });

  // Save, Load, Export placeholders (wired in Task 8)
  document.getElementById('btn-save').addEventListener('click', () => {
    saveScore();
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    showLoadDialog();
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    exportScore();
  });

  document.getElementById('load-dialog-cancel').addEventListener('click', () => {
    document.getElementById('load-dialog').close();
  });
}

// Placeholder functions (replaced in Task 8)
function saveScore() { console.log('Save — wired in Task 8'); }
function showLoadDialog() { console.log('Load — wired in Task 8'); }
function exportScore() { console.log('Export — wired in Task 8'); }

// ============================================================
// Init
// ============================================================

function init() {
  state.score = createScore({ title: 'Untitled', composer: 'Composer', measures: 4 });

  initEditor({
    onScoreChange: render,
    getScore: () => state.score,
    getSelection: () => state.selection,
    setSelection: (sel) => { state.selection = sel; },
    pushUndo: pushUndo,
  });

  setupToolbar();
  setupScoreClick();
  setupKeyboard();
  setupPlayback();
  setupFileActions();

  render();
  console.log('Piano Piece Editor initialized');
}

window._state = state;
window._render = render;
window._undo = undo;
window._redo = redo;

document.addEventListener('DOMContentLoaded', init);
```

### Step 6.4: Verification

**In browser:**
1. Add some notes (press `c d e f g a b` on keyboard)
2. Press `Space` or click "Play" button
3. Verify:
   - Sound plays from speakers (triangle wave, piano-like envelope)
   - Notes sound in correct order at correct pitches
   - Blue vertical cursor bar moves across the score
   - Progress bar fills left to right
   - Play button text changes to "Pause"
   - When done, button reverts to "Play"
4. Click "Stop" — sound stops immediately
5. Change BPM to 60, play again — notes are slower
6. Change BPM to 200, play again — notes are faster

**Console verification:**
```javascript
// Quick test: play a C major scale
const SM = await import('./js/score-model.js');
const s = window._state.score;
['c/4','d/4','e/4','f/4','g/4','a/4','b/4','c/5'].forEach((key, i) => {
  SM.addNote(s, 0, Math.floor(i/4), -1, SM.createNote([key], 'q'));
});
window._render();
// Now press Space to hear the scale
console.log('Playback test: add notes then press Space');
```

### Step 6.5: Git commit

```bash
git add js/playback.js js/app.js
git commit -m "Add playback.js: Web Audio oscillator+ADSR, scheduler, visual cursor, dynamics"
```

---

## Task 7: Storage (storage.js)

**Goal / Objetivo**: Save/load scores via localStorage. Export as JSON file download. Load dialog with list of saved scores.

### Step 7.1: Create `js/storage.js`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/storage.js`

```javascript
// storage.js — Save, load, and export scores via localStorage

const STORAGE_KEY = 'piano-piece-editor-scores';

/**
 * Get all saved scores from localStorage.
 * @returns {object} { [id]: { title, composer, savedAt, data } }
 */
export function getAllScores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to read scores from localStorage:', e);
    return {};
  }
}

/**
 * Save a score to localStorage.
 * Uses title as a simple key (overwrites if same title exists).
 * @param {object} score - the Score Model object
 * @returns {string} the storage ID used
 */
export function saveScoreToStorage(score) {
  const scores = getAllScores();
  const id = generateId(score.title);

  scores[id] = {
    title: score.title,
    composer: score.composer,
    savedAt: new Date().toISOString(),
    data: score,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    console.log(`Score saved: "${score.title}" (id: ${id})`);
  } catch (e) {
    console.error('Failed to save score:', e);
    alert('Failed to save — localStorage might be full.');
  }

  return id;
}

/**
 * Load a score from localStorage by ID.
 * @param {string} id
 * @returns {object|null} the Score Model object, or null if not found
 */
export function loadScoreFromStorage(id) {
  const scores = getAllScores();
  if (scores[id] && scores[id].data) {
    return JSON.parse(JSON.stringify(scores[id].data)); // deep copy
  }
  return null;
}

/**
 * Delete a score from localStorage by ID.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteScoreFromStorage(id) {
  const scores = getAllScores();
  if (scores[id]) {
    delete scores[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    return true;
  }
  return false;
}

/**
 * Export a score as a downloadable .json file.
 * @param {object} score
 */
export function exportScoreAsJSON(score) {
  const json = JSON.stringify(score, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(score.title) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a storage-safe ID from a title string.
 * @param {string} title
 * @returns {string}
 */
function generateId(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';
}

/**
 * Sanitize a string for use as a filename.
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'score';
}
```

### Step 7.2: Wire storage into `js/app.js`

Add the import at the top of `app.js`:

```javascript
import { saveScoreToStorage, loadScoreFromStorage, deleteScoreFromStorage, getAllScores, exportScoreAsJSON } from './storage.js';
```

Replace the placeholder functions `saveScore`, `showLoadDialog`, `exportScore`:

```javascript
function saveScore() {
  saveScoreToStorage(state.score);
  alert(`Saved: "${state.score.title}"`);
}

function showLoadDialog() {
  const dialog = document.getElementById('load-dialog');
  const list = document.getElementById('saved-scores-list');
  list.innerHTML = '';

  const scores = getAllScores();
  const ids = Object.keys(scores);

  if (ids.length === 0) {
    list.innerHTML = '<li style="opacity:0.5">No saved scores.</li>';
  } else {
    for (const id of ids) {
      const entry = scores[id];
      const li = document.createElement('li');

      const info = document.createElement('span');
      info.textContent = `${entry.title} — ${entry.composer} (${new Date(entry.savedAt).toLocaleDateString()})`;
      info.style.cursor = 'pointer';
      info.addEventListener('click', () => {
        const loaded = loadScoreFromStorage(id);
        if (loaded) {
          state.score = loaded;
          state.selection = null;
          state.undoStack = [];
          state.redoStack = [];
          dialog.close();
          render();
        }
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'score-delete-btn';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${entry.title}"?`)) {
          deleteScoreFromStorage(id);
          showLoadDialog(); // refresh list
        }
      });

      li.appendChild(info);
      li.appendChild(delBtn);
      list.appendChild(li);
    }
  }

  dialog.showModal();
}

function exportScore() {
  exportScoreAsJSON(state.score);
}
```

### Step 7.3: Verification

**In browser:**
1. Add some notes to the score
2. Click "Save" -- should show "Saved: Untitled" alert
3. Reload the page (F5)
4. Click "Load" -- dialog appears with "Untitled" entry
5. Click on the entry -- score loads with the notes you added
6. Click "Export" -- a `.json` file downloads
7. Open the downloaded file -- valid JSON matching the Score Model schema
8. In the Load dialog, click "Delete" on a score -- it disappears from the list

**Console verification:**
```javascript
const ST = await import('./js/storage.js');
console.assert(Object.keys(ST.getAllScores()).length >= 0, 'getAllScores works');
ST.saveScoreToStorage(window._state.score);
const all = ST.getAllScores();
console.assert(Object.keys(all).length >= 1, 'Score saved');
console.log('Storage tests passed');
```

### Step 7.4: Git commit

```bash
git add js/storage.js js/app.js
git commit -m "Add storage.js: save/load/delete via localStorage, export as JSON file"
```

---

## Task 8: Undo/Redo Refinement (undo-redo.js)

**Goal / Objetivo**: Extract undo/redo into a dedicated module with the command pattern for cleaner architecture.

### Step 8.1: Create `js/undo-redo.js`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/undo-redo.js`

```javascript
// undo-redo.js — Command pattern undo/redo stack
// Stores score snapshots as JSON strings for simplicity.
// Each mutation snapshot-before → push to undo stack.

const MAX_HISTORY = 50;

let undoStack = [];
let redoStack = [];

/**
 * Push the current score state onto the undo stack.
 * Call this BEFORE mutating the score.
 * @param {object} score - the current Score Model
 */
export function pushState(score) {
  undoStack.push(JSON.stringify(score));
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  // Any new action clears the redo stack
  redoStack = [];
}

/**
 * Undo: pop from undo stack, push current to redo stack.
 * @param {object} currentScore - the current Score Model
 * @returns {object|null} the restored score, or null if nothing to undo
 */
export function undo(currentScore) {
  if (undoStack.length === 0) return null;
  redoStack.push(JSON.stringify(currentScore));
  return JSON.parse(undoStack.pop());
}

/**
 * Redo: pop from redo stack, push current to undo stack.
 * @param {object} currentScore - the current Score Model
 * @returns {object|null} the restored score, or null if nothing to redo
 */
export function redo(currentScore) {
  if (redoStack.length === 0) return null;
  undoStack.push(JSON.stringify(currentScore));
  return JSON.parse(redoStack.pop());
}

/**
 * Check if undo is available.
 * @returns {boolean}
 */
export function canUndo() {
  return undoStack.length > 0;
}

/**
 * Check if redo is available.
 * @returns {boolean}
 */
export function canRedo() {
  return redoStack.length > 0;
}

/**
 * Clear both stacks (e.g., when loading a new score).
 */
export function clearHistory() {
  undoStack = [];
  redoStack = [];
}
```

### Step 8.2: Update `js/app.js` to use `undo-redo.js`

Add the import:

```javascript
import { pushState, undo as undoAction, redo as redoAction, clearHistory, canUndo, canRedo } from './undo-redo.js';
```

Replace the inline undo/redo logic in `app.js`:

```javascript
// Remove the old state.undoStack, state.redoStack from state object
// Remove the old pushUndo, undo, redo functions
// Replace with:

function pushUndo() {
  pushState(state.score);
}

function undo() {
  const restored = undoAction(state.score);
  if (restored) {
    state.score = restored;
    state.selection = null;
    render();
  }
}

function redo() {
  const restored = redoAction(state.score);
  if (restored) {
    state.score = restored;
    state.selection = null;
    render();
  }
}
```

In the "New Score" handler and "Load" handler, call `clearHistory()` after creating/loading a new score.

Update `syncToolbar` to disable undo/redo buttons when stacks are empty:

```javascript
// Add to syncToolbar():
document.getElementById('btn-undo').disabled = !canUndo();
document.getElementById('btn-redo').disabled = !canRedo();
```

Add a CSS rule for disabled buttons:

```css
/* Add to style.css */
.tool-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

### Step 8.3: Verification

1. Add a note (press `c`) -- note appears
2. Press `Cmd+Z` -- note disappears (undo)
3. Press `Cmd+Shift+Z` -- note reappears (redo)
4. Add several notes, undo multiple times -- each step reverts correctly
5. After undoing, add a new note -- redo stack is cleared (redo button stays disabled)
6. Create a new score (click New, then Create) -- undo/redo stacks are cleared

**Console verification:**
```javascript
const UR = await import('./js/undo-redo.js');
console.assert(typeof UR.pushState === 'function', 'pushState exists');
console.assert(typeof UR.canUndo === 'function', 'canUndo exists');
console.log('Undo/redo module verified');
```

### Step 8.4: Git commit

```bash
git add js/undo-redo.js js/app.js css/style.css
git commit -m "Extract undo-redo.js: dedicated command pattern module, disable buttons when empty"
```

---

## Task 9: Integration Polish

**Goal / Objetivo**: Final wiring, edge case fixes, auto-save, measure management, complete app.js with all imports.

### Step 9.1: Final complete `js/app.js`

**File**: `/Users/vi/Developer_vtc/piano-piece-editor/js/app.js` (final version with all features)

```javascript
// app.js — Final integrated version
// Orchestrates all modules: score-model, renderer, editor, playback, storage, undo-redo

import { createScore } from './score-model.js';
import { renderScore, getNoteElementMap, getNoteBoundingBox, getStaveBounds } from './renderer.js';
import {
  initEditor, getEditorState, setDuration, toggleAccidental,
  toggleRestMode, toggleDynamics, handleScoreClick,
  insertNoteByKey, deleteSelectedNote, navigateSelection,
  changeOctave, toggleTie, switchStaff
} from './editor.js';
import { initPlayback, startPlayback, stopPlayback, getIsPlaying, setCursorPosition } from './playback.js';
import { saveScoreToStorage, loadScoreFromStorage, deleteScoreFromStorage, getAllScores, exportScoreAsJSON } from './storage.js';
import { pushState, undo as undoAction, redo as redoAction, clearHistory, canUndo, canRedo } from './undo-redo.js';

// ============================================================
// Application State
// ============================================================
const state = {
  score: null,
  selection: null,
  isPlaying: false,
};

// ============================================================
// Core
// ============================================================

function render() {
  const container = document.getElementById('score-container');
  renderScore(state.score, container, state.selection);
  syncToolbar();
  syncHeader();
}

function syncHeader() {
  const titleEl = document.getElementById('score-title');
  const composerEl = document.getElementById('score-composer');
  if (document.activeElement !== titleEl) {
    titleEl.textContent = state.score.title;
  }
  if (document.activeElement !== composerEl) {
    composerEl.textContent = state.score.composer;
  }
  document.getElementById('bpm-input').value = state.score.tempo;
}

function syncToolbar() {
  const es = getEditorState();
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.duration === es.currentDuration);
  });
  document.querySelectorAll('.accidental-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accidental === es.currentAccidental);
  });
  document.getElementById('btn-rest').classList.toggle('active', es.restMode);
  document.querySelectorAll('.dynamics-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dynamics === es.currentDynamics);
  });
  document.getElementById('btn-undo').disabled = !canUndo();
  document.getElementById('btn-redo').disabled = !canRedo();
}

// ============================================================
// Undo/Redo
// ============================================================

function pushUndo() {
  pushState(state.score);
}

function undo() {
  const restored = undoAction(state.score);
  if (restored) {
    state.score = restored;
    state.selection = null;
    render();
  }
}

function redo() {
  const restored = redoAction(state.score);
  if (restored) {
    state.score = restored;
    state.selection = null;
    render();
  }
}

// ============================================================
// Playback
// ============================================================

function togglePlayback() {
  if (getIsPlaying()) {
    stopPlayback();
    state.isPlaying = false;
    document.getElementById('btn-play').textContent = '\u25B6 Play';
    document.getElementById('btn-play').classList.remove('playing');
    document.getElementById('progress-fill').style.width = '0%';
  } else {
    state.isPlaying = true;
    document.getElementById('btn-play').textContent = '\u25A0 Pause';
    document.getElementById('btn-play').classList.add('playing');
    const container = document.getElementById('score-container');
    startPlayback(state.score, container);
  }
}

function setupPlayback() {
  document.getElementById('btn-play').addEventListener('click', togglePlayback);
  document.getElementById('btn-stop').addEventListener('click', () => {
    stopPlayback();
    state.isPlaying = false;
    document.getElementById('btn-play').textContent = '\u25B6 Play';
    document.getElementById('btn-play').classList.remove('playing');
    document.getElementById('progress-fill').style.width = '0%';
  });

  initPlayback({
    onProgress: (currentTime, totalTime, noteEvent) => {
      const pct = (currentTime / totalTime) * 100;
      document.getElementById('progress-fill').style.width = pct + '%';
      if (noteEvent) {
        const bb = getNoteBoundingBox(noteEvent.staffIndex, noteEvent.measureIndex, noteEvent.noteIndex);
        const sb = getStaveBounds(noteEvent.staffIndex, noteEvent.measureIndex);
        if (bb && sb) {
          setCursorPosition(bb.x + bb.w / 2, sb.y, sb.height);
        }
      }
    },
    onEnd: () => {
      state.isPlaying = false;
      document.getElementById('btn-play').textContent = '\u25B6 Play';
      document.getElementById('btn-play').classList.remove('playing');
      document.getElementById('progress-fill').style.width = '0%';
    },
  });
}

// ============================================================
// Toolbar
// ============================================================

function setupToolbar() {
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDuration(btn.dataset.duration);
      syncToolbar();
    });
  });

  document.querySelectorAll('.accidental-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleAccidental(btn.dataset.accidental);
      syncToolbar();
    });
  });

  document.getElementById('btn-rest').addEventListener('click', () => {
    toggleRestMode();
    syncToolbar();
  });

  document.querySelectorAll('.dynamics-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleDynamics(btn.dataset.dynamics);
      syncToolbar();
    });
  });

  document.getElementById('btn-tie').addEventListener('click', toggleTie);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  document.getElementById('bpm-input').addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (val >= 20 && val <= 300) {
      pushUndo();
      state.score.tempo = val;
    }
  });

  document.getElementById('score-title').addEventListener('blur', (e) => {
    const newTitle = e.target.textContent.trim();
    if (newTitle && newTitle !== state.score.title) {
      pushUndo();
      state.score.title = newTitle;
    }
  });

  document.getElementById('score-composer').addEventListener('blur', (e) => {
    const newComposer = e.target.textContent.trim();
    if (newComposer && newComposer !== state.score.composer) {
      pushUndo();
      state.score.composer = newComposer;
    }
  });
}

// ============================================================
// Score click
// ============================================================

function setupScoreClick() {
  document.getElementById('score-container').addEventListener('click', (e) => {
    if (state.isPlaying) return;
    handleScoreClick(e, getNoteElementMap());
  });
}

// ============================================================
// Keyboard
// ============================================================

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    const key = e.key;
    const ctrl = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;

    if (!ctrl && !shift && 'cdefgab'.includes(key.toLowerCase()) && key.length === 1) {
      e.preventDefault();
      insertNoteByKey(key.toLowerCase());
      return;
    }

    const durMap = { '1': 'w', '2': 'h', '3': 'q', '4': '8', '5': '16' };
    if (!ctrl && !shift && durMap[key]) {
      e.preventDefault();
      setDuration(durMap[key]);
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 's') {
      e.preventDefault();
      toggleAccidental('#');
      syncToolbar();
      return;
    }

    if (!ctrl && shift && key === 'F') {
      e.preventDefault();
      toggleAccidental('b');
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 'r') {
      e.preventDefault();
      toggleRestMode();
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 't') {
      e.preventDefault();
      toggleTie();
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      deleteSelectedNote();
      return;
    }

    if (!shift && key === 'ArrowLeft') { e.preventDefault(); navigateSelection(-1); return; }
    if (!shift && key === 'ArrowRight') { e.preventDefault(); navigateSelection(1); return; }
    if (shift && key === 'ArrowUp') { e.preventDefault(); changeOctave(1); return; }
    if (shift && key === 'ArrowDown') { e.preventDefault(); changeOctave(-1); return; }

    if (key === ' ') { e.preventDefault(); togglePlayback(); return; }

    if (ctrl && !shift && key === 'z') { e.preventDefault(); undo(); return; }
    if (ctrl && shift && (key === 'Z' || key === 'z')) { e.preventDefault(); redo(); return; }

    if (key === 'Tab') { e.preventDefault(); switchStaff(); return; }
  });
}

// ============================================================
// File Actions
// ============================================================

function saveScore() {
  saveScoreToStorage(state.score);
  // Brief visual feedback
  const btn = document.getElementById('btn-save');
  const orig = btn.textContent;
  btn.textContent = 'Saved!';
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

function showLoadDialog() {
  const dialog = document.getElementById('load-dialog');
  const list = document.getElementById('saved-scores-list');
  list.innerHTML = '';

  const scores = getAllScores();
  const ids = Object.keys(scores);

  if (ids.length === 0) {
    const li = document.createElement('li');
    li.style.opacity = '0.5';
    li.textContent = 'No saved scores.';
    list.appendChild(li);
  } else {
    for (const id of ids) {
      const entry = scores[id];
      const li = document.createElement('li');

      const info = document.createElement('span');
      info.textContent = `${entry.title} — ${entry.composer} (${new Date(entry.savedAt).toLocaleDateString()})`;
      info.style.cursor = 'pointer';
      info.addEventListener('click', () => {
        const loaded = loadScoreFromStorage(id);
        if (loaded) {
          state.score = loaded;
          state.selection = null;
          clearHistory();
          dialog.close();
          render();
        }
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'score-delete-btn';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (confirm(`Delete "${entry.title}"?`)) {
          deleteScoreFromStorage(id);
          showLoadDialog();
        }
      });

      li.appendChild(info);
      li.appendChild(delBtn);
      list.appendChild(li);
    }
  }

  dialog.showModal();
}

function exportScore() {
  exportScoreAsJSON(state.score);
}

function setupFileActions() {
  document.getElementById('btn-new').addEventListener('click', () => {
    document.getElementById('new-dialog').showModal();
  });

  document.getElementById('new-dialog-cancel').addEventListener('click', () => {
    document.getElementById('new-dialog').close();
  });

  document.getElementById('new-dialog-create').addEventListener('click', () => {
    const title = document.getElementById('new-title').value || 'Untitled';
    const composer = document.getElementById('new-composer').value || 'Composer';
    const timeSig = document.getElementById('new-time-sig').value;
    const keySig = document.getElementById('new-key-sig').value;
    const bpm = parseInt(document.getElementById('new-bpm').value, 10) || 120;
    const measures = parseInt(document.getElementById('new-measures').value, 10) || 4;

    state.score = createScore({
      title, composer, timeSignature: timeSig,
      keySignature: keySig, tempo: bpm, measures,
    });
    state.selection = null;
    clearHistory();
    document.getElementById('new-dialog').close();
    render();
  });

  document.getElementById('btn-save').addEventListener('click', saveScore);
  document.getElementById('btn-load').addEventListener('click', showLoadDialog);
  document.getElementById('btn-export').addEventListener('click', exportScore);
  document.getElementById('load-dialog-cancel').addEventListener('click', () => {
    document.getElementById('load-dialog').close();
  });
}

// ============================================================
// Auto-save (every 30 seconds if there are changes)
// ============================================================

let lastSavedJSON = '';

function autoSave() {
  const currentJSON = JSON.stringify(state.score);
  if (currentJSON !== lastSavedJSON) {
    saveScoreToStorage(state.score);
    lastSavedJSON = currentJSON;
    console.log('Auto-saved');
  }
}

// ============================================================
// Init
// ============================================================

function init() {
  // Try to load the last saved score, or create a new one
  const allScores = getAllScores();
  const ids = Object.keys(allScores);

  if (ids.length > 0) {
    // Load the most recently saved score
    let mostRecent = ids[0];
    let mostRecentTime = 0;
    for (const id of ids) {
      const t = new Date(allScores[id].savedAt).getTime();
      if (t > mostRecentTime) {
        mostRecentTime = t;
        mostRecent = id;
      }
    }
    state.score = loadScoreFromStorage(mostRecent) || createScore();
  } else {
    state.score = createScore({ title: 'Untitled', composer: 'Composer', measures: 4 });
  }

  lastSavedJSON = JSON.stringify(state.score);

  initEditor({
    onScoreChange: render,
    getScore: () => state.score,
    getSelection: () => state.selection,
    setSelection: (sel) => { state.selection = sel; },
    pushUndo: pushUndo,
  });

  setupToolbar();
  setupScoreClick();
  setupKeyboard();
  setupPlayback();
  setupFileActions();

  // Auto-save every 30 seconds
  setInterval(autoSave, 30000);

  render();
  console.log('Piano Piece Editor initialized');
}

window._state = state;
window._render = render;

document.addEventListener('DOMContentLoaded', init);
```

### Step 9.2: Final Verification Checklist

Run through all spec verification criteria:

**1. Open `index.html` in browser -- interface loads without errors**
```bash
cd /Users/vi/Developer_vtc/piano-piece-editor && python3 -m http.server 8080
# Open http://localhost:8080 in browser
```
- Console: no errors, "Piano Piece Editor initialized" message
- All 4 zones visible: top bar, toolbar, score area, playback bar

**2. Add notes by clicking on the staff -- notes appear correctly**
- Select quarter note (Q button or press `3`)
- Click on the treble staff -- note appears at the Y position you clicked
- Note pitch corresponds to vertical position on the staff

**3. Use keyboard shortcuts to insert notes -- works**
- Press `c` `d` `e` `f` -- four notes appear in sequence
- Press `1` then `c` -- whole note C
- Press `s` then `c` -- C# (sharp)
- Press `r` then `c` -- rest appears instead

**4. Press Play -- music plays with correct timing**
- Add a few notes, press Space
- Sound plays from speakers, correct pitches, correct timing
- Blue cursor moves across the score
- Progress bar fills
- When done, reverts to Play button

**5. Save and reload the page -- score persists**
- Click Save, reload page (F5)
- Score loads automatically (most recent saved)
- Click Load to see the list of saved scores

**6. Export JSON -- valid file with correct structure**
- Click Export
- File downloads as `.json`
- Open file: has `title`, `composer`, `tempo`, `timeSignature`, `keySignature`, `staves` with `measures` and `notes`

**7. Additional checks:**
- Undo (Cmd+Z) / Redo (Cmd+Shift+Z) work correctly
- Delete (Backspace) removes selected note
- Arrow keys navigate between notes
- Shift+Up/Down changes octave
- Tab switches between treble/bass staff
- BPM input changes playback speed
- Title/Composer are editable (click, type, click away)
- New dialog creates a fresh score with custom settings

### Step 9.3: Final git commit

```bash
git add -A
git commit -m "Integration polish: auto-save, auto-load last score, final wiring of all modules"
```

---

## Summary of All Files

| File | Lines (approx) | Purpose |
|------|------|---------|
| `index.html` | 120 | Single page, 4 zones, dialogs, VexFlow CDN |
| `css/style.css` | 230 | Dark UI chrome, light score area, all component styles |
| `js/app.js` | 310 | Bootstrap, orchestration, toolbar, keyboard, file actions, auto-save |
| `js/score-model.js` | 260 | Data model, CRUD, duration math, pitch utilities |
| `js/renderer.js` | 220 | VexFlow rendering: staves, notes, accidentals, ties, beams |
| `js/editor.js` | 250 | Mouse click-to-place, keyboard note input, selection, navigation |
| `js/playback.js` | 200 | Web Audio oscillator+ADSR, scheduler, visual cursor |
| `js/storage.js` | 90 | localStorage save/load/delete, JSON export |
| `js/undo-redo.js` | 60 | Command pattern undo/redo stack |

**Total: ~1,740 lines across 9 files.**

## Git Commit Sequence

1. `Scaffold: index.html with 4-zone layout, style.css, VexFlow CDN, grand staff test render`
2. `Add score-model.js: data structure, CRUD operations, duration math, pitch utilities`
3. `Add renderer.js: VexFlow grand staff rendering with notes, rests, accidentals, ties, beams`
4. `Add editor.js: mouse click-to-place, note selection, navigation, accidentals, ties`
5. `Wire toolbar buttons and keyboard shortcuts to editor, undo/redo stack`
6. `Add playback.js: Web Audio oscillator+ADSR, scheduler, visual cursor, dynamics`
7. `Add storage.js: save/load/delete via localStorage, export as JSON file`
8. `Extract undo-redo.js: dedicated command pattern module, disable buttons when empty`
9. `Integration polish: auto-save, auto-load last score, final wiring of all modules`

---

### Critical Files for Implementation
- `/Users/vi/Developer_vtc/piano-piece-editor/js/score-model.js` -- the single source of truth, all other modules depend on its data structures and utility functions
- `/Users/vi/Developer_vtc/piano-piece-editor/js/renderer.js` -- the most technically complex module, translating the abstract model into VexFlow API calls for visual rendering
- `/Users/vi/Developer_vtc/piano-piece-editor/js/app.js` -- the orchestrator that wires all modules together with event handlers, keyboard shortcuts, and state management
- `/Users/vi/Developer_vtc/piano-piece-editor/index.html` -- the complete HTML structure that all modules attach to, including both dialogs
- `/Users/vi/Developer_vtc/piano-piece-editor/js/playback.js` -- the Web Audio API scheduler that converts model data into timed sound events with ADSR synthesis