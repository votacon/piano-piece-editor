// app.js — Bootstrap, orchestration, toolbar wiring, keyboard shortcuts
import { createScore, cloneScore, addMeasure, removeMeasure } from './score-model.js';
import { renderScore, getNoteElementMap, getNoteBoundingBox, getStaveBounds } from './renderer.js';
import { initPlayback, startPlayback, stopPlayback, getIsPlaying, setCursorPosition, setVolume, getScoreDuration } from './playback.js';
import {
  initEditor, getEditorState, setDuration, toggleAccidental,
  toggleRestMode, toggleDynamics, toggleInsertMode, toggleOverwriteMode, toggleDotMode,
  handleScoreClick,
  insertNoteByKey, insertNoteBeforeByKey, deleteSelectedNote, navigateSelection,
  changeOctave, toggleTie, switchStaff, getGhostNoteInfo,
  addToChord, addToChordByClick, getNotesInRect,
  copySelection, cutSelection, pasteAtSelection,
  changeDurationOfSelected, changeAccidentalOfSelected, changeOctaveOfSelected,
  changePitchOfSelected, extendSelection, navigateToMeasure, selectMeasure,
  navigateToStart, navigateToEnd, duplicateSelection, transposeSelection,
  toggleDot, repeatLastAction
} from './editor.js';
import { saveScoreToStorage, loadScoreFromStorage, deleteScoreFromStorage, getAllScores, exportScoreAsJSON } from './storage.js';
import { pushState, undo as undoAction, redo as redoAction, clearHistory, canUndo, canRedo } from './undo-redo.js';

const state = {
  score: null,
  selection: [],
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
  document.getElementById('btn-insert').classList.toggle('active', es.insertMode);
  const btnOvr = document.getElementById('btn-overwrite');
  if (btnOvr) btnOvr.classList.toggle('active', es.overwriteMode);
  const btnDot = document.getElementById('btn-dot');
  if (btnDot) btnDot.classList.toggle('active', es.dotted);
  document.querySelectorAll('.dynamics-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dynamics === es.currentDynamics);
  });
  document.getElementById('btn-undo').disabled = !canUndo();
  document.getElementById('btn-redo').disabled = !canRedo();

  const statusOctave = document.getElementById('status-octave');
  if (statusOctave) statusOctave.textContent = es.currentOctave;
  const statusStaff = document.getElementById('status-staff');
  if (statusStaff) statusStaff.textContent = es.currentStaff === 0 ? 'Treble' : 'Bass';
}

function pushUndo() {
  pushState(state.score);
}

function undo() {
  const restored = undoAction(state.score);
  if (restored === null) return;
  state.score = restored;
  state.selection = [];
  render();
}

function redo() {
  const restored = redoAction(state.score);
  if (restored === null) return;
  state.score = restored;
  state.selection = [];
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
  document.getElementById('btn-insert').addEventListener('click', () => {
    toggleInsertMode();
    syncToolbar();
  });
  const btnOvr = document.getElementById('btn-overwrite');
  if (btnOvr) {
    btnOvr.addEventListener('click', () => {
      toggleOverwriteMode();
      syncToolbar();
    });
  }
  const btnDot = document.getElementById('btn-dot');
  if (btnDot) {
    btnDot.addEventListener('click', () => {
      if (state.selection.length > 0) toggleDot();
      toggleDotMode();
      syncToolbar();
    });
  }
  document.getElementById('btn-add-measure').addEventListener('click', () => {
    pushUndo();
    addMeasure(state.score);
    render();
  });
  document.getElementById('btn-remove-measure').addEventListener('click', () => {
    pushUndo();
    if (removeMeasure(state.score)) {
      state.selection = [];
      render();
    }
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

  // ── Drag-select state ──
  let dragStart = null;   // {x, y} in SVG coords, null when not dragging
  let selectBoxEl = null; // the visual selection rectangle

  function getSvg() { return container.querySelector('svg'); }

  function svgCoords(e) {
    const svg = getSvg();
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { mx: e.clientX - r.left, my: e.clientY - r.top };
  }

  function containerCoords(e) {
    const r = container.getBoundingClientRect();
    return { cx: e.clientX - r.left, cy: e.clientY - r.top };
  }

  function ensureSelectBox() {
    if (!selectBoxEl || !selectBoxEl.parentNode) {
      selectBoxEl = document.createElement('div');
      selectBoxEl.className = 'select-box';
      container.appendChild(selectBoxEl);
    }
  }

  function hideSelectBox() {
    if (selectBoxEl) selectBoxEl.style.display = 'none';
  }

  // ── Mouse down: start drag ──
  container.addEventListener('mousedown', (e) => {
    if (state.isPlaying || e.button !== 0) return;
    // Don't start drag on shift-click (chord add)
    if (e.shiftKey && state.selection.length > 0) return;

    const c = svgCoords(e);
    if (!c) return;
    dragStart = { sx: c.mx, sy: c.my, ...containerCoords(e), moved: false };
  });

  // ── Mouse move: draw selection box ──
  container.addEventListener('mousemove', (e) => {
    // Update ghost note when not dragging
    if (!dragStart) {
      updateGhost(e);
      return;
    }

    hideGhost();
    const cc = containerCoords(e);
    const dx = Math.abs(cc.cx - dragStart.cx);
    const dy = Math.abs(cc.cy - dragStart.cy);

    if (dx > 4 || dy > 4) dragStart.moved = true;
    if (!dragStart.moved) return;

    ensureSelectBox();
    const x = Math.min(cc.cx, dragStart.cx);
    const y = Math.min(cc.cy, dragStart.cy);
    selectBoxEl.style.left = x + 'px';
    selectBoxEl.style.top = y + 'px';
    selectBoxEl.style.width = dx + 'px';
    selectBoxEl.style.height = dy + 'px';
    selectBoxEl.style.display = 'block';
  });

  // ── Mouse up: finalize selection ──
  container.addEventListener('mouseup', (e) => {
    // Shift+click for chord — handle before dragStart check
    // (mousedown skips dragStart when shift is held)
    if (e.shiftKey && state.selection.length > 0 && !dragStart) {
      addToChordByClick(e, getNoteElementMap());
      return;
    }

    if (!dragStart) return;

    const wasDrag = dragStart.moved;
    const startSvg = { x: dragStart.sx, y: dragStart.sy };

    if (wasDrag) {
      const endCoords = svgCoords(e);
      if (endCoords) {
        const rect = {
          x: Math.min(startSvg.x, endCoords.mx),
          y: Math.min(startSvg.y, endCoords.my),
          w: Math.abs(endCoords.mx - startSvg.x),
          h: Math.abs(endCoords.my - startSvg.y),
        };
        const found = getNotesInRect(rect, getNoteElementMap());
        if (found.length > 0) {
          state.selection = found;
          render();
        }
      }
      hideSelectBox();
    }

    dragStart = null;

    if (!wasDrag) {
      handleScoreClick(e, getNoteElementMap());
    }
  });

  container.addEventListener('mouseleave', () => {
    if (dragStart && dragStart.moved) {
      hideSelectBox();
    }
    dragStart = null;
    hideGhost();
  });

  // ── Ghost note preview ──
  let ghostEl = null;
  let ghostLabel = null;

  function ensureGhostEl() {
    if (!ghostEl || !ghostEl.parentNode) {
      ghostEl = document.createElement('div');
      ghostEl.className = 'ghost-note';
      ghostLabel = document.createElement('span');
      ghostLabel.className = 'ghost-note-label';
      ghostEl.appendChild(ghostLabel);
      container.appendChild(ghostEl);
    }
  }

  function updateGhost(e) {
    if (state.isPlaying) { hideGhost(); return; }

    const info = getGhostNoteInfo(e, getNoteElementMap());
    if (!info) { hideGhost(); return; }

    ensureGhostEl();
    ghostEl.style.left = (info.x - 6) + 'px';
    ghostEl.style.top = (info.snapY - 5) + 'px';
    ghostEl.style.display = 'block';

    const es = getEditorState();
    const parts = info.key.split('/');
    const noteName = parts[0].toUpperCase();
    const octave = parts[1];
    const acc = es.currentAccidental === '#' ? '#' : es.currentAccidental === 'b' ? 'b' : '';
    ghostLabel.textContent = noteName + acc + octave;
  }

  function hideGhost() {
    if (ghostEl) ghostEl.style.display = 'none';
  }
}

function showToast(message) {
  let toast = document.getElementById('clipboard-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'clipboard-toast';
    toast.className = 'clipboard-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('visible'), 1200);
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    const key = e.key;
    const ctrl = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    const alt = e.altKey;
    const hasSel = state.selection.length > 0;

    // Ctrl+S / Cmd+S — save score
    if (ctrl && !shift && key === 's') {
      e.preventDefault();
      saveScore();
      return;
    }

    // Ctrl+= — add measure
    if (ctrl && !alt && (key === '=' || key === '+')) {
      e.preventDefault();
      pushUndo();
      addMeasure(state.score);
      render();
      return;
    }

    // Ctrl+- — remove last measure
    if (ctrl && !alt && key === '-') {
      e.preventDefault();
      pushUndo();
      if (removeMeasure(state.score)) {
        state.selection = [];
        render();
      }
      return;
    }

    // Ctrl+C — copy selection
    if (ctrl && !shift && key === 'c') {
      e.preventDefault();
      if (copySelection()) showToast('Copied');
      return;
    }

    // Ctrl+X — cut selection
    if (ctrl && !shift && key === 'x') {
      e.preventDefault();
      if (cutSelection()) showToast('Cut');
      return;
    }

    // Ctrl+V — paste
    if (ctrl && !shift && key === 'v') {
      e.preventDefault();
      pasteAtSelection();
      return;
    }

    // Ctrl+D / Cmd+D — duplicate selection
    if (ctrl && !shift && key === 'd') {
      e.preventDefault();
      duplicateSelection();
      return;
    }

    // Ctrl+. / Cmd+. — repeat last action
    if (ctrl && key === '.') {
      e.preventDefault();
      repeatLastAction();
      return;
    }

    // Ctrl+Shift+M / Cmd+Shift+M — select entire measure
    if (ctrl && shift && (key === 'M' || key === 'm')) {
      e.preventDefault();
      selectMeasure();
      return;
    }

    // Q — select entire measure (Mac-friendly alternative to Ctrl+Shift+M)
    if (!ctrl && !shift && !alt && key === 'q') {
      e.preventDefault();
      selectMeasure();
      return;
    }

    // Note letter keys: C D E F G A B
    if (!ctrl && 'cdefgab'.includes(key.toLowerCase()) && key.length === 1) {
      e.preventDefault();
      if (shift) {
        addToChord(key.toLowerCase());
      } else if (alt) {
        insertNoteBeforeByKey(key.toLowerCase());
      } else if (getEditorState().overwriteMode && hasSel) {
        changePitchOfSelected(key.toLowerCase());
      } else {
        insertNoteByKey(key.toLowerCase());
      }
      return;
    }

    // Duration keys 1-5: modify selected note + set future duration
    const durMap = { '1': 'w', '2': 'h', '3': 'q', '4': '8', '5': '16' };
    if (!ctrl && !shift && durMap[key]) {
      e.preventDefault();
      if (hasSel) changeDurationOfSelected(durMap[key]);
      setDuration(durMap[key]);
      syncToolbar();
      return;
    }

    // Accidental keys: modify selected note + set future accidental
    if (!ctrl && !shift && key === 's') {
      e.preventDefault();
      if (hasSel) changeAccidentalOfSelected('#');
      toggleAccidental('#');
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && !alt && key === '-') {
      e.preventDefault();
      if (hasSel) changeAccidentalOfSelected('b');
      toggleAccidental('b');
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 'n') {
      e.preventDefault();
      if (hasSel) changeAccidentalOfSelected('n');
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

    if (!ctrl && !shift && key === 'i') {
      e.preventDefault();
      toggleInsertMode();
      syncToolbar();
      return;
    }

    // O — toggle overwrite mode
    if (!ctrl && !shift && key === 'o') {
      e.preventDefault();
      toggleOverwriteMode();
      syncToolbar();
      return;
    }

    if (!ctrl && !shift && key === 't') {
      e.preventDefault();
      toggleTie();
      return;
    }

    // . — toggle dotted note
    if (!ctrl && !shift && key === '.') {
      e.preventDefault();
      if (hasSel) toggleDot();
      toggleDotMode();
      syncToolbar();
      return;
    }

    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      deleteSelectedNote();
      return;
    }

    // Alt+Arrow Up/Down — transpose by semitone
    if (alt && !ctrl && !shift && key === 'ArrowUp') {
      e.preventDefault();
      transposeSelection(1);
      return;
    }
    if (alt && !ctrl && !shift && key === 'ArrowDown') {
      e.preventDefault();
      transposeSelection(-1);
      return;
    }

    // Ctrl+Arrow Left/Right or [ / ] — jump between measures
    if (ctrl && !shift && key === 'ArrowLeft') {
      e.preventDefault();
      navigateToMeasure('left');
      return;
    }
    if (ctrl && !shift && key === 'ArrowRight') {
      e.preventDefault();
      navigateToMeasure('right');
      return;
    }
    if (!ctrl && !shift && !alt && key === '[') {
      e.preventDefault();
      navigateToMeasure('left');
      return;
    }
    if (!ctrl && !shift && !alt && key === ']') {
      e.preventDefault();
      navigateToMeasure('right');
      return;
    }

    // Shift+Arrow Left/Right — extend selection range
    if (shift && !ctrl && key === 'ArrowLeft') {
      e.preventDefault();
      extendSelection('left');
      return;
    }
    if (shift && !ctrl && key === 'ArrowRight') {
      e.preventDefault();
      extendSelection('right');
      return;
    }

    // Arrow Left/Right — navigate
    if (!shift && !ctrl && !alt && key === 'ArrowLeft') {
      e.preventDefault();
      navigateSelection('left');
      return;
    }
    if (!shift && !ctrl && !alt && key === 'ArrowRight') {
      e.preventDefault();
      navigateSelection('right');
      return;
    }

    // Shift+Arrow Up/Down — change octave (of selected note + future input)
    if (shift && !ctrl && !alt && key === 'ArrowUp') {
      e.preventDefault();
      if (hasSel) changeOctaveOfSelected(1);
      changeOctave(1);
      syncToolbar();
      return;
    }
    if (shift && !ctrl && !alt && key === 'ArrowDown') {
      e.preventDefault();
      if (hasSel) changeOctaveOfSelected(-1);
      changeOctave(-1);
      syncToolbar();
      return;
    }

    // Home/End or Cmd+Up/Down — jump to start/end of staff
    if (ctrl && !shift && key === 'ArrowUp') {
      e.preventDefault();
      navigateToStart();
      return;
    }
    if (ctrl && !shift && key === 'ArrowDown') {
      e.preventDefault();
      navigateToEnd();
      return;
    }
    if (key === 'Home') {
      e.preventDefault();
      navigateToStart();
      return;
    }
    if (key === 'End') {
      e.preventDefault();
      navigateToEnd();
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
      syncToolbar();
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
    document.getElementById('progress-fill').style.width = '0%';
  });
  document.getElementById('volume-slider').addEventListener('input', (e) => {
    setVolume(parseInt(e.target.value, 10) / 100);
  });

  initPlayback({
    onProgress(progress, currentEvent) {
      // Update progress bar fill width
      const progressFill = document.getElementById('progress-fill');
      if (progressFill) {
        progressFill.style.width = (progress * 100) + '%';
      }

      // Move visual cursor to match the current note
      const bb = getNoteBoundingBox(
        currentEvent.staffIndex,
        currentEvent.measureIndex,
        currentEvent.noteIndex
      );
      const sb = getStaveBounds(currentEvent.staffIndex, currentEvent.measureIndex);
      if (bb && sb) {
        // Compensate for SVG centering (margin: 0 auto) within the container
        const container = document.getElementById('score-container');
        const svg = container.querySelector('svg');
        const svgOffsetX = svg
          ? svg.getBoundingClientRect().left - container.getBoundingClientRect().left
          : 0;
        setCursorPosition(bb.x + svgOffsetX, sb.y, sb.height);
      }
    },
    onEnd() {
      state.isPlaying = false;
      updatePlayButton(false);
      document.getElementById('progress-fill').style.width = '0%';
    },
  });

  // Click-to-seek on the progress bar
  const progressBar = document.getElementById('progress-bar');
  progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const duration = getScoreDuration(state.score);
    if (duration <= 0) return;
    const seekTime = ratio * duration;

    document.getElementById('progress-fill').style.width = (ratio * 100) + '%';

    state.isPlaying = true;
    updatePlayButton(true);
    startPlayback(state.score, document.getElementById('score-container'), seekTime);
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
    state.selection = [];
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
          state.selection = [];
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
          state.selection = [];
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
