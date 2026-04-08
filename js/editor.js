// editor.js — Mouse and keyboard interaction for the score editor
import {
  createNote, createRest, addNote, removeNote, replaceNote,
  DURATION_VALUES, NOTE_NAMES, parseKey, buildKey, yToKey,
  addMeasure, cloneScore
} from './score-model.js';

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

const editorState = {
  currentDuration: 'q',
  currentAccidental: '',
  currentDynamics: '',
  restMode: false,
  currentOctave: 4,
  currentStaff: 0,
};

// ---------------------------------------------------------------------------
// Callbacks (wired in by initEditor)
// ---------------------------------------------------------------------------

let onScoreChange = null;
let getScore = null;
let getSelection = null;
let setSelection = null;
let pushUndo = null;

// ---------------------------------------------------------------------------
// Public API: init
// ---------------------------------------------------------------------------

/**
 * Wire up external callbacks so the editor can read/write app state.
 *
 * @param {object} callbacks
 * @param {function} callbacks.onScoreChange  Called when score is mutated.
 * @param {function} callbacks.getScore       Returns the current score.
 * @param {function} callbacks.getSelection   Returns the current selection.
 * @param {function} callbacks.setSelection   Sets the current selection.
 * @param {function} callbacks.pushUndo       Pushes a snapshot to the undo stack.
 */
export function initEditor(callbacks) {
  onScoreChange = callbacks.onScoreChange || null;
  getScore      = callbacks.getScore      || null;
  getSelection  = callbacks.getSelection  || null;
  setSelection  = callbacks.setSelection  || null;
  pushUndo      = callbacks.pushUndo      || null;
}

// ---------------------------------------------------------------------------
// Public API: state accessors / setters
// ---------------------------------------------------------------------------

/** Returns a shallow copy of the current editor tool state. */
export function getEditorState() {
  return { ...editorState };
}

/** Set the active note duration ('w', 'h', 'q', '8', '16'). */
export function setDuration(dur) {
  if (DURATION_VALUES[dur] !== undefined) {
    editorState.currentDuration = dur;
  }
}

/**
 * Toggle an accidental on/off.  Passing the same accidental again clears it.
 * @param {string} acc  '#', 'b', or 'n'
 */
export function toggleAccidental(acc) {
  editorState.currentAccidental = editorState.currentAccidental === acc ? '' : acc;
}

/** Toggle rest-input mode on/off. */
export function toggleRestMode() {
  editorState.restMode = !editorState.restMode;
}

/**
 * Toggle a dynamics marking on/off.  Passing the same value again clears it.
 * @param {string} dyn  e.g. 'pp', 'p', 'mp', 'mf', 'f', 'ff'
 */
export function toggleDynamics(dyn) {
  editorState.currentDynamics = editorState.currentDynamics === dyn ? '' : dyn;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _pushUndoIfAvailable() {
  if (pushUndo && getScore) {
    pushUndo(cloneScore(getScore()));
  }
}

function _notifyChange() {
  if (onScoreChange) {
    onScoreChange();
  }
}

/**
 * Build a note (or rest) from the current editor state plus an explicit key.
 * @param {string} key  VexFlow-style key, e.g. 'c#/4'
 * @returns {object}   Score-model note object
 */
function _buildNoteFromState(key) {
  const { currentDuration, currentAccidental, currentDynamics, restMode } = editorState;

  if (restMode) {
    return createRest(currentDuration);
  }

  const { name, octave } = parseKey(key);
  const fullKey = buildKey(name, currentAccidental, octave);

  const options = {};
  if (currentAccidental) options.accidental = currentAccidental;
  if (currentDynamics)   options.dynamics    = currentDynamics;

  return createNote([fullKey], currentDuration, options);
}

/**
 * Determine which note in the noteElementMap was hit by a mouse event.
 * Returns the map entry or null.
 *
 * Strategy: find the entry whose staveNote bounding box contains the click,
 * or – if no exact hit – the nearest note in the clicked stave row.
 *
 * @param {MouseEvent} event
 * @param {Array}      noteElementMap  Array of {staffIndex, measureIndex, noteIndex, staveNote, stave}
 * @returns {object|null}
 */
function _hitTest(event, noteElementMap) {
  const svgEl = event.currentTarget;
  if (!svgEl) return null;

  const rect = svgEl.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;

  // First pass: exact bounding-box hit
  for (const entry of noteElementMap) {
    if (!entry.staveNote) continue;
    try {
      const bb = entry.staveNote.getBoundingBox();
      if (
        mx >= bb.getX() && mx <= bb.getX() + bb.getW() &&
        my >= bb.getY() && my <= bb.getY() + bb.getH()
      ) {
        return entry;
      }
    } catch (_) {}
  }

  // Second pass: find the stave row containing the click, then pick closest note
  let bestEntry = null;
  let bestDist  = Infinity;

  for (const entry of noteElementMap) {
    if (!entry.stave) continue;
    const staveY = entry.stave.getY();
    const staveH = entry.stave.getHeight();

    // Generous vertical band: stave height + half the gap above/below
    if (my < staveY - staveH * 0.5 || my > staveY + staveH * 1.5) continue;

    try {
      const bb = entry.staveNote.getBoundingBox();
      const cx = bb.getX() + bb.getW() / 2;
      const dist = Math.abs(mx - cx);
      if (dist < bestDist) {
        bestDist  = dist;
        bestEntry = entry;
      }
    } catch (_) {}
  }

  return bestEntry;
}

/**
 * Given a click inside a stave, compute the VexFlow key that corresponds to
 * the clicked y position.
 *
 * @param {number} my           Mouse y in SVG coordinates
 * @param {object} stave        VexFlow Stave instance
 * @param {string} clef         'treble' | 'bass'
 * @returns {string}            e.g. 'e/4'
 */
function _yToKeyFromStave(my, stave, clef) {
  const staveY = stave.getY();
  // VexFlow staff top line is 5px above the stave y coordinate
  const topLineY = staveY + 1;
  const lineSpacing = 10;
  const yOnStaff = my - topLineY;
  return yToKey(yOnStaff, clef, lineSpacing);
}

// ---------------------------------------------------------------------------
// Public API: mouse interaction
// ---------------------------------------------------------------------------

/**
 * Handle a click on the score SVG element.
 *
 * Behaviour:
 *  - If a note is hit → select it (no insert).
 *  - If empty space in a stave is hit → insert a new note at that pitch
 *    (using the current editor state for duration, accidental, etc.).
 *
 * @param {MouseEvent} event
 * @param {Array}      noteElementMap
 */
export function handleScoreClick(event, noteElementMap) {
  if (!getScore || !setSelection || !onScoreChange) return;

  const score = getScore();
  const hit   = _hitTest(event, noteElementMap);

  if (hit) {
    // Select the clicked note
    setSelection({
      staffIndex:   hit.staffIndex,
      measureIndex: hit.measureIndex,
      noteIndex:    hit.noteIndex,
    });
    _notifyChange();
    return;
  }

  // No direct hit — try to insert at the click position
  // Determine which stave (treble / bass) the click landed in
  const svgEl = event.currentTarget;
  if (!svgEl) return;

  const rect = svgEl.getBoundingClientRect();
  const my   = event.clientY - rect.top;
  const mx   = event.clientX - rect.left;

  // Find the stave entry closest vertically to the click
  let closestStaff    = null;
  let closestMeasure  = null;
  let closestStaveObj = null;
  let minVertDist     = Infinity;

  for (const entry of noteElementMap) {
    if (!entry.stave) continue;
    const staveY = entry.stave.getY();
    const staveH = entry.stave.getHeight();
    const staveM = staveY + staveH / 2;
    const dist   = Math.abs(my - staveM);
    if (dist < minVertDist) {
      minVertDist    = dist;
      closestStaff   = entry.staffIndex;
      closestMeasure = entry.measureIndex;
      closestStaveObj = entry.stave;
    }
  }

  if (closestStaff === null || closestStaveObj === null) return;

  // Only insert when click is reasonably close to a stave (within ~60px)
  if (minVertDist > 60) return;

  const clef = score.staves[closestStaff].clef;
  const key  = _yToKeyFromStave(my, closestStaveObj, clef);

  // Determine the noteIndex by finding the note whose x position is just after the click
  const measureNotes = score.staves[closestStaff].measures[closestMeasure].notes;

  // Find insertion position by looking at x positions in the map
  const measureEntries = noteElementMap.filter(
    e => e.staffIndex === closestStaff && e.measureIndex === closestMeasure
  );

  let insertIndex = measureNotes.length; // append by default
  for (const entry of measureEntries) {
    try {
      const bb = entry.staveNote.getBoundingBox();
      if (mx < bb.getX() + bb.getW() / 2) {
        if (entry.noteIndex < insertIndex) {
          insertIndex = entry.noteIndex;
        }
      }
    } catch (_) {}
  }

  _pushUndoIfAvailable();

  const note = _buildNoteFromState(key);
  const added = addNote(score, closestStaff, closestMeasure, insertIndex, note);

  if (added) {
    setSelection({
      staffIndex:   closestStaff,
      measureIndex: closestMeasure,
      noteIndex:    insertIndex,
    });
    _notifyChange();
  }
}

// ---------------------------------------------------------------------------
// Public API: keyboard note input
// ---------------------------------------------------------------------------

/**
 * Insert a note by note name (letter key pressed by the user).
 * Uses the current octave, accidental, duration, and staff from editorState.
 *
 * @param {string} noteName  One of 'a'..'g' (or 'A'..'G', will be lowercased)
 */
export function insertNoteByKey(noteName) {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const name = noteName.toLowerCase();
  if (!NOTE_NAMES.includes(name)) return;

  const score = getScore();
  const sel   = getSelection();

  // Determine target staff and measure
  const staffIndex   = editorState.currentStaff;
  let   measureIndex = sel ? sel.measureIndex : 0;
  let   noteIndex    = sel ? sel.noteIndex + 1 : 0;

  // If selection is on a different staff, still use last known measure
  if (sel && sel.staffIndex !== staffIndex) {
    measureIndex = sel.measureIndex;
    noteIndex    = -1; // append
  }

  // Clamp to valid range
  const numMeasures = score.staves[staffIndex].measures.length;
  if (measureIndex >= numMeasures) measureIndex = numMeasures - 1;

  const key  = buildKey(name, editorState.currentAccidental, editorState.currentOctave);
  const note = _buildNoteFromState(key);

  _pushUndoIfAvailable();

  const added = addNote(score, staffIndex, measureIndex, noteIndex === -1 ? -1 : noteIndex, note);

  if (added) {
    const actualIndex = noteIndex === -1
      ? score.staves[staffIndex].measures[measureIndex].notes.length - 1
      : noteIndex;

    setSelection({ staffIndex, measureIndex, noteIndex: actualIndex });
    _notifyChange();
  }
}

// ---------------------------------------------------------------------------
// Public API: delete selected note
// ---------------------------------------------------------------------------

/** Delete the currently selected note (replaces it with a rest if needed). */
export function deleteSelectedNote() {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const sel   = getSelection();
  if (!sel) return;

  const { staffIndex, measureIndex, noteIndex } = sel;

  _pushUndoIfAvailable();

  const removed = removeNote(score, staffIndex, measureIndex, noteIndex);
  if (removed) {
    const measure = score.staves[staffIndex].measures[measureIndex];
    const newIndex = Math.min(noteIndex, measure.notes.length - 1);
    setSelection({ staffIndex, measureIndex, noteIndex: newIndex });
    _notifyChange();
  }
}

// ---------------------------------------------------------------------------
// Public API: navigate selection
// ---------------------------------------------------------------------------

/**
 * Move the selection left or right through notes.
 * Wraps across measure boundaries within the same staff.
 *
 * @param {'left'|'right'} direction
 */
export function navigateSelection(direction) {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const sel   = getSelection();
  if (!sel) {
    // Nothing selected — select first note
    setSelection({ staffIndex: 0, measureIndex: 0, noteIndex: 0 });
    _notifyChange();
    return;
  }

  let { staffIndex, measureIndex, noteIndex } = sel;
  const staff      = score.staves[staffIndex];
  const numMeasures = staff.measures.length;

  if (direction === 'right') {
    noteIndex++;
    if (noteIndex >= staff.measures[measureIndex].notes.length) {
      noteIndex = 0;
      measureIndex++;
      if (measureIndex >= numMeasures) {
        // At end — optionally add measure or stay
        measureIndex = numMeasures - 1;
        noteIndex    = staff.measures[measureIndex].notes.length - 1;
      }
    }
  } else {
    noteIndex--;
    if (noteIndex < 0) {
      measureIndex--;
      if (measureIndex < 0) {
        measureIndex = 0;
        noteIndex    = 0;
      } else {
        noteIndex = staff.measures[measureIndex].notes.length - 1;
      }
    }
  }

  setSelection({ staffIndex, measureIndex, noteIndex });
  _notifyChange();
}

// ---------------------------------------------------------------------------
// Public API: change octave
// ---------------------------------------------------------------------------

/**
 * Shift the current keyboard-input octave by delta.
 * @param {number} delta  +1 or -1
 */
export function changeOctave(delta) {
  editorState.currentOctave = Math.max(1, Math.min(8, editorState.currentOctave + delta));
}

// ---------------------------------------------------------------------------
// Public API: toggle tie
// ---------------------------------------------------------------------------

/**
 * Toggle the "tied" property of the currently selected note.
 * A tie connects this note to the next note in the measure.
 */
export function toggleTie() {
  if (!getScore || !getSelection || !onScoreChange) return;

  const score = getScore();
  const sel   = getSelection();
  if (!sel) return;

  const { staffIndex, measureIndex, noteIndex } = sel;
  const measure = score.staves[staffIndex].measures[measureIndex];
  if (!measure) return;

  const note = measure.notes[noteIndex];
  if (!note || note.type === 'rest') return;

  _pushUndoIfAvailable();

  const newNote = { ...note, keys: [...note.keys] };
  newNote.tied = !note.tied;

  replaceNote(score, staffIndex, measureIndex, noteIndex, newNote);
  _notifyChange();
}

// ---------------------------------------------------------------------------
// Public API: switch staff
// ---------------------------------------------------------------------------

/**
 * Toggle keyboard-input staff between treble (0) and bass (1).
 */
export function switchStaff() {
  editorState.currentStaff = editorState.currentStaff === 0 ? 1 : 0;
  // Adjust default octave for the clef
  if (editorState.currentStaff === 1) {
    editorState.currentOctave = Math.min(editorState.currentOctave, 4);
  } else {
    editorState.currentOctave = Math.max(editorState.currentOctave, 4);
  }
}
