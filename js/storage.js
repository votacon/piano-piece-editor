// storage.js — localStorage persistence and JSON export

const STORAGE_KEY = 'piano-piece-editor-scores';

/**
 * Returns all stored scores as an object keyed by id.
 * @returns {Object}
 */
export function getAllScores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Generates a URL-safe id from a title string.
 * @param {string} title
 * @returns {string}
 */
function generateId(title) {
  return (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

/**
 * Sanitises a string for use as a filename (no path separators, etc.).
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  return (name || 'score')
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim() || 'score';
}

/**
 * Saves a score to localStorage under a generated id.
 * If a score with the same base id already exists a numeric suffix is appended.
 * @param {Object} score
 * @returns {string} The id the score was stored under.
 */
export function saveScoreToStorage(score) {
  const scores = getAllScores();
  const baseId = generateId(score.title);

  // Find a unique id
  let id = baseId;
  let counter = 1;
  // Reuse existing entry with same id, or find a free slot
  while (scores[id] && scores[id].title !== score.title) {
    id = `${baseId}-${counter++}`;
  }

  scores[id] = JSON.parse(JSON.stringify(score)); // deep copy before storing
  scores[id]._savedAt = new Date().toISOString();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch (e) {
    console.error('Failed to save score to localStorage:', e);
  }

  return id;
}

/**
 * Returns a deep copy of the stored score for the given id, or null.
 * @param {string} id
 * @returns {Object|null}
 */
export function loadScoreFromStorage(id) {
  const scores = getAllScores();
  if (!scores[id]) return null;
  return JSON.parse(JSON.stringify(scores[id]));
}

/**
 * Deletes the stored score with the given id.
 * @param {string} id
 * @returns {boolean} True if the entry existed and was deleted.
 */
export function deleteScoreFromStorage(id) {
  const scores = getAllScores();
  if (!scores[id]) return false;
  delete scores[id];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch (e) {
    console.error('Failed to update localStorage after delete:', e);
  }
  return true;
}

/**
 * Triggers a browser download of the score as a .json file.
 * @param {Object} score
 */
export function exportScoreAsJSON(score) {
  const filename = sanitizeFilename(score.title || 'score') + '.json';
  const json = JSON.stringify(score, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
