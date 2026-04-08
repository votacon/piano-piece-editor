// app.js — Bootstrap and orchestration
import { createScore } from './score-model.js';
import { renderScore } from './renderer.js';

const state = {
  score: null,
  selection: null,
};

function init() {
  state.score = createScore({ title: 'Untitled', composer: 'Composer', measures: 4 });
  render();
  console.log('Piano Piece Editor initialized');
}

function render() {
  const container = document.getElementById('score-container');
  renderScore(state.score, container, state.selection);

  document.getElementById('score-title').textContent = state.score.title;
  document.getElementById('score-composer').textContent = state.score.composer;
  document.getElementById('bpm-input').value = state.score.tempo;
}

window._appState = state;
window._render = render;

document.addEventListener('DOMContentLoaded', init);
