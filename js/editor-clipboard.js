// editor-clipboard.js — Copy, cut, paste, and duplicate operations
import {
  createRest,
  DURATION_VALUES, measureDuration, fillMeasureWithRests
} from './score-model.js';
import {
  getScore, getSelection, setSelection, onScoreChange,
  _primarySel, _pushUndoIfAvailable, _notifyChange, _compareSelectionOrder
} from './editor.js';
import { _adjacentPosition } from './editor-navigation.js';
import { deleteSelectedNote } from './editor-input.js';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let clipboard = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Copy currently selected notes to the internal clipboard. */
export function copySelection() {
  if (!getScore || !getSelection) return;

  const score = getScore();
  const sel = getSelection();
  if (!Array.isArray(sel) || sel.length === 0) return;

  const sorted = [...sel].sort(_compareSelectionOrder);

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
  const staff = score.staves[staffIdx];

  // Flatten clipboard notes into a sequence with their durations
  const clipNotes = clipboard.notes.map(n => JSON.parse(JSON.stringify(n)));

  // Build a flat timeline: all notes from paste point onward across measures
  // We'll remove enough beats to fit the clipboard, then splice in clipboard notes
  let mi = sel.measureIndex;
  let ni = sel.noteIndex;

  // Remove notes/rests from paste point to make room for clipboard beats
  let clipBeats = clipNotes.reduce((sum, n) => {
    let d = DURATION_VALUES[n.duration] || 0;
    if (n.dotted) d *= 1.5;
    return sum + d;
  }, 0);

  let removedBeats = 0;
  let removeMi = mi;
  let removeNi = ni;

  while (removedBeats < clipBeats - 0.001 && removeMi < staff.measures.length) {
    const measure = staff.measures[removeMi];

    // Expand whole rest into individual rests so we can remove them granularly
    if (measure.notes.length === 1 && measure.notes[0].type === 'rest' && measure.notes[0].duration === 'w') {
      const beatDur = beats <= 2 ? 'h' : 'q';
      const beatVal = DURATION_VALUES[beatDur];
      const count = Math.round(beats / beatVal);
      measure.notes = [];
      for (let i = 0; i < count; i++) measure.notes.push(createRest(beatDur));
      if (removeMi === mi) ni = Math.min(ni, measure.notes.length - 1);
    }

    while (removeNi < measure.notes.length && removedBeats < clipBeats - 0.001) {
      const n = measure.notes[removeNi];
      let d = DURATION_VALUES[n.duration] || 0;
      if (n.dotted) d *= 1.5;
      removedBeats += d;
      measure.notes.splice(removeNi, 1);
    }

    if (removedBeats < clipBeats - 0.001) {
      removeMi++;
      removeNi = 0;
    }
  }

  // Insert clipboard notes at the paste position
  const pastedPositions = [];
  let insertMi = mi;
  let insertNi = ni;

  for (const clipNote of clipNotes) {
    if (insertMi >= staff.measures.length) break;

    const measure = staff.measures[insertMi];
    measure.notes.splice(insertNi, 0, clipNote);

    pastedPositions.push({ staffIndex: staffIdx, measureIndex: insertMi, noteIndex: insertNi });
    insertNi++;

    // Check if measure is now full — move to next measure
    if (measureDuration(measure) >= beats - 0.001) {
      // Fill if slightly under
      if (measureDuration(measure) < beats - 0.001) {
        fillMeasureWithRests(measure, beats);
      }
      insertMi++;
      insertNi = 0;
    }
  }

  // Rebalance affected measures
  for (let m = mi; m <= Math.min(removeMi, staff.measures.length - 1); m++) {
    const measure = staff.measures[m];
    const dur = measureDuration(measure);
    if (dur < beats - 0.001) {
      fillMeasureWithRests(measure, beats);
    } else if (dur > beats + 0.001) {
      // Trim trailing rests
      while (measure.notes.length > 1 && measureDuration(measure) > beats + 0.001) {
        if (measure.notes[measure.notes.length - 1].type === 'rest') {
          measure.notes.pop();
        } else break;
      }
    }
    // Collapse to whole rest if all rests
    if (measure.notes.every(n => n.type === 'rest')) {
      measure.notes = [createRest('w')];
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

/** Duplicate the current selection, pasting right after it. */
export function duplicateSelection() {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;
  if (!copySelection()) return;

  const sel = getSelection();
  if (!Array.isArray(sel) || sel.length === 0) return;

  // Move selection to just after the last selected note
  const sorted = [...sel].sort(_compareSelectionOrder);
  const last = sorted[sorted.length - 1];
  const next = _adjacentPosition(getScore(), last, 1);
  if (next) {
    setSelection([next]);
  }
  pasteAtSelection();
}
