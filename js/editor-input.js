// editor-input.js — Note entry, deletion, and pitch replacement
import {
  createRest, addNote, removeNote, replaceNote,
  addKeyToNote, insertNoteAt,
  NOTE_NAMES, buildKey
} from './score-model.js';
import {
  getScore, getSelection, setSelection, onScoreChange,
  editorState,
  _primarySel, _pushUndoIfAvailable, _notifyChange,
  _buildNoteFromState, _recordAction, _compareSelectionOrder
} from './editor.js';

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

  // If selected note is a rest, replace it instead of inserting after
  if (sel && sel.staffIndex === staffIndex) {
    const selMeasure = score.staves[staffIndex].measures[sel.measureIndex];
    const selNote = selMeasure && selMeasure.notes[sel.noteIndex];
    if (selNote && selNote.type === 'rest') {
      const key  = buildKey(name, editorState.currentAccidental, editorState.currentOctave);
      const note = _buildNoteFromState(key);

      _pushUndoIfAvailable();

      if (replaceNote(score, staffIndex, sel.measureIndex, sel.noteIndex, note)) {
        setSelection([{ staffIndex, measureIndex: sel.measureIndex, noteIndex: sel.noteIndex }]);
        _recordAction('insertNote', { noteName: name });
        _notifyChange();
      }
      return;
    }
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

/**
 * R key behavior:
 * - Selected note → replace with rest of same duration
 * - Selected rest → replace with rest of current duration (from toolbar 1-5),
 *   rebalancing the measure
 */
export function insertRest() {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const sel = _primarySel();
  if (!sel) return;

  const measure = score.staves[sel.staffIndex].measures[sel.measureIndex];
  const note = measure.notes[sel.noteIndex];
  if (!note) return;

  _pushUndoIfAvailable();

  if (note.type === 'rest') {
    // Replace rest with a rest of the currently selected duration
    const newRest = createRest(editorState.currentDuration);
    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newRest)) {
      _notifyChange();
    }
  } else {
    // Replace note with a rest of the same duration
    const rest = createRest(note.duration);
    if (note.dotted) rest.dotted = true;
    replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, rest);
    _notifyChange();
  }
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
  sels.sort((a, b) => -_compareSelectionOrder(a, b));

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
// Public API: replace pitch of selected note (overwrite mode)
// ---------------------------------------------------------------------------

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
