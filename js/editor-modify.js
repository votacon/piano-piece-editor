// editor-modify.js — In-place note modification (duration, accidental, octave, ties, transpose)
import {
  replaceNote, parseKey, buildKey,
  keyToMidi, midiToKey,
  getEffectiveClef, setMeasureClef
} from './score-model.js';
import {
  getScore, getSelection, setSelection, onScoreChange,
  editorState,
  _primarySel, _pushUndoIfAvailable, _notifyChange, _recordAction,
  _compareSelectionOrder
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
 * Toggle the "tied" property of selected notes.
 * With multiple notes selected, ties them all in a chain (except the last).
 * A tie connects a note to the next note (even across measures).
 */
export function toggleTie() {
  if (!getScore || !getSelection || !onScoreChange) return;

  const score = getScore();
  const allSel = getSelection();
  if (!allSel || (Array.isArray(allSel) && allSel.length === 0)) return;

  const sels = Array.isArray(allSel) ? [...allSel] : [allSel];

  // Filter out rests and invalid entries
  const valid = sels.filter(s => {
    const m = score.staves[s.staffIndex].measures[s.measureIndex];
    const n = m && m.notes[s.noteIndex];
    return n && n.type !== 'rest';
  });
  if (valid.length === 0) return;

  // Sort in document order
  valid.sort(_compareSelectionOrder);

  _pushUndoIfAvailable();

  if (valid.length === 1) {
    // Single note: simple toggle
    const s = valid[0];
    const note = score.staves[s.staffIndex].measures[s.measureIndex].notes[s.noteIndex];
    const newNote = { ...note, keys: [...note.keys] };
    newNote.tied = !note.tied;
    replaceNote(score, s.staffIndex, s.measureIndex, s.noteIndex, newNote);
  } else {
    // Multiple notes: tie all except the last in a chain.
    // If all (except last) are already tied, untie all instead.
    const allTied = valid.slice(0, -1).every(s => {
      const n = score.staves[s.staffIndex].measures[s.measureIndex].notes[s.noteIndex];
      return n.tied;
    });

    for (let i = 0; i < valid.length; i++) {
      const s = valid[i];
      const note = score.staves[s.staffIndex].measures[s.measureIndex].notes[s.noteIndex];
      const newNote = { ...note, keys: [...note.keys] };
      if (allTied) {
        // Untie all
        newNote.tied = false;
      } else {
        // Tie all except last
        newNote.tied = (i < valid.length - 1);
      }
      if (!newNote.tied) delete newNote.tied;
      replaceNote(score, s.staffIndex, s.measureIndex, s.noteIndex, newNote);
    }
  }

  _notifyChange();
}

// ---------------------------------------------------------------------------
// Public API: toggle arpeggio
// ---------------------------------------------------------------------------

export function toggleArpeggio() {
  if (!getScore || !getSelection || !onScoreChange) return;

  const score = getScore();
  const allSel = getSelection();
  if (!allSel || (Array.isArray(allSel) && allSel.length === 0)) return;

  const sels = Array.isArray(allSel) ? [...allSel] : [allSel];

  const valid = sels.filter(s => {
    const m = score.staves[s.staffIndex].measures[s.measureIndex];
    const n = m && m.notes[s.noteIndex];
    return n && n.type !== 'rest' && n.keys.length > 1;
  });
  if (valid.length === 0) return;

  _pushUndoIfAvailable();

  for (const s of valid) {
    const note = score.staves[s.staffIndex].measures[s.measureIndex].notes[s.noteIndex];
    const newNote = { ...note, keys: [...note.keys] };
    if (note.arpeggio) {
      delete newNote.arpeggio;
    } else {
      newNote.arpeggio = 'down';
    }
    replaceNote(score, s.staffIndex, s.measureIndex, s.noteIndex, newNote);
  }

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

export function toggleMeasureClef() {
  if (!getScore || !getSelection) return;
  const score = getScore();
  const sel = _primarySel();
  if (!sel) return;

  _pushUndoIfAvailable();
  const current = getEffectiveClef(score, sel.staffIndex, sel.measureIndex);
  const next = current === 'treble' ? 'bass' : 'treble';
  setMeasureClef(score, sel.staffIndex, sel.measureIndex, next);
  _notifyChange();
}
