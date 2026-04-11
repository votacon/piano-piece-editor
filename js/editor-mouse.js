// editor-mouse.js — Mouse/click interaction for the score editor
import {
  getScore, setSelection, onScoreChange,
  _notifyChange
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
  // Only match if click is within the horizontal bounds of a stave
  let bestEntry = null;
  let bestDist  = Infinity;

  for (const entry of noteElementMap) {
    if (!entry.stave) continue;
    const staveX = entry.stave.getX();
    const staveW = entry.stave.getWidth();
    const staveY = entry.stave.getY();
    const staveH = entry.stave.getHeight();

    // Must be within horizontal bounds of the stave
    if (mx < staveX || mx > staveX + staveW) continue;

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
 * Behaviour (selection-only):
 *  - If a note or rest is hit → select it.
 *  - Otherwise → clear the selection.
 *
 * Notes are inserted via keyboard, not mouse.
 */
export function handleScoreClick(event, noteElementMap) {
  if (!getScore || !setSelection || !onScoreChange) return;

  const hit = _hitTest(event, noteElementMap);

  if (hit) {
    setSelection([{
      staffIndex:   hit.staffIndex,
      measureIndex: hit.measureIndex,
      noteIndex:    hit.noteIndex,
    }]);
  } else {
    setSelection([]);
  }
  _notifyChange();
}
