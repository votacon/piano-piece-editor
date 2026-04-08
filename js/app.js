// app.js — Bootstrap, orchestration, toolbar wiring, keyboard shortcuts
import { createScore, cloneScore } from './score-model.js';
import { renderScore, getNoteElementMap } from './renderer.js';
import {
  initEditor, getEditorState, setDuration, toggleAccidental,
  toggleRestMode, toggleDynamics, handleScoreClick,
  insertNoteByKey, deleteSelectedNote, navigateSelection,
  changeOctave, toggleTie, switchStaff
} from './editor.js';

const state = {
  score: null,
  selection: null,
  undoStack: [],
  redoStack: [],
  isPlaying: false,
};

const MAX_UNDO = 50;

function render() {
  const container = document.getElementById('score-container');
  renderScore(state.score, container, state.selection);
  syncToolbar();
  syncHeader();
}

function syncHeader() {
  const titleEl = document.getElementById('score-title');
  const composerEl = document.getElementById('score-composer');
  if (titleEl.textContent !== state.score.title) {
    titleEl.textContent = state.score.title;
  }
  if (composerEl.textContent !== state.score.composer) {
    composerEl.textContent = state.score.composer;
  }
  document.getElementById('bpm-input').value = state.score.tempo;
}

function syncToolbar() {
  const es = getEditorState();
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.duration === es.currentDuration);
  });
  document.querySelectorAll('.accidental-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accidental === es.currentAccidental);
  });
  document.getElementById('btn-rest').classList.toggle('active', es.restMode);
  document.querySelectorAll('.dynamics-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dynamics === es.currentDynamics);
  });
}

function pushUndo() {
  state.undoStack.push(JSON.stringify(state.score));
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
  state.redoStack = [];
}

function undo() {
  if (state.undoStack.length === 0) return;
  state.redoStack.push(JSON.stringify(state.score));
  state.score = JSON.parse(state.undoStack.pop());
  state.selection = null;
  render();
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(JSON.stringify(state.score));
  state.score = JSON.parse(state.redoStack.pop());
  state.selection = null;
  render();
}

function setupToolbar() {
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDuration(btn.dataset.duration);
      syncToolbar();
    });
  });
  document.querySelectorAll('.accidental-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleAccidental(btn.dataset.accidental);
      syncToolbar();
    });
  });
  document.getElementById('btn-rest').addEventListener('click', () => {
    toggleRestMode();
    syncToolbar();
  });
  document.querySelectorAll('.dynamics-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleDynamics(btn.dataset.dynamics);
      syncToolbar();
    });
  });
  document.getElementById('btn-tie').addEventListener('click', () => {
    toggleTie();
  });
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('bpm-input').addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (val >= 20 && val <= 300) {
      pushUndo();
      state.score.tempo = val;
    }
  });
  document.getElementById('score-title').addEventListener('blur', (e) => {
    const newTitle = e.target.textContent.trim();
    if (newTitle && newTitle !== state.score.title) {
      pushUndo();
      state.score.title = newTitle;
    }
  });
  document.getElementById('score-composer').addEventListener('blur', (e) => {
    const newComposer = e.target.textContent.trim();
    if (newComposer && newComposer !== state.score.composer) {
      pushUndo();
      state.score.composer = newComposer;
    }
  });
}

function setupScoreClick() {
  document.getElementById('score-container').addEventListener('click', (e) => {
    if (state.isPlaying) return;
    handleScoreClick(e, getNoteElementMap());
  });
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    const key = e.key;
    const ctrl = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;

    if (!ctrl && !shift && 'cdefgab'.includes(key.toLowerCase()) && key.length === 1) {
      e.preventDefault();
      insertNoteByKey(key.toLowerCase());
      return;
    }

    const durMap = { '1': 'w', '2': 'h', '3': 'q', '4': '8', '5': '16' };
    if (!ctrl && !shift && durMap[key]) {
      e.preventDefault();
      setDuration(durMap[key]);
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 's') {
      e.preventDefault();
      toggleAccidental('#');
      syncToolbar();
      return;
    }

    if (!ctrl && shift && key === 'F') {
      e.preventDefault();
      toggleAccidental('b');
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 'r') {
      e.preventDefault();
      toggleRestMode();
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 't') {
      e.preventDefault();
      toggleTie();
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      deleteSelectedNote();
      return;
    }

    if (!shift && key === 'ArrowLeft') {
      e.preventDefault();
      navigateSelection(-1);
      return;
    }
    if (!shift && key === 'ArrowRight') {
      e.preventDefault();
      navigateSelection(1);
      return;
    }

    if (shift && key === 'ArrowUp') {
      e.preventDefault();
      changeOctave(1);
      return;
    }
    if (shift && key === 'ArrowDown') {
      e.preventDefault();
      changeOctave(-1);
      return;
    }

    if (key === ' ') {
      e.preventDefault();
      togglePlayback();
      return;
    }

    if (ctrl && !shift && key === 'z') {
      e.preventDefault();
      undo();
      return;
    }

    if (ctrl && shift && key === 'Z') {
      e.preventDefault();
      redo();
      return;
    }

    if (key === 'Tab') {
      e.preventDefault();
      switchStaff();
      return;
    }
  });
}

function togglePlayback() {
  console.log('Playback toggle — not yet implemented');
}

function setupFileActions() {
  document.getElementById('btn-new').addEventListener('click', () => {
    document.getElementById('new-dialog').showModal();
  });
  document.getElementById('new-dialog-cancel').addEventListener('click', () => {
    document.getElementById('new-dialog').close();
  });
  document.getElementById('new-dialog-create').addEventListener('click', () => {
    const title = document.getElementById('new-title').value || 'Untitled';
    const composer = document.getElementById('new-composer').value || 'Composer';
    const timeSig = document.getElementById('new-time-sig').value;
    const keySig = document.getElementById('new-key-sig').value;
    const bpm = parseInt(document.getElementById('new-bpm').value, 10) || 120;
    const measures = parseInt(document.getElementById('new-measures').value, 10) || 4;

    state.score = createScore({
      title, composer, timeSignature: timeSig,
      keySignature: keySig, tempo: bpm, measures,
    });
    state.selection = null;
    state.undoStack = [];
    state.redoStack = [];
    document.getElementById('new-dialog').close();
    render();
  });
  document.getElementById('btn-save').addEventListener('click', () => {
    console.log('Save — not yet wired');
  });
  document.getElementById('btn-load').addEventListener('click', () => {
    console.log('Load — not yet wired');
  });
  document.getElementById('btn-export').addEventListener('click', () => {
    console.log('Export — not yet wired');
  });
}

function init() {
  state.score = createScore({ title: 'Untitled', composer: 'Composer', measures: 4 });

  initEditor({
    onScoreChange: render,
    getScore: () => state.score,
    getSelection: () => state.selection,
    setSelection: (sel) => { state.selection = sel; },
    pushUndo: pushUndo,
  });

  setupToolbar();
  setupScoreClick();
  setupKeyboard();
  setupFileActions();

  render();
  console.log('Piano Piece Editor initialized');
}

window._state = state;
window._render = render;
window._undo = undo;
window._redo = redo;

document.addEventListener('DOMContentLoaded', init);
