// editor-mouse.js — Mouse/click interaction for the score editor
import {
  addNote, addKeyToNote, yToKey, parseKey, buildKey
} from './score-model.js';
import {
  getScore, getSelection, setSelection, onScoreChange, editorState,
  _primarySel, _pushUndoIfAvailable, _notifyChange, _buildNoteFromState
} from './editor.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get mouse coordinates relative to the SVG element inside the container.
 * The SVG may be centered with margin:auto, so we must use its rect, not the container's.
 */
function _svgCoords(event) {
  const container = event.currentTarget;
  const svg = container && container.querySelector('svg');
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  return {
    mx: event.clientX - rect.left,
    my: event.clientY - rect.top,
  };
}

function _hitTest(event, noteElementMap) {
  const coords = _svgCoords(event);
  if (!coords) return null;
  const { mx, my } = coords;

  // First pass: exact bounding-box hit
  for (const entry of noteElementMap) {
    if (!entry.staveNote) continue;
    try {
      const bb = entry.staveNote.getBoundingBox();
      if (
        mx >= bb.getX() && mx <= bb.getX() + bb.getW() &&
        my >= bb.getY() && my <= bb.getY() + bb.getH()
      ) {
        return entry;
      }
    } catch (_) {}
  }

  // Second pass: find the stave row containing the click, then pick closest note
  let bestEntry = null;
  let bestDist  = Infinity;

  for (const entry of noteElementMap) {
    if (!entry.stave) continue;
    const staveY = entry.stave.getY();
    const staveH = entry.stave.getHeight();

    // Generous vertical band: stave height + half the gap above/below
    if (my < staveY - staveH * 0.5 || my > staveY + staveH * 1.5) continue;

    try {
      const bb = entry.staveNote.getBoundingBox();
      const cx = bb.getX() + bb.getW() / 2;
      const dist = Math.abs(mx - cx);
      if (dist < bestDist) {
        bestDist  = dist;
        bestEntry = entry;
      }
    } catch (_) {}
  }

  return bestEntry;
}

/**
 * Given a click inside a stave, compute the VexFlow key that corresponds to
 * the clicked y position.
 */
function _yToKeyFromStave(my, stave, clef) {
  const topLineY = stave.getYForLine(0);
  const lineSpacing = stave.getSpacingBetweenLines();
  const yOnStaff = my - topLineY;
  return yToKey(yOnStaff, clef, lineSpacing);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute ghost-note preview info from a mouse position over the score SVG.
 * Returns null if the mouse is not close enough to any stave.
 */
export function getGhostNoteInfo(event, noteElementMap) {
  if (!getScore) return null;

  const container = event.currentTarget;
  const svg = container && container.querySelector('svg');
  if (!svg) return null;

  const containerRect = container.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  // Offset from container origin to SVG origin (accounts for centering margin)
  const svgOffsetX = svgRect.left - containerRect.left;
  const svgOffsetY = svgRect.top - containerRect.top;

  const mx = event.clientX - svgRect.left;
  const my = event.clientY - svgRect.top;

  // Find the closest stave to the mouse
  let closestStave = null;
  let closestStaffIndex = null;
  let bestDist = Infinity;
  const seen = new Set();

  for (const entry of noteElementMap) {
    if (!entry.stave) continue;
    const key = `${entry.staffIndex}-${entry.measureIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const staveX = entry.stave.getX();
    const staveW = entry.stave.getWidth();
    const topLine = entry.stave.getYForLine(0);
    const botLine = entry.stave.getYForLine(4);

    // Horizontal: must be within stave bounds
    if (mx < staveX || mx > staveX + staveW) continue;

    // Vertical distance from the staff line area (with some margin for ledger lines)
    const staveCenter = (topLine + botLine) / 2;
    const dist = Math.abs(my - staveCenter);

    if (dist < bestDist) {
      bestDist = dist;
      closestStave = entry.stave;
      closestStaffIndex = entry.staffIndex;
    }
  }

  if (!closestStave || bestDist > 80) return null;

  const score = getScore();
  const clef = score.staves[closestStaffIndex].clef;
  const topLineY = closestStave.getYForLine(0);
  const lineSpacing = closestStave.getSpacingBetweenLines();
  const halfSpace = lineSpacing / 2;

  // Snap Y to nearest half-space position
  const yOnStaff = my - topLineY;
  const steps = Math.round(yOnStaff / halfSpace);
  const snapY = topLineY + steps * halfSpace;

  const noteKey = yToKey(yOnStaff, clef, lineSpacing);

  return {
    x: mx + svgOffsetX,
    snapY: snapY + svgOffsetY,
    key: noteKey,
    staffIndex: closestStaffIndex,
    staveHeight: lineSpacing,
  };
}

/**
 * Find all notes whose bounding boxes intersect a selection rectangle.
 * Coordinates are in SVG space.
 */
export function getNotesInRect(rect, noteElementMap) {
  const results = [];
  for (const entry of noteElementMap) {
    if (!entry.staveNote) continue;
    try {
      const bb = entry.staveNote.getBoundingBox();
      const nx = bb.getX(), ny = bb.getY(), nw = bb.getW(), nh = bb.getH();
      // Check intersection
      if (nx + nw >= rect.x && nx <= rect.x + rect.w &&
          ny + nh >= rect.y && ny <= rect.y + rect.h) {
        results.push({
          staffIndex: entry.staffIndex,
          measureIndex: entry.measureIndex,
          noteIndex: entry.noteIndex,
        });
      }
    } catch (_) {}
  }
  return results;
}

/**
 * Handle a click on the score SVG element.
 *
 * Behaviour:
 *  - If a note is hit → select it (no insert).
 *  - If empty space in a stave is hit → insert a new note at that pitch
 *    (using the current editor state for duration, accidental, etc.).
 */
export function handleScoreClick(event, noteElementMap) {
  if (!getScore || !setSelection || !onScoreChange) return;

  const score = getScore();
  const hit   = _hitTest(event, noteElementMap);

  if (hit) {
    const measure = score.staves[hit.staffIndex].measures[hit.measureIndex];
    const hitNote = measure.notes[hit.noteIndex];

    // If a rest is clicked, replace it with a note at the clicked pitch
    if (hitNote && hitNote.type === 'rest') {
      const coords = _svgCoords(event);
      if (!coords) return;
      const my    = coords.my;
      const clef  = score.staves[hit.staffIndex].clef;
      const key   = _yToKeyFromStave(my, hit.stave, clef);
      const note  = _buildNoteFromState(key);

      _pushUndoIfAvailable();

      const added = addNote(score, hit.staffIndex, hit.measureIndex, hit.noteIndex, note);
      if (added) {
        setSelection([{
          staffIndex:   hit.staffIndex,
          measureIndex: hit.measureIndex,
          noteIndex:    hit.noteIndex,
        }]);
        _notifyChange();
        return;
      }
    }

    // Select the clicked note (non-rest)
    setSelection([{
      staffIndex:   hit.staffIndex,
      measureIndex: hit.measureIndex,
      noteIndex:    hit.noteIndex,
    }]);
    _notifyChange();
    return;
  }

  // No direct hit — try to insert at the click position
  const coords = _svgCoords(event);
  if (!coords) return;
  const { mx, my } = coords;

  // Find the stave that contains the click (horizontally AND vertically)
  let closestStaff    = null;
  let closestMeasure  = null;
  let closestStaveObj = null;
  let bestScore       = Infinity;
  const seen = new Set();

  for (const entry of noteElementMap) {
    if (!entry.stave) continue;
    const key = `${entry.staffIndex}-${entry.measureIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const staveX = entry.stave.getX();
    const staveW = entry.stave.getWidth();
    const staveY = entry.stave.getY();
    const staveH = entry.stave.getHeight();

    // Horizontal distance: 0 if click is inside the stave, positive otherwise
    const dx = mx < staveX ? staveX - mx : mx > staveX + staveW ? mx - staveX - staveW : 0;
    const staveM = staveY + staveH / 2;
    const dy = Math.abs(my - staveM);

    // Strongly prefer staves that contain the click horizontally
    const sc = dx > 0 ? 10000 + dx + dy : dy;

    if (sc < bestScore) {
      bestScore      = sc;
      closestStaff   = entry.staffIndex;
      closestMeasure = entry.measureIndex;
      closestStaveObj = entry.stave;
    }
  }

  const minVertDist = bestScore >= 10000 ? bestScore - 10000 : bestScore;

  if (closestStaff === null || closestStaveObj === null) return;

  // Only insert when click is reasonably close to a stave (within ~60px)
  if (minVertDist > 60) return;

  const clef = score.staves[closestStaff].clef;
  const key  = _yToKeyFromStave(my, closestStaveObj, clef);

  // Determine the noteIndex by finding the note whose x position is just after the click
  const measureNotes = score.staves[closestStaff].measures[closestMeasure].notes;

  // Find insertion position by looking at x positions in the map
  const measureEntries = noteElementMap.filter(
    e => e.staffIndex === closestStaff && e.measureIndex === closestMeasure
  );

  let insertIndex = measureNotes.length; // append by default
  for (const entry of measureEntries) {
    try {
      const bb = entry.staveNote.getBoundingBox();
      if (mx < bb.getX() + bb.getW() / 2) {
        if (entry.noteIndex < insertIndex) {
          insertIndex = entry.noteIndex;
        }
      }
    } catch (_) {}
  }

  _pushUndoIfAvailable();

  const note = _buildNoteFromState(key);
  const added = addNote(score, closestStaff, closestMeasure, insertIndex, note);

  if (added) {
    setSelection([{
      staffIndex:   closestStaff,
      measureIndex: closestMeasure,
      noteIndex:    insertIndex,
    }]);
    _notifyChange();
  }
}

/**
 * Add a pitch to the selected note by clicking while Shift is held.
 */
export function addToChordByClick(event, noteElementMap) {
  if (!getScore || !getSelection || !setSelection || !onScoreChange) return;

  const score = getScore();
  const sel = _primarySel();
  if (!sel) return;

  const note = score.staves[sel.staffIndex].measures[sel.measureIndex].notes[sel.noteIndex];
  if (!note || note.type === 'rest') return;

  // Get clicked pitch from mouse position
  const coords = _svgCoords(event);
  if (!coords) return;

  // Find stave for the selected note
  const staveEntry = noteElementMap.find(
    e => e.staffIndex === sel.staffIndex && e.measureIndex === sel.measureIndex
  );
  if (!staveEntry || !staveEntry.stave) return;

  const clef = score.staves[sel.staffIndex].clef;
  const clickedKey = _yToKeyFromStave(coords.my, staveEntry.stave, clef);
  const { name, octave } = parseKey(clickedKey);
  const newKey = buildKey(name, editorState.currentAccidental, octave);

  _pushUndoIfAvailable();

  if (addKeyToNote(score, sel.staffIndex, sel.measureIndex, sel.noteIndex, newKey)) {
    _notifyChange();
  }
}
