// undo-redo.js — Dedicated undo/redo module using JSON snapshots

const MAX_HISTORY = 50;

let undoStack = [];
let redoStack = [];

/**
 * Push a snapshot of the current score before a mutation.
 * Clears the redo stack.
 * @param {object} score
 */
export function pushState(score) {
  undoStack.push(JSON.stringify(score));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

/**
 * Undo: saves currentScore to redo stack, restores last undo snapshot.
 * @param {object} currentScore
 * @returns {object|null} restored score, or null if nothing to undo
 */
export function undo(currentScore) {
  if (undoStack.length === 0) return null;
  redoStack.push(JSON.stringify(currentScore));
  return JSON.parse(undoStack.pop());
}

/**
 * Redo: saves currentScore to undo stack, restores last redo snapshot.
 * @param {object} currentScore
 * @returns {object|null} restored score, or null if nothing to redo
 */
export function redo(currentScore) {
  if (redoStack.length === 0) return null;
  undoStack.push(JSON.stringify(currentScore));
  return JSON.parse(redoStack.pop());
}

/** @returns {boolean} */
export function canUndo() {
  return undoStack.length > 0;
}

/** @returns {boolean} */
export function canRedo() {
  return redoStack.length > 0;
}

/** Clears both undo and redo stacks. */
export function clearHistory() {
  undoStack = [];
  redoStack = [];
}
