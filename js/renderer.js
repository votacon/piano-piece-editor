// renderer.js — VexFlow rendering of the score model to SVG
import { isMeasureOverflowing } from './score-model.js';

const VF = Vex.Flow;

let vfRenderer = null;
let vfContext = null;
let noteElementMap = [];
let _pendingTies = {};

const LAYOUT = {
  leftPadding: 25,
  topPadding: 20,
  staffWidth: 190,
  firstMeasureExtra: 55,
  trebleBassGap: 30,
  systemGap: 60,
  staffHeight: 100,
  measuresPerLine: 4,
  maxWidth: 885,
};

function _isMeasureSelectedAndEmpty(score, staffIndex, measureIndex, selection) {
  const measure = score.staves[staffIndex].measures[measureIndex];
  if (!measure || !measure.notes || measure.notes.length > 0) return false;
  if (!Array.isArray(selection)) {
    return selection && selection.staffIndex === staffIndex && selection.measureIndex === measureIndex;
  }
  return selection.some(s => s.staffIndex === staffIndex && s.measureIndex === measureIndex);
}

export function initRenderer(container) {
  container.innerHTML = '';
  vfRenderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  vfContext = vfRenderer.getContext();
  noteElementMap = [];
}

export function renderScore(score, container, selection = null) {
  initRenderer(container);
  noteElementMap = [];
  _pendingTies = {};

  const measureCount = score.staves[0].measures.length;
  const measuresPerLine = LAYOUT.measuresPerLine;
  const numLines = Math.ceil(measureCount / measuresPerLine);

  const lineHeight = LAYOUT.staffHeight + LAYOUT.trebleBassGap + LAYOUT.staffHeight + LAYOUT.systemGap;
  const totalHeight = LAYOUT.topPadding + numLines * lineHeight + 40;
  vfRenderer.resize(LAYOUT.maxWidth, totalHeight);

  const timeSigStr = `${score.timeSignature.beats}/${score.timeSignature.beatValue}`;

  for (let line = 0; line < numLines; line++) {
    const startMeasure = line * measuresPerLine;
    const endMeasure = Math.min(startMeasure + measuresPerLine, measureCount);
    const isFirstLine = line === 0;

    const yOffset = LAYOUT.topPadding + line * lineHeight;
    let xCursor = LAYOUT.leftPadding;

    for (let mi = startMeasure; mi < endMeasure; mi++) {
      const isFirstMeasure = mi === startMeasure;
      const isLastMeasure = mi === measureCount - 1;
      let measWidth = LAYOUT.staffWidth;
      if (isFirstMeasure) measWidth += LAYOUT.firstMeasureExtra;

      const trebleStave = new VF.Stave(xCursor, yOffset, measWidth);
      if (isFirstMeasure) {
        trebleStave.addClef('treble');
        if (isFirstLine) {
          trebleStave.addKeySignature(score.keySignature);
          trebleStave.addTimeSignature(timeSigStr);
        }
        trebleStave.setMeasure(mi + 1);
      }
      if (isLastMeasure) {
        trebleStave.setEndBarType(VF.Barline.type.END);
      }
      const trebleMeasure = score.staves[0].measures[mi];
      if (isMeasureOverflowing(trebleMeasure, score.timeSignature.beats)) {
        trebleStave.setStyle({ strokeStyle: '#dc2626', fillStyle: '#dc2626' });
      } else if (_isMeasureSelectedAndEmpty(score, 0, mi, selection)) {
        trebleStave.setStyle({ strokeStyle: '#93c5fd', fillStyle: '#93c5fd' });
      }
      trebleStave.setContext(vfContext).draw();

      const bassY = yOffset + LAYOUT.staffHeight + LAYOUT.trebleBassGap;
      const bassStave = new VF.Stave(xCursor, bassY, measWidth);
      if (isFirstMeasure) {
        bassStave.addClef('bass');
        if (isFirstLine) {
          bassStave.addKeySignature(score.keySignature);
          bassStave.addTimeSignature(timeSigStr);
        }
      }
      if (isLastMeasure) {
        bassStave.setEndBarType(VF.Barline.type.END);
      }
      const bassMeasure = score.staves[1].measures[mi];
      if (isMeasureOverflowing(bassMeasure, score.timeSignature.beats)) {
        bassStave.setStyle({ strokeStyle: '#dc2626', fillStyle: '#dc2626' });
      } else if (_isMeasureSelectedAndEmpty(score, 1, mi, selection)) {
        bassStave.setStyle({ strokeStyle: '#93c5fd', fillStyle: '#93c5fd' });
      }
      bassStave.setContext(vfContext).draw();

      if (isFirstMeasure) {
        const brace = new VF.StaveConnector(trebleStave, bassStave);
        brace.setType(VF.StaveConnector.type.BRACE);
        brace.setContext(vfContext).draw();

        const lineConn = new VF.StaveConnector(trebleStave, bassStave);
        lineConn.setType(VF.StaveConnector.type.SINGLE_LEFT);
        lineConn.setContext(vfContext).draw();
      }

      renderMeasureNotes(score, 0, mi, trebleStave, selection);
      renderMeasureNotes(score, 1, mi, bassStave, selection);

      xCursor += measWidth;
    }
  }

  return noteElementMap;
}

function renderMeasureNotes(score, staffIndex, measureIndex, stave, selection) {
  const staff = score.staves[staffIndex];
  const measure = staff.measures[measureIndex];

  if (!measure || !measure.notes || measure.notes.length === 0) {
    // Empty-measure anchor for hit-testing and selection
    noteElementMap.push({
      staffIndex,
      measureIndex,
      noteIndex: 0,
      staveNote: null,
      stave,
    });
    _pendingTies[staffIndex] = null;
    return;
  }

  const vfNotes = [];

  for (let ni = 0; ni < measure.notes.length; ni++) {
    const noteData = measure.notes[ni];
    const isSelected = Array.isArray(selection)
      ? selection.some(s => s.staffIndex === staffIndex && s.measureIndex === measureIndex && s.noteIndex === ni)
      : selection && selection.staffIndex === staffIndex && selection.measureIndex === measureIndex && selection.noteIndex === ni;

    let vfNote;

    const dottedSuffix = noteData.dotted ? 'd' : '';

    if (noteData.type === 'rest') {
      const restKey = staff.clef === 'bass' ? 'd/3' : 'b/4';
      vfNote = new VF.StaveNote({
        keys: [restKey],
        duration: noteData.duration + dottedSuffix + 'r',
        clef: staff.clef,
      });
    } else {
      vfNote = new VF.StaveNote({
        keys: noteData.keys,
        duration: noteData.duration + dottedSuffix,
        clef: staff.clef,
        auto_stem: true,
      });

      // Add accidentals from key names
      for (let ki = 0; ki < noteData.keys.length; ki++) {
        const keyParts = noteData.keys[ki].split('/');
        const pitchStr = keyParts[0];
        if (pitchStr.length > 1) {
          const acc = pitchStr.substring(1);
          vfNote.addModifier(new VF.Accidental(acc), ki);
        }
      }
    }

    // Add dot modifier for dotted notes
    if (noteData.dotted) {
      VF.Dot.buildAndAttach([vfNote], { all: true });
    }

    // Chord symbol annotation (treble staff only)
    if (staffIndex === 0 && noteData.chordSymbol) {
      const annotation = new VF.Annotation(noteData.chordSymbol);
      annotation.setFont('Arial', 12, 'bold');
      annotation.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
      vfNote.addModifier(annotation);
    }

    const measureOverflow = isMeasureOverflowing(measure, score.timeSignature.beats);
    if (isSelected) {
      vfNote.setStyle({ fillStyle: '#2563eb', strokeStyle: '#2563eb' });
    } else if (measureOverflow) {
      vfNote.setStyle({ fillStyle: '#dc2626', strokeStyle: '#dc2626' });
    }

    vfNotes.push(vfNote);

    noteElementMap.push({
      staffIndex,
      measureIndex,
      noteIndex: ni,
      staveNote: vfNote,
      stave: stave,
    });
  }

  if (vfNotes.length === 0) return;

  const voice = new VF.Voice({
    num_beats: score.timeSignature.beats,
    beat_value: score.timeSignature.beatValue,
  }).setMode(VF.Voice.Mode.SOFT);

  voice.addTickables(vfNotes);

  const beamableNotes = vfNotes.filter(n => {
    const dur = n.getDuration();
    return (dur === '8' || dur === '16') && !n.isRest();
  });
  let beams = [];
  if (beamableNotes.length >= 2) {
    try {
      beams = VF.Beam.generateBeams(beamableNotes);
    } catch (e) {
      beams = [];
    }
  }

  new VF.Formatter()
    .joinVoices([voice])
    .format([voice], stave.getWidth() - 50);

  voice.draw(vfContext, stave);

  for (const beam of beams) {
    beam.setContext(vfContext).draw();
  }

  // Draw cross-measure tie from previous measure
  if (_pendingTies[staffIndex]) {
    try {
      const firstNonRestIdx = vfNotes.findIndex((_, i) => measure.notes[i].type !== 'rest');
      if (firstNonRestIdx >= 0) {
        const tie = new VF.StaveTie({
          first_note: _pendingTies[staffIndex],
          last_note: vfNotes[firstNonRestIdx],
          first_indices: [0],
          last_indices: [0],
        });
        tie.setContext(vfContext).draw();
      }
    } catch (e) {
      console.warn('Cross-measure tie render failed:', e);
    }
    _pendingTies[staffIndex] = null;
  }

  // Draw intra-measure ties
  for (let ni = 0; ni < measure.notes.length - 1; ni++) {
    if (measure.notes[ni].tied && !measure.notes[ni].type) {
      try {
        const tie = new VF.StaveTie({
          first_note: vfNotes[ni],
          last_note: vfNotes[ni + 1],
          first_indices: [0],
          last_indices: [0],
        });
        tie.setContext(vfContext).draw();
      } catch (e) {
        console.warn('Tie render failed:', e);
      }
    }
  }

  // Store pending tie if last note is tied (for cross-measure connection)
  const lastNoteData = measure.notes[measure.notes.length - 1];
  if (lastNoteData && lastNoteData.tied && lastNoteData.type !== 'rest') {
    _pendingTies[staffIndex] = vfNotes[vfNotes.length - 1];
  }
}

export function getNoteElementMap() {
  return noteElementMap;
}

export function getNoteBoundingBox(staffIndex, measureIndex, noteIndex) {
  const entry = noteElementMap.find(
    e => e.staffIndex === staffIndex &&
         e.measureIndex === measureIndex &&
         e.noteIndex === noteIndex
  );
  if (!entry || !entry.staveNote) return null;

  try {
    const bb = entry.staveNote.getBoundingBox();
    return {
      x: bb.getX(),
      y: bb.getY(),
      w: bb.getW(),
      h: bb.getH(),
    };
  } catch (e) {
    return null;
  }
}

export function getStaveBounds(staffIndex, measureIndex) {
  const entry = noteElementMap.find(
    e => e.staffIndex === staffIndex && e.measureIndex === measureIndex
  );
  if (!entry || !entry.stave) return null;
  return {
    y: entry.stave.getY(),
    height: entry.stave.getHeight(),
  };
}
