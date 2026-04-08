// app.js — Bootstrap, orchestration, toolbar wiring, keyboard shortcuts
import { createScore, cloneScore } from './score-model.js';
import { renderScore, getNoteElementMap, getNoteBoundingBox, getStaveBounds } from './renderer.js';
import { initPlayback, startPlayback, stopPlayback, getIsPlaying, setCursorPosition } from './playback.js';
import {
  initEditor, getEditorState, setDuration, toggleAccidental,
  toggleRestMode, toggleDynamics, handleScoreClick,
  insertNoteByKey, deleteSelectedNote, navigateSelection,
  changeOctave, toggleTie, switchStaff, getGhostNoteInfo,
  addToChord, addToChordByClick
} from './editor.js';
import { saveScoreToStorage, loadScoreFromStorage, deleteScoreFromStorage, getAllScores, exportScoreAsJSON } from './storage.js';
import { pushState, undo as undoAction, redo as redoAction, clearHistory, canUndo, canRedo } from './undo-redo.js';

const state = {
  score: null,
  selection: null,
  isPlaying: false,
};

let lastSavedJSON = '';

function autoSave() {
  const currentJSON = JSON.stringify(state.score);
  if (currentJSON !== lastSavedJSON) {
    saveScoreToStorage(state.score);
    lastSavedJSON = currentJSON;
    console.log('Auto-saved');
  }
}

function render() {
  const container = document.getElementById('score-container');
  renderScore(state.score, container, state.selection);
  syncToolbar();
  syncHeader();
}

function syncHeader() {
  const titleEl = document.getElementById('score-title');
  const composerEl = document.getElementById('score-composer');
  const active = document.activeElement;
  if (active !== titleEl && titleEl.textContent !== state.score.title) {
    titleEl.textContent = state.score.title;
  }
  if (active !== composerEl && composerEl.textContent !== state.score.composer) {
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
  document.getElementById('btn-undo').disabled = !canUndo();
  document.getElementById('btn-redo').disabled = !canRedo();
}

function pushUndo() {
  pushState(state.score);
}

function undo() {
  const restored = undoAction(state.score);
  if (restored === null) return;
  state.score = restored;
  state.selection = null;
  render();
}

function redo() {
  const restored = redoAction(state.score);
  if (restored === null) return;
  state.score = restored;
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
  const container = document.getElementById('score-container');

  container.addEventListener('click', (e) => {
    if (state.isPlaying) return;
    if (e.shiftKey && state.selection) {
      addToChordByClick(e, getNoteElementMap());
    } else {
      handleScoreClick(e, getNoteElementMap());
    }
  });

  // Ghost note preview
  let ghostEl = null;
  let ghostLabel = null;

  function ensureGhostEl() {
    // Re-create if removed by render (innerHTML = '')
    if (!ghostEl || !ghostEl.parentNode) {
      ghostEl = document.createElement('div');
      ghostEl.className = 'ghost-note';
      ghostLabel = document.createElement('span');
      ghostLabel.className = 'ghost-note-label';
      ghostEl.appendChild(ghostLabel);
      container.appendChild(ghostEl);
    }
  }

  container.addEventListener('mousemove', (e) => {
    if (state.isPlaying) { hideGhost(); return; }

    const info = getGhostNoteInfo(e, getNoteElementMap());
    if (!info) { hideGhost(); return; }

    ensureGhostEl();
    ghostEl.style.left = (info.x - 6) + 'px';
    ghostEl.style.top = (info.snapY - 5) + 'px';
    ghostEl.style.display = 'block';

    // Show note name (e.g. "C4", "F#5")
    const es = getEditorState();
    const parts = info.key.split('/');
    const noteName = parts[0].toUpperCase();
    const octave = parts[1];
    const acc = es.currentAccidental === '#' ? '#' : es.currentAccidental === 'b' ? 'b' : '';
    ghostLabel.textContent = noteName + acc + octave;
  });

  container.addEventListener('mouseleave', hideGhost);

  function hideGhost() {
    if (ghostEl) ghostEl.style.display = 'none';
  }
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    const key = e.key;
    const ctrl = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;

    // Ctrl+S / Cmd+S — save score
    if (ctrl && !shift && key === 's') {
      e.preventDefault();
      saveScore();
      return;
    }

    if (!ctrl && 'cdefgab'.includes(key.toLowerCase()) && key.length === 1) {
      e.preventDefault();
      if (shift) {
        addToChord(key.toLowerCase()); // Shift+letter → add to chord
      } else {
        insertNoteByKey(key.toLowerCase());
      }
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

    if (!ctrl && !shift && key === '-') {
      e.preventDefault();
      toggleAccidental('b');
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 'n') {
      e.preventDefault();
      toggleAccidental('n');
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
      navigateSelection('left');
      return;
    }
    if (!shift && key === 'ArrowRight') {
      e.preventDefault();
      navigateSelection('right');
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

    if (ctrl && shift && (key === 'Z' || key === 'z')) {
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
  const container = document.getElementById('score-container');
  if (getIsPlaying()) {
    stopPlayback();
    state.isPlaying = false;
    updatePlayButton(false);
  } else {
    state.isPlaying = true;
    updatePlayButton(true);
    startPlayback(state.score, container);
  }
}

function updatePlayButton(playing) {
  const btn = document.getElementById('btn-play');
  if (!btn) return;
  if (playing) {
    btn.textContent = 'Pause';
    btn.classList.add('active');
  } else {
    btn.textContent = 'Play';
    btn.classList.remove('active');
  }
}

function setupPlayback() {
  document.getElementById('btn-play').addEventListener('click', togglePlayback);
  document.getElementById('btn-stop').addEventListener('click', () => {
    stopPlayback();
    state.isPlaying = false;
    updatePlayButton(false);
  });

  initPlayback({
    onProgress(progress, currentEvent) {
      // Update progress bar if present
      const progressBar = document.getElementById('progress-bar');
      if (progressBar) {
        progressBar.value = progress;
      }

      // Move visual cursor to match the current note
      const bb = getNoteBoundingBox(
        currentEvent.staffIndex,
        currentEvent.measureIndex,
        currentEvent.noteIndex
      );
      const sb = getStaveBounds(currentEvent.staffIndex, currentEvent.measureIndex);
      if (bb && sb) {
        setCursorPosition(bb.x, sb.y, sb.height);
      }
    },
    onEnd() {
      state.isPlaying = false;
      updatePlayButton(false);
    },
  });
}

function saveScore() {
  saveScoreToStorage(state.score);
  lastSavedJSON = JSON.stringify(state.score);
  const btn = document.getElementById('btn-save');
  const orig = btn.textContent;
  btn.textContent = 'Saved!';
  setTimeout(() => { btn.textContent = orig; }, 1500);
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
    const bpm = Math.max(20, Math.min(300, parseInt(document.getElementById('new-bpm').value, 10) || 120));
    const measures = Math.max(1, Math.min(64, parseInt(document.getElementById('new-measures').value, 10) || 4));

    state.score = createScore({
      title, composer, timeSignature: timeSig,
      keySignature: keySig, tempo: bpm, measures,
    });
    state.selection = null;
    clearHistory();
    document.getElementById('new-dialog').close();
    render();
  });
  document.getElementById('btn-save').addEventListener('click', saveScore);
  document.getElementById('btn-load').addEventListener('click', () => {
    showLoadDialog();
  });
  document.getElementById('btn-export').addEventListener('click', () => {
    exportScoreAsJSON(state.score);
  });
  document.getElementById('btn-import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!Array.isArray(imported.staves) || imported.staves.length < 2 ||
              !imported.timeSignature || !imported.timeSignature.beats) {
            alert('Invalid score file.');
            return;
          }
          delete imported._savedAt;
          state.score = imported;
          state.selection = null;
          clearHistory();
          render();
        } catch (e) {
          alert('Failed to parse JSON file.');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });
  document.getElementById('load-dialog-cancel').addEventListener('click', () => {
    document.getElementById('load-dialog').close();
  });
}

function showLoadDialog() {
  const scores = getAllScores();
  const list = document.getElementById('saved-scores-list');
  list.innerHTML = '';

  const ids = Object.keys(scores);
  if (ids.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No saved scores found.';
    empty.className = 'load-empty';
    list.appendChild(empty);
  } else {
    ids.forEach(id => {
      const entry = scores[id];
      const li = document.createElement('li');
      li.className = 'load-entry';

      const info = document.createElement('span');
      info.className = 'load-entry-info';
      info.textContent = `${entry.title || 'Untitled'} — ${entry.composer || ''}`;
      if (entry._savedAt) {
        const date = new Date(entry._savedAt).toLocaleString();
        info.title = `Saved: ${date}`;
      }
      info.style.cursor = 'pointer';
      info.addEventListener('click', () => {
        const loaded = loadScoreFromStorage(id);
        if (loaded) {
          // Strip internal storage metadata before restoring
          delete loaded._savedAt;
          state.score = loaded;
          state.selection = null;
          clearHistory();
          document.getElementById('load-dialog').close();
          render();
        }
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'load-entry-delete';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${entry.title || id}"?`)) {
          deleteScoreFromStorage(id);
          showLoadDialog(); // refresh list
        }
      });

      li.appendChild(info);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  }

  document.getElementById('load-dialog').showModal();
}

function init() {
  const allScores = getAllScores();
  const ids = Object.keys(allScores);

  if (ids.length > 0) {
    let mostRecent = ids[0];
    let mostRecentTime = 0;
    for (const id of ids) {
      const t = new Date(allScores[id]._savedAt).getTime();
      if (t > mostRecentTime) {
        mostRecentTime = t;
        mostRecent = id;
      }
    }
    state.score = loadScoreFromStorage(mostRecent) || createScore();
  } else {
    state.score = createScore({ title: 'Untitled', composer: 'Composer', measures: 4 });
  }

  lastSavedJSON = JSON.stringify(state.score);

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
  setupPlayback();

  setInterval(autoSave, 30000);

  render();
  console.log('Piano Piece Editor initialized');
}

window._state = state;
window._render = render;

document.addEventListener('DOMContentLoaded', init);
