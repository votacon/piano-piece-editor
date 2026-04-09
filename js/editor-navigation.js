// editor-navigation.js — Selection movement and navigation
import {
  getScore, getSelection, setSelection, onScoreChange,
  editorState,
  _primarySel, _notifyChange, _compareSelectionOrder
} from './editor.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Get the adjacent note position (delta = +1 or -1), wrapping across measures. */
export function _adjacentPosition(score, pos, delta) {
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

// ---------------------------------------------------------------------------
// Public API
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

  const sorted = [...sel].sort(_compareSelectionOrder);

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
