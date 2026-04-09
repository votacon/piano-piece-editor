// editor-chord.js — Chord symbol text input and editing
import {
  getScore, getSelection, setSelection, onScoreChange,
  editorState,
  _primarySel, _pushUndoIfAvailable, _notifyChange
} from './editor.js';
import { navigateSelection } from './editor-navigation.js';
import { getNoteBoundingBox } from './renderer.js';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let chordInputEl = null;
let chordOriginalText = '';
let containerRef = null;
let currentSel = null;        // {staffIndex, measureIndex, noteIndex} being edited
let isExiting = false;        // guard against re-entrant blur

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _svgOffset(container) {
  const svg = container.querySelector('svg');
  if (!svg) return { x: 0, y: 0 };
  const svgRect = svg.getBoundingClientRect();
  const contRect = container.getBoundingClientRect();
  return {
    x: svgRect.left - contRect.left,
    y: svgRect.top - contRect.top,
  };
}

function _removeInput() {
  if (chordInputEl && chordInputEl.parentNode) {
    chordInputEl.parentNode.removeChild(chordInputEl);
  }
  chordInputEl = null;
}

function _commitChordText() {
  if (!chordInputEl || !currentSel) return;

  const text = chordInputEl.value.trim();
  const score = getScore();
  const note = score.staves[currentSel.staffIndex]
    .measures[currentSel.measureIndex]
    .notes[currentSel.noteIndex];
  if (!note) return;

  const oldText = note.chordSymbol || '';
  if (text === oldText) return; // nothing changed

  _pushUndoIfAvailable();

  if (text) {
    note.chordSymbol = text;
  } else {
    delete note.chordSymbol;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enter chord-symbol editing mode on the currently selected note.
 * Creates a floating <input> above the note for text entry.
 */
export function enterChordMode(containerEl) {
  const sel = _primarySel();
  if (!sel) return;

  containerRef = containerEl;
  currentSel = { ...sel };

  const score = getScore();
  const note = score.staves[sel.staffIndex]
    .measures[sel.measureIndex]
    .notes[sel.noteIndex];
  if (!note) return;

  const existingText = note.chordSymbol || '';
  chordOriginalText = existingText;

  editorState.chordMode = true;

  // Get note position
  const bb = getNoteBoundingBox(sel.staffIndex, sel.measureIndex, sel.noteIndex);
  if (!bb) {
    editorState.chordMode = false;
    return;
  }

  const offset = _svgOffset(containerEl);

  // Create input element
  chordInputEl = document.createElement('input');
  chordInputEl.type = 'text';
  chordInputEl.className = 'chord-input';
  chordInputEl.value = existingText;
  chordInputEl.placeholder = 'Ex: Am7';
  chordInputEl.style.left = (bb.x + offset.x - 10) + 'px';
  chordInputEl.style.top = (bb.y + offset.y - 24) + 'px';

  // Event listeners
  chordInputEl.addEventListener('keydown', _handleKeydown);
  chordInputEl.addEventListener('blur', _handleBlur);

  containerEl.appendChild(chordInputEl);
  chordInputEl.focus();
  chordInputEl.select();
}

/**
 * Exit chord-symbol editing mode.
 * @param {boolean} commit  If true, save the text; if false, discard changes.
 */
export function exitChordMode(commit = true) {
  if (!editorState.chordMode) return;
  if (isExiting) return;
  isExiting = true;

  if (commit) {
    _commitChordText();
  }

  _removeInput();
  editorState.chordMode = false;
  currentSel = null;
  containerRef = null;
  isExiting = false;

  // Re-render to show committed chord symbol (or remove it)
  if (commit) _notifyChange();
}

// ---------------------------------------------------------------------------
// Navigation within chord mode
// ---------------------------------------------------------------------------

function _navigateChordMode(direction) {
  if (!containerRef) return;

  // Commit current text
  _commitChordText();
  _removeInput();

  // Trigger re-render so the committed symbol is drawn
  _notifyChange();

  // Move selection
  navigateSelection(direction);

  // Re-enter chord mode on the new note
  const newSel = _primarySel();
  if (!newSel) {
    editorState.chordMode = false;
    return;
  }

  currentSel = { ...newSel };
  const score = getScore();
  const note = score.staves[newSel.staffIndex]
    .measures[newSel.measureIndex]
    .notes[newSel.noteIndex];
  const existingText = (note && note.chordSymbol) || '';
  chordOriginalText = existingText;

  const bb = getNoteBoundingBox(newSel.staffIndex, newSel.measureIndex, newSel.noteIndex);
  if (!bb) {
    editorState.chordMode = false;
    return;
  }

  const offset = _svgOffset(containerRef);

  chordInputEl = document.createElement('input');
  chordInputEl.type = 'text';
  chordInputEl.className = 'chord-input';
  chordInputEl.value = existingText;
  chordInputEl.placeholder = 'Ex: Am7';
  chordInputEl.style.left = (bb.x + offset.x - 10) + 'px';
  chordInputEl.style.top = (bb.y + offset.y - 24) + 'px';

  chordInputEl.addEventListener('keydown', _handleKeydown);
  chordInputEl.addEventListener('blur', _handleBlur);

  containerRef.appendChild(chordInputEl);
  chordInputEl.focus();
  chordInputEl.select();
}

// ---------------------------------------------------------------------------
// Event handlers (attached to the <input>)
// ---------------------------------------------------------------------------

function _handleKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    exitChordMode(true);
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    exitChordMode(false);
    return;
  }

  // Arrow right at end of text → navigate to next note
  if (e.key === 'ArrowRight' && chordInputEl &&
      chordInputEl.selectionStart === chordInputEl.value.length &&
      chordInputEl.selectionEnd === chordInputEl.value.length) {
    e.preventDefault();
    _navigateChordMode('right');
    return;
  }

  // Arrow left at start of text → navigate to previous note
  if (e.key === 'ArrowLeft' && chordInputEl &&
      chordInputEl.selectionStart === 0 &&
      chordInputEl.selectionEnd === 0) {
    e.preventDefault();
    _navigateChordMode('left');
    return;
  }

  // Tab → exit chord mode, let normal tab behavior happen
  if (e.key === 'Tab') {
    e.preventDefault();
    exitChordMode(true);
    return;
  }
}

function _handleBlur() {
  // Small delay to allow navigation click to process first
  setTimeout(() => {
    if (editorState.chordMode && !isExiting) {
      exitChordMode(true);
    }
  }, 100);
}
