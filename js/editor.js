// editor.js — Mouse and keyboard interaction for the score editor
import {
  createNote, createRest, addNote, removeNote, replaceNote,
  addKeyToNote, removeKeyFromNote, insertNoteAt,
  DURATION_VALUES, NOTE_NAMES, parseKey, buildKey, yToKey,
  addMeasure, cloneScore, keyToMidi, midiToKey,
  measureDuration, fillMeasureWithRests
} from './score-model.js';

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

const editorState = {
  currentDuration: 'q',
  currentAccidental: '',
  currentDynamics: '',
  restMode: false,
  insertMode: false,
  overwriteMode: false,
  dotted: false,
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

/** Toggle insert-before mode on/off. */
export function toggleInsertMode() {
  editorState.insertMode = !editorState.insertMode;
}

/** Toggle overwrite mode on/off (letter keys replace selected note pitch). */
export function toggleOverwriteMode() {
  editorState.overwriteMode = !editorState.overwriteMode;
}

/** Toggle dotted-note mode on/off. */
export function toggleDotMode() {
  editorState.dotted = !editorState.dotted;
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

/** Get the first (primary) selection from the array, or null. */
function _primarySel() {
  const sel = getSelection ? getSelection() : [];
  return (Array.isArray(sel) && sel.length > 0) ? sel[0] : (sel && !Array.isArray(sel)) ? sel : null;
}

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

  const note = createNote([fullKey], currentDuration, options);
  if (editorState.dotted) note.dotted = true;
  return note;
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
/**
 * Get mouse coordinates relative to the SVG element inside the container.
 * The SVG may be centered with margin:auto, so we must use its rect, not the container's.
 */
function _svgCoords(event) {
  const container = event.currentTarget;
  const svg = container && container.querySelector('svg');
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  return {
    mx: event.clientX - rect.left,
    my: event.clientY - rect.top,
  };
}

function _hitTest(event, noteElementMap) {
  const coords = _svgCoords(event);
  if (!coords) return null;
  const { mx, my } = coords;

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
  const topLineY = stave.getYForLine(0);
  const lineSpacing = stave.getSpacingBetweenLines();
  const yOnStaff = my - topLineY;
  return yToKey(yOnStaff, clef, lineSpacing);
}

/**
 * Compute ghost-note preview info from a mouse position over the score SVG.
 * Returns null if the mouse is not close enough to any stave.
 *
 * @param {MouseEvent} event
 * @param {Array}      noteElementMap
 * @returns {{ x: number, snapY: number, key: string, staffIndex: number, staveHeight: number }|null}
 */
export function getGhostNoteInfo(event, noteElementMap) {
  if (!getScore) return null;

  const container = event.currentTarget;
  const svg = container && container.querySelector('svg');
  if (!svg) return null;

  const containerRect = container.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  // Offset from container origin to SVG origin (accounts for centering margin)
  const svgOffsetX = svgRect.left - containerRect.left;
  const svgOffsetY = svgRect.top - containerRect.top;

  const mx = event.clientX - svgRect.left;
  const my = event.clientY - svgRect.top;

  // Find the closest stave to the mouse
  let closestStave = null;
  let closestStaffIndex = null;
  let bestDist = Infinity;
  const seen = new Set();

  for (const entry of noteElementMap) {
    if (!entry.stave) continue;
    const key = `${entry.staffIndex}-${entry.measureIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const staveX = entry.stave.getX();
    const staveW = entry.stave.getWidth();
    const topLine = entry.stave.getYForLine(0);
    const botLine = entry.stave.getYForLine(4);

    // Horizontal: must be within stave bounds
    if (mx < staveX || mx > staveX + staveW) continue;

    // Vertical distance from the staff line area (with some margin for ledger lines)
    const margin = 20;
    const staveCenter = (topLine + botLine) / 2;
    const dist = Math.abs(my - staveCenter);

    if (dist < bestDist) {
      bestDist = dist;
      closestStave = entry.stave;
      closestStaffIndex = entry.staffIndex;
    }
  }

  if (!closestStave || bestDist > 80) return null;

  const score = getScore();
  const clef = score.staves[closestStaffIndex].clef;
  const topLineY = closestStave.getYForLine(0);
  const lineSpacing = closestStave.getSpacingBetweenLines();
  const halfSpace = lineSpacing / 2;

  // Snap Y to nearest half-space position
  const yOnStaff = my - topLineY;
  const steps = Math.round(yOnStaff / halfSpace);
  const snapY = topLineY + steps * halfSpace;

  const noteKey = yToKey(yOnStaff, clef, lineSpacing);

  return {
    x: mx + svgOffsetX,
    snapY: snapY + svgOffsetY,
    key: noteKey,
    staffIndex: closestStaffIndex,
    staveHeight: lineSpacing,
  };
}

/**
 * Find all notes whose bounding boxes intersect a selection rectangle.
 * Coordinates are in SVG space.
 *
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {Array} noteElementMap
 * @returns {Array<{staffIndex, measureIndex, noteIndex}>}
 */
export function getNotesInRect(rect, noteElementMap) {
  const results = [];
  for (const entry of noteElementMap) {
    if (!entry.staveNote) continue;
    try {
      const bb = entry.staveNote.getBoundingBox();
      const nx = bb.getX(), ny = bb.getY(), nw = bb.getW(), nh = bb.getH();
      // Check intersection
      if (nx + nw >= rect.x && nx <= rect.x + rect.w &&
          ny + nh >= rect.y && ny <= rect.y + rect.h) {
        results.push({
          staffIndex: entry.staffIndex,
          measureIndex: entry.measureIndex,
          noteIndex: entry.noteIndex,
        });
      }
    } catch (_) {}
  }
  return results;
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
    const measure = score.staves[hit.staffIndex].measures[hit.measureIndex];
    const hitNote = measure.notes[hit.noteIndex];

    // If a rest is clicked, replace it with a note at the clicked pitch
    if (hitNote && hitNote.type === 'rest') {
      const coords = _svgCoords(event);
      if (!coords) return;
      const my    = coords.my;
      const clef  = score.staves[hit.staffIndex].clef;
      const key   = _yToKeyFromStave(my, hit.stave, clef);
      const note  = _buildNoteFromState(key);

      _pushUndoIfAvailable();

      const added = addNote(score, hit.staffIndex, hit.measureIndex, hit.noteIndex, note);
      if (added) {
        setSelection([{
          staffIndex:   hit.staffIndex,
          measureIndex: hit.measureIndex,
          noteIndex:    hit.noteIndex,
        }]);
        _notifyChange();
        return;
      }
    }

    // Select the clicked note (non-rest)
    setSelection([{
      staffIndex:   hit.staffIndex,
      measureIndex: hit.measureIndex,
      noteIndex:    hit.noteIndex,
    }]);
    _notifyChange();
    return;
  }

  // No direct hit — try to insert at the click position
  const coords = _svgCoords(event);
  if (!coords) return;
  const { mx, my } = coords;

  // Find the stave that contains the click (horizontally AND vertically)
  let closestStaff    = null;
  let closestMeasure  = null;
  let closestStaveObj = null;
  let bestScore       = Infinity;
  const seen = new Set();

  for (const entry of noteElementMap) {
    if (!entry.stave) continue;
    const key = `${entry.staffIndex}-${entry.measureIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const staveX = entry.stave.getX();
    const staveW = entry.stave.getWidth();
    const staveY = entry.stave.getY();
    const staveH = entry.stave.getHeight();

    // Horizontal distance: 0 if click is inside the stave, positive otherwise
    const dx = mx < staveX ? staveX - mx : mx > staveX + staveW ? mx - staveX - staveW : 0;
    const staveM = staveY + staveH / 2;
    const dy = Math.abs(my - staveM);

    // Strongly prefer staves that contain the click horizontally
    const score = dx > 0 ? 10000 + dx + dy : dy;

    if (score < bestScore) {
      bestScore      = score;
      closestStaff   = entry.staffIndex;
      closestMeasure = entry.measureIndex;
      closestStaveObj = entry.stave;
    }
  }

  const minVertDist = bestScore >= 10000 ? bestScore - 10000 : bestScore;

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
    setSelection([{
      staffIndex:   closestStaff,
      measureIndex: closestMeasure,
      noteIndex:    insertIndex,
    }]);
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
  const sel   = _primarySel();

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

  let added;
  let actualIndex;

  if (editorState.insertMode && sel) {
    // Insert BEFORE the selected note, pushing subsequent notes right
    added = insertNoteAt(score, staffIndex, measureIndex, sel.noteIndex, note);
    actualIndex = sel.noteIndex;
  } else {
    added = addNote(score, staffIndex, measureIndex, noteIndex === -1 ? -1 : noteIndex, note);
    actualIndex = noteIndex === -1
      ? score.staves[staffIndex].measures[measureIndex].notes.length - 1
      : noteIndex;
  }

  if (added) {
    setSelection([{ staffIndex, measureIndex, noteIndex: actualIndex }]);
    _recordAction('insertNote', { noteName: name });
    _notifyChange();
  }
}

// ---------------------------------------------------------------------------
// Public API: insert rest
// ---------------------------------------------------------------------------

/** Replace the selected note with a rest of the same duration. */
export function insertRest() {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const sel = _primarySel();
  if (!sel) return;

  const measure = score.staves[sel.staffIndex].measures[sel.measureIndex];
  const note = measure.notes[sel.noteIndex];
  if (!note || note.type === 'rest') return;

  _pushUndoIfAvailable();

  const rest = createRest(note.duration);
  if (note.dotted) rest.dotted = true;
  replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, rest);
  _notifyChange();
}

// ---------------------------------------------------------------------------
// Public API: insert note before selected (Alt+letter)
// ---------------------------------------------------------------------------

/**
 * Insert a note BEFORE the currently selected note, pushing subsequent notes right.
 * Used for Alt+letter shortcut (one-off insert without toggling insert mode).
 */
export function insertNoteBeforeByKey(noteName) {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const name = noteName.toLowerCase();
  if (!NOTE_NAMES.includes(name)) return;

  const score = getScore();
  const sel = _primarySel();
  if (!sel) return;

  const staffIndex = sel.staffIndex;
  const measureIndex = sel.measureIndex;

  const key = buildKey(name, editorState.currentAccidental, editorState.currentOctave);
  const note = _buildNoteFromState(key);

  _pushUndoIfAvailable();

  const added = insertNoteAt(score, staffIndex, measureIndex, sel.noteIndex, note);

  if (added) {
    setSelection([{ staffIndex, measureIndex, noteIndex: sel.noteIndex }]);
    _notifyChange();
  }
}

// ---------------------------------------------------------------------------
// Public API: add note to chord (Shift+letter)
// ---------------------------------------------------------------------------

/**
 * Add a pitch to the currently selected note, forming a chord.
 * @param {string} noteName  One of 'a'..'g'
 */
export function addToChord(noteName) {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const name = noteName.toLowerCase();
  if (!NOTE_NAMES.includes(name)) return;

  const score = getScore();
  const sel = _primarySel();
  if (!sel) return;

  const { staffIndex, measureIndex, noteIndex } = sel;
  const newKey = buildKey(name, editorState.currentAccidental, editorState.currentOctave);

  _pushUndoIfAvailable();

  if (addKeyToNote(score, staffIndex, measureIndex, noteIndex, newKey)) {
    _notifyChange();
  }
}

/**
 * Add a pitch to the selected note by clicking while Shift is held.
 * @param {MouseEvent} event
 * @param {Array} noteElementMap
 */
export function addToChordByClick(event, noteElementMap) {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const sel = _primarySel();
  if (!sel) return;

  const note = score.staves[sel.staffIndex].measures[sel.measureIndex].notes[sel.noteIndex];
  if (!note || note.type === 'rest') return;

  // Get clicked pitch from mouse position
  const coords = _svgCoords(event);
  if (!coords) return;

  // Find stave for the selected note
  const staveEntry = noteElementMap.find(
    e => e.staffIndex === sel.staffIndex && e.measureIndex === sel.measureIndex
  );
  if (!staveEntry || !staveEntry.stave) return;

  const clef = score.staves[sel.staffIndex].clef;
  const clickedKey = _yToKeyFromStave(coords.my, staveEntry.stave, clef);
  const { name, octave } = parseKey(clickedKey);
  const newKey = buildKey(name, editorState.currentAccidental, octave);

  _pushUndoIfAvailable();

  if (addKeyToNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newKey)) {
    _notifyChange();
  }
}

// ---------------------------------------------------------------------------
// Public API: delete selected note
// ---------------------------------------------------------------------------

/** Delete all selected notes (replaces each with a rest if needed). */
export function deleteSelectedNote() {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const allSel = getSelection();
  if (!allSel || (Array.isArray(allSel) && allSel.length === 0)) return;

  const sels = Array.isArray(allSel) ? [...allSel] : [allSel];

  _pushUndoIfAvailable();

  // Delete in reverse order so indices don't shift
  sels.sort((a, b) =>
    a.staffIndex !== b.staffIndex ? b.staffIndex - a.staffIndex :
    a.measureIndex !== b.measureIndex ? b.measureIndex - a.measureIndex :
    b.noteIndex - a.noteIndex
  );

  let anyRemoved = false;
  for (const sel of sels) {
    if (removeNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex)) {
      anyRemoved = true;
    }
  }

  if (anyRemoved) {
    // Keep selection at the position of the first deleted note (now a rest)
    const first = sels[sels.length - 1]; // sels is sorted descending, last = earliest
    const measure = score.staves[first.staffIndex].measures[first.measureIndex];
    const clampedIndex = Math.min(first.noteIndex, measure.notes.length - 1);
    setSelection([{
      staffIndex:   first.staffIndex,
      measureIndex: first.measureIndex,
      noteIndex:    Math.max(0, clampedIndex),
    }]);
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
  const sel   = _primarySel();
  if (!sel) {
    // Nothing selected — select first note
    setSelection([{ staffIndex: 0, measureIndex: 0, noteIndex: 0 }]);
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

  setSelection([{ staffIndex, measureIndex, noteIndex }]);
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
  const sel   = _primarySel();
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
let _savedOctave = { 0: 4, 1: 3 };

export function switchStaff() {
  // Save current octave for this staff before switching
  _savedOctave[editorState.currentStaff] = editorState.currentOctave;
  editorState.currentStaff = editorState.currentStaff === 0 ? 1 : 0;
  // Restore the saved octave for the target staff
  editorState.currentOctave = _savedOctave[editorState.currentStaff];

  // Move selection to the same position in the other staff
  if (getScore && getSelection && setSelection && onScoreChange) {
    const score = getScore();
    const sel = _primarySel();
    if (sel) {
      const targetStaff = editorState.currentStaff;
      const measure = score.staves[targetStaff].measures[sel.measureIndex];
      if (measure) {
        const noteIndex = Math.min(sel.noteIndex, measure.notes.length - 1);
        setSelection([{ staffIndex: targetStaff, measureIndex: sel.measureIndex, noteIndex: Math.max(0, noteIndex) }]);
        _notifyChange();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API: in-place note modification (Tier 1)
// ---------------------------------------------------------------------------

/** Change the duration of all selected notes in place. */
export function changeDurationOfSelected(newDuration) {
  if (!getScore || !getSelection || !onScoreChange) return false;
  const score = getScore();
  const allSel = getSelection();
  if (!Array.isArray(allSel) || allSel.length === 0) return false;

  _pushUndoIfAvailable();
  let anyChanged = false;

  for (const sel of allSel) {
    const measure = score.staves[sel.staffIndex].measures[sel.measureIndex];
    const note = measure.notes[sel.noteIndex];
    if (!note || note.duration === newDuration) continue;

    const newNote = { ...note, keys: [...note.keys], duration: newDuration };
    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
      fillMeasureWithRests(measure, score.timeSignature.beats);
      anyChanged = true;
    }
  }

  if (anyChanged) {
    _recordAction('changeDuration', { duration: newDuration });
    _notifyChange();
  }
  return anyChanged;
}

/** Change the accidental of all selected notes in place. */
export function changeAccidentalOfSelected(accidental) {
  if (!getScore || !getSelection || !onScoreChange) return false;
  const score = getScore();
  const allSel = getSelection();
  if (!Array.isArray(allSel) || allSel.length === 0) return false;

  _pushUndoIfAvailable();
  let anyChanged = false;

  for (const sel of allSel) {
    const note = score.staves[sel.staffIndex].measures[sel.measureIndex].notes[sel.noteIndex];
    if (!note || note.type === 'rest') continue;

    const newKeys = note.keys.map(k => {
      const { name, octave } = parseKey(k);
      return buildKey(name, accidental, octave);
    });
    const newNote = { ...note, keys: newKeys, duration: note.duration };
    if (accidental && accidental !== 'n') {
      newNote.accidental = accidental;
    } else {
      delete newNote.accidental;
    }

    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
      anyChanged = true;
    }
  }

  if (anyChanged) {
    _recordAction('changeAccidental', { accidental });
    _notifyChange();
  }
  return anyChanged;
}

/** Change the octave of all selected notes in place by delta (+1 / -1). */
export function changeOctaveOfSelected(delta) {
  if (!getScore || !getSelection || !onScoreChange) return false;
  const score = getScore();
  const allSel = getSelection();
  if (!Array.isArray(allSel) || allSel.length === 0) return false;

  _pushUndoIfAvailable();
  let anyChanged = false;

  for (const sel of allSel) {
    const note = score.staves[sel.staffIndex].measures[sel.measureIndex].notes[sel.noteIndex];
    if (!note || note.type === 'rest') continue;

    const newKeys = note.keys.map(k => {
      const { name, accidental, octave } = parseKey(k);
      const newOctave = Math.max(1, Math.min(8, octave + delta));
      return buildKey(name, accidental, newOctave);
    });
    const newNote = { ...note, keys: newKeys, duration: note.duration };

    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
      anyChanged = true;
    }
  }

  if (anyChanged) {
    _recordAction('changeOctave', { delta });
    _notifyChange();
  }
  return anyChanged;
}

/** Replace the pitch of the selected note (overwrite mode). Advances selection. */
export function changePitchOfSelected(noteName) {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return false;

  const name = noteName.toLowerCase();
  if (!NOTE_NAMES.includes(name)) return false;

  const score = getScore();
  const sel = _primarySel();
  if (!sel) return false;

  const note = score.staves[sel.staffIndex].measures[sel.measureIndex].notes[sel.noteIndex];
  if (!note || note.type === 'rest') return false;

  const newKey = buildKey(name, editorState.currentAccidental, editorState.currentOctave);
  const newNote = { ...note, keys: [newKey], duration: note.duration };
  if (editorState.currentAccidental && editorState.currentAccidental !== 'n') {
    newNote.accidental = editorState.currentAccidental;
  } else {
    delete newNote.accidental;
  }

  _pushUndoIfAvailable();

  if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
    // Advance selection to next note (like typing over text)
    const staff = score.staves[sel.staffIndex];
    let nextMeasure = sel.measureIndex;
    let nextNote = sel.noteIndex + 1;
    if (nextNote >= staff.measures[nextMeasure].notes.length) {
      nextNote = 0;
      nextMeasure++;
      if (nextMeasure >= staff.measures.length) {
        nextMeasure = sel.measureIndex;
        nextNote = sel.noteIndex;
      }
    }
    setSelection([{ staffIndex: sel.staffIndex, measureIndex: nextMeasure, noteIndex: nextNote }]);
    _recordAction('changePitch', { noteName: name });
    _notifyChange();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API: advanced navigation & selection (Tier 2)
// ---------------------------------------------------------------------------

/** Extend selection range by one note in the given direction. */
export function extendSelection(direction) {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const sel = getSelection();
  if (!Array.isArray(sel) || sel.length === 0) {
    setSelection([{ staffIndex: 0, measureIndex: 0, noteIndex: 0 }]);
    _notifyChange();
    return;
  }

  const sorted = [...sel].sort((a, b) =>
    a.staffIndex !== b.staffIndex ? a.staffIndex - b.staffIndex :
    a.measureIndex !== b.measureIndex ? a.measureIndex - b.measureIndex :
    a.noteIndex - b.noteIndex
  );

  if (direction === 'right') {
    const last = sorted[sorted.length - 1];
    const next = _adjacentPosition(score, last, 1);
    if (next && !sel.some(s => s.staffIndex === next.staffIndex && s.measureIndex === next.measureIndex && s.noteIndex === next.noteIndex)) {
      setSelection([...sel, next]);
      _notifyChange();
    }
  } else {
    const first = sorted[0];
    const prev = _adjacentPosition(score, first, -1);
    if (prev && !sel.some(s => s.staffIndex === prev.staffIndex && s.measureIndex === prev.measureIndex && s.noteIndex === prev.noteIndex)) {
      setSelection([prev, ...sel]);
      _notifyChange();
    }
  }
}

/** Get the adjacent note position (delta = +1 or -1), wrapping across measures. */
function _adjacentPosition(score, pos, delta) {
  const staff = score.staves[pos.staffIndex];
  if (!staff) return null;

  let { measureIndex, noteIndex } = pos;
  noteIndex += delta;

  if (noteIndex >= staff.measures[measureIndex].notes.length) {
    measureIndex++;
    noteIndex = 0;
    if (measureIndex >= staff.measures.length) return null;
  } else if (noteIndex < 0) {
    measureIndex--;
    if (measureIndex < 0) return null;
    noteIndex = staff.measures[measureIndex].notes.length - 1;
  }

  return { staffIndex: pos.staffIndex, measureIndex, noteIndex };
}

/** Jump to the first note of the next or previous measure. */
export function navigateToMeasure(direction) {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const sel = _primarySel();
  const staffIndex = sel ? sel.staffIndex : editorState.currentStaff;
  let measureIndex = sel ? sel.measureIndex : 0;
  const staff = score.staves[staffIndex];

  if (direction === 'right') {
    measureIndex = Math.min(measureIndex + 1, staff.measures.length - 1);
  } else {
    measureIndex = Math.max(measureIndex - 1, 0);
  }

  setSelection([{ staffIndex, measureIndex, noteIndex: 0 }]);
  _notifyChange();
}

/** Select all notes in the current measure. */
export function selectMeasure() {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const sel = _primarySel();
  const staffIndex = sel ? sel.staffIndex : editorState.currentStaff;
  const measureIndex = sel ? sel.measureIndex : 0;
  const measure = score.staves[staffIndex].measures[measureIndex];
  if (!measure) return;

  const newSel = measure.notes.map((_, i) => ({ staffIndex, measureIndex, noteIndex: i }));
  setSelection(newSel);
  _notifyChange();
}

/** Jump to the first note of the staff. */
export function navigateToStart() {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;
  const sel = _primarySel();
  const staffIndex = sel ? sel.staffIndex : editorState.currentStaff;
  setSelection([{ staffIndex, measureIndex: 0, noteIndex: 0 }]);
  _notifyChange();
}

/** Jump to the last note of the staff. */
export function navigateToEnd() {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;
  const score = getScore();
  const sel = _primarySel();
  const staffIndex = sel ? sel.staffIndex : editorState.currentStaff;
  const staff = score.staves[staffIndex];
  const lastMeasure = staff.measures.length - 1;
  const lastNote = staff.measures[lastMeasure].notes.length - 1;
  setSelection([{ staffIndex, measureIndex: lastMeasure, noteIndex: Math.max(0, lastNote) }]);
  _notifyChange();
}

// ---------------------------------------------------------------------------
// Public API: compositional accelerators (Tier 3)
// ---------------------------------------------------------------------------

/** Duplicate the current selection, pasting right after it. */
export function duplicateSelection() {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;
  if (!copySelection()) return;

  const sel = getSelection();
  if (!Array.isArray(sel) || sel.length === 0) return;

  // Move selection to just after the last selected note
  const sorted = [...sel].sort((a, b) =>
    a.staffIndex !== b.staffIndex ? a.staffIndex - b.staffIndex :
    a.measureIndex !== b.measureIndex ? a.measureIndex - b.measureIndex :
    a.noteIndex - b.noteIndex
  );
  const last = sorted[sorted.length - 1];
  const next = _adjacentPosition(getScore(), last, 1);
  if (next) {
    setSelection([next]);
  }
  pasteAtSelection();
}

/** Transpose all selected notes by a number of semitones. */
export function transposeSelection(semitones) {
  if (!getScore || !getSelection || !onScoreChange) return false;
  const score = getScore();
  const allSel = getSelection();
  if (!Array.isArray(allSel) || allSel.length === 0) return false;

  _pushUndoIfAvailable();
  let anyChanged = false;

  for (const sel of allSel) {
    const note = score.staves[sel.staffIndex].measures[sel.measureIndex].notes[sel.noteIndex];
    if (!note || note.type === 'rest') continue;

    const newKeys = note.keys.map(k => {
      const midi = keyToMidi(k);
      const newMidi = Math.max(12, Math.min(127, midi + semitones));
      return midiToKey(newMidi, semitones < 0);
    });
    const newNote = { ...note, keys: newKeys, duration: note.duration };

    // Update accidental based on new key
    const { accidental } = parseKey(newKeys[0]);
    if (accidental) {
      newNote.accidental = accidental;
    } else {
      delete newNote.accidental;
    }

    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
      anyChanged = true;
    }
  }

  if (anyChanged) {
    _recordAction('transpose', { semitones });
    _notifyChange();
  }
  return anyChanged;
}

/** Toggle the dotted property of the selected note. */
export function toggleDot() {
  if (!getScore || !getSelection || !onScoreChange) return false;
  const score = getScore();
  const allSel = getSelection();
  if (!Array.isArray(allSel) || allSel.length === 0) return false;

  _pushUndoIfAvailable();
  let anyChanged = false;

  for (const sel of allSel) {
    const measure = score.staves[sel.staffIndex].measures[sel.measureIndex];
    const note = measure.notes[sel.noteIndex];
    if (!note) continue;

    const newNote = { ...note, keys: [...note.keys] };
    newNote.dotted = !note.dotted;
    if (!newNote.dotted) delete newNote.dotted;

    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
      fillMeasureWithRests(measure, score.timeSignature.beats);
      anyChanged = true;
    }
  }

  if (anyChanged) {
    _recordAction('toggleDot', {});
    _notifyChange();
  }
  return anyChanged;
}

// ---------------------------------------------------------------------------
// Public API: repeat last action (Tier 3D)
// ---------------------------------------------------------------------------

let _lastAction = null;

function _recordAction(type, params) {
  _lastAction = { type, params };
}

/** Repeat the last editing action. */
export function repeatLastAction() {
  if (!_lastAction) return;
  switch (_lastAction.type) {
    case 'insertNote': insertNoteByKey(_lastAction.params.noteName); break;
    case 'changePitch': changePitchOfSelected(_lastAction.params.noteName); break;
    case 'changeDuration': changeDurationOfSelected(_lastAction.params.duration); break;
    case 'changeAccidental': changeAccidentalOfSelected(_lastAction.params.accidental); break;
    case 'changeOctave': changeOctaveOfSelected(_lastAction.params.delta); break;
    case 'transpose': transposeSelection(_lastAction.params.semitones); break;
    case 'toggleDot': toggleDot(); break;
  }
}

// ---------------------------------------------------------------------------
// Public API: clipboard (copy / cut / paste)
// ---------------------------------------------------------------------------

let clipboard = null;

/** Copy currently selected notes to the internal clipboard. */
export function copySelection() {
  if (!getScore || !getSelection) return;

  const score = getScore();
  const sel = getSelection();
  if (!Array.isArray(sel) || sel.length === 0) return;

  // Sort in document order
  const sorted = [...sel].sort((a, b) =>
    a.staffIndex !== b.staffIndex ? a.staffIndex - b.staffIndex :
    a.measureIndex !== b.measureIndex ? a.measureIndex - b.measureIndex :
    a.noteIndex - b.noteIndex
  );

  // Take only notes from the first staff in the selection
  const targetStaff = sorted[0].staffIndex;
  const staffSel = sorted.filter(s => s.staffIndex === targetStaff);

  const notes = [];
  for (const s of staffSel) {
    const measure = score.staves[s.staffIndex].measures[s.measureIndex];
    if (measure && measure.notes[s.noteIndex]) {
      notes.push(JSON.parse(JSON.stringify(measure.notes[s.noteIndex])));
    }
  }

  if (notes.length === 0) return false;
  clipboard = { notes };
  return true;
}

/** Paste clipboard contents starting at the current selection position. */
export function pasteAtSelection() {
  if (!clipboard || clipboard.notes.length === 0) return;
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const sel = _primarySel();
  if (!sel) return;

  _pushUndoIfAvailable();

  const score = getScore();
  const beats = score.timeSignature.beats;
  const staffIdx = sel.staffIndex;
  const numMeasures = score.staves[staffIdx].measures.length;

  let mi = sel.measureIndex;
  let ni = sel.noteIndex;
  const pastedPositions = [];
  const affectedMeasures = new Set();

  for (const clipNote of clipboard.notes) {
    // Advance if past end of current measure
    while (mi < numMeasures && ni >= score.staves[staffIdx].measures[mi].notes.length) {
      mi++;
      ni = 0;
    }
    if (mi >= numMeasures) break;

    const measure = score.staves[staffIdx].measures[mi];

    // Expand a single whole rest into beat-sized rests so paste has slots
    if (measure.notes.length === 1 && measure.notes[0].type === 'rest' && measure.notes[0].duration === 'w') {
      measure.notes = [];
      fillMeasureWithRests(measure, beats);
      ni = 0;
    }

    measure.notes[ni] = JSON.parse(JSON.stringify(clipNote));

    pastedPositions.push({ staffIndex: staffIdx, measureIndex: mi, noteIndex: ni });
    affectedMeasures.add(mi);
    ni++;
  }

  // Rebalance affected measures
  for (const measIdx of affectedMeasures) {
    const measure = score.staves[staffIdx].measures[measIdx];
    const dur = measureDuration(measure);

    if (dur > beats) {
      // Trim trailing rests
      while (measure.notes.length > 1 && measureDuration(measure) > beats) {
        const last = measure.notes[measure.notes.length - 1];
        if (last.type === 'rest') {
          measure.notes.pop();
        } else {
          break;
        }
      }
    } else if (dur < beats) {
      fillMeasureWithRests(measure, beats);
    }
  }

  setSelection(pastedPositions);
  _notifyChange();
}

/** Cut: copy selection to clipboard, then delete (replace with rests). */
export function cutSelection() {
  if (!copySelection()) return false;
  deleteSelectedNote();
  return true;
}
