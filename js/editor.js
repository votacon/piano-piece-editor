// editor.js — Editor hub: state, initialization, shared helpers, and re-exports
import {
  createNote, createRest,
  DURATION_VALUES, parseKey, buildKey,
  cloneScore
} from './score-model.js';
import { insertNoteByKey, changePitchOfSelected } from './editor-input.js';
import {
  changeDurationOfSelected, changeAccidentalOfSelected,
  changeOctaveOfSelected, transposeSelection, toggleDot
} from './editor-modify.js';

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

export const editorState = {
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
// Callbacks (wired in by initEditor) — exported as live bindings for sub-modules
// ---------------------------------------------------------------------------

export let onScoreChange = null;
export let getScore = null;
export let getSelection = null;
export let setSelection = null;
export let pushUndo = null;

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
// Shared internal helpers (exported for sub-modules)
// ---------------------------------------------------------------------------

/** Get the first (primary) selection from the array, or null. */
export function _primarySel() {
  const sel = getSelection ? getSelection() : [];
  return (Array.isArray(sel) && sel.length > 0) ? sel[0] : (sel && !Array.isArray(sel)) ? sel : null;
}

export function _pushUndoIfAvailable() {
  if (pushUndo && getScore) {
    pushUndo(cloneScore(getScore()));
  }
}

/** Compare two selection positions in document order (staff → measure → note). */
export function _compareSelectionOrder(a, b) {
  return a.staffIndex !== b.staffIndex ? a.staffIndex - b.staffIndex :
         a.measureIndex !== b.measureIndex ? a.measureIndex - b.measureIndex :
         a.noteIndex - b.noteIndex;
}

export function _notifyChange() {
  if (onScoreChange) {
    onScoreChange();
  }
}

/**
 * Build a note (or rest) from the current editor state plus an explicit key.
 * @param {string} key  VexFlow-style key, e.g. 'c#/4'
 * @returns {object}   Score-model note object
 */
export function _buildNoteFromState(key) {
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

// ---------------------------------------------------------------------------
// Repeat last action (shared state for sub-modules)
// ---------------------------------------------------------------------------

let _lastAction = null;

export function _recordAction(type, params) {
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
// Re-exports from sub-modules (preserves the public API for app.js)
// ---------------------------------------------------------------------------

export {
  getGhostNoteInfo, getNotesInRect,
  handleScoreClick, addToChordByClick
} from './editor-mouse.js';

export {
  insertNoteByKey, insertNoteBeforeByKey,
  insertRest, addToChord,
  deleteSelectedNote, changePitchOfSelected
} from './editor-input.js';

export {
  navigateSelection, extendSelection,
  navigateToMeasure, selectMeasure,
  navigateToStart, navigateToEnd
} from './editor-navigation.js';

export {
  changeOctave, toggleTie, switchStaff,
  changeDurationOfSelected, changeAccidentalOfSelected,
  changeOctaveOfSelected, transposeSelection, toggleDot
} from './editor-modify.js';

export {
  copySelection, cutSelection, pasteAtSelection,
  duplicateSelection
} from './editor-clipboard.js';
