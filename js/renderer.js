// renderer.js — VexFlow rendering of the score model to SVG
const VF = Vex.Flow;

let vfRenderer = null;
let vfContext = null;
let noteElementMap = [];

const LAYOUT = {
  leftPadding: 25,
  topPadding: 20,
  staffWidth: 250,
  firstMeasureExtra: 80,
  trebleBassGap: 80,
  systemGap: 60,
  staffHeight: 100,
  measuresPerLine: 3,
  maxWidth: 885,
};

export function initRenderer(container) {
  container.innerHTML = '';
  vfRenderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  vfContext = vfRenderer.getContext();
  noteElementMap = [];
}

export function renderScore(score, container, selection = null) {
  initRenderer(container);
  noteElementMap = [];

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
      }
      if (isLastMeasure) {
        trebleStave.setEndBarType(VF.Barline.type.END);
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

  if (!measure || !measure.notes || measure.notes.length === 0) return;

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

    if (isSelected) {
      vfNote.setStyle({ fillStyle: '#2563eb', strokeStyle: '#2563eb' });
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

  // Draw ties
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
