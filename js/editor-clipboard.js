// editor-clipboard.js — Copy, cut, paste, and duplicate operations
import { measureDuration } from './score-model.js';
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

  const clipNotes = clipboard.notes.map(n => JSON.parse(JSON.stringify(n)));

  let mi = sel.measureIndex;
  let ni = sel.noteIndex;
  const pastedPositions = [];

  for (const clipNote of clipNotes) {
    if (mi >= staff.measures.length) break;

    const measure = staff.measures[mi];
    measure.notes.splice(ni, 0, clipNote);
    pastedPositions.push({ staffIndex: staffIdx, measureIndex: mi, noteIndex: ni });
    ni++;

    // If this measure now overflows, advance to next measure for the next note
    if (measureDuration(measure) > beats + 0.001) {
      mi++;
      ni = 0;
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
