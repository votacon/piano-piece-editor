// editor-modify.js — In-place note modification (duration, accidental, octave, ties, transpose)
import {
  replaceNote, parseKey, buildKey,
  keyToMidi, midiToKey
} from './score-model.js';
import {
  getScore, getSelection, setSelection, onScoreChange,
  editorState,
  _primarySel, _pushUndoIfAvailable, _notifyChange, _recordAction
} from './editor.js';

// ---------------------------------------------------------------------------
// Public API: change octave (keyboard input state)
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

let _savedOctave = { 0: 4, 1: 3 };

/**
 * Toggle keyboard-input staff between treble (0) and bass (1).
 */
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
    if (!note || note.type === 'rest' || note.duration === newDuration) continue;

    const newNote = { ...note, keys: [...note.keys], duration: newDuration };
    if (replaceNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newNote)) {
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

// ---------------------------------------------------------------------------
// Public API: compositional accelerators (Tier 3)
// ---------------------------------------------------------------------------

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
      anyChanged = true;
    }
  }

  if (anyChanged) {
    _recordAction('toggleDot', {});
    _notifyChange();
  }
  return anyChanged;
}
