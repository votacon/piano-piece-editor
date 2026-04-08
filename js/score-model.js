// score-model.js — Score data structure and manipulation
// The Score Model is the single source of truth.
// Editor modifies it; Renderer and Playback read from it.

/**
 * Duration values in quarter-note beats.
 */
export const DURATION_VALUES = {
  'w': 4,    // whole
  'h': 2,    // half
  'q': 1,    // quarter
  '8': 0.5,  // eighth
  '16': 0.25 // sixteenth
};

export const DURATIONS = ['w', 'h', 'q', '8', '16'];
export const ACCIDENTALS = ['#', 'b', 'n'];
export const DYNAMICS = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
export const NOTE_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

export function createNote(keys, duration, options = {}) {
  const note = {
    keys: [...keys],
    duration: duration,
  };
  if (options.type === 'rest') {
    note.type = 'rest';
    note.keys = ['b/4'];
  }
  if (options.accidental) {
    note.accidental = options.accidental;
  }
  if (options.dynamics) {
    note.dynamics = options.dynamics;
  }
  if (options.tied) {
    note.tied = true;
  }
  return note;
}

export function createRest(duration) {
  return createNote(['b/4'], duration, { type: 'rest' });
}

export function createEmptyMeasure() {
  return {
    notes: [createRest('w')]
  };
}

export function measureDuration(measure) {
  return measure.notes.reduce((sum, note) => {
    return sum + (DURATION_VALUES[note.duration] || 0);
  }, 0);
}

export function isMeasureFull(measure, beats) {
  return measureDuration(measure) >= beats;
}

export function remainingBeats(measure, beats) {
  return Math.max(0, beats - measureDuration(measure));
}

export function createScore(options = {}) {
  const title = options.title || 'Untitled';
  const composer = options.composer || 'Composer';
  const tempo = options.tempo || 120;
  const timeSigStr = options.timeSignature || '4/4';
  const [beats, beatValue] = timeSigStr.split('/').map(Number);
  const keySignature = options.keySignature || 'C';
  const numMeasures = options.measures || 4;

  const measures = [];
  for (let i = 0; i < numMeasures; i++) {
    measures.push(createEmptyMeasure());
  }

  return {
    title,
    composer,
    tempo,
    timeSignature: { beats, beatValue },
    keySignature,
    staves: [
      {
        clef: 'treble',
        measures: measures.map(m => ({ notes: m.notes.map(n => ({ ...n, keys: [...n.keys] })) }))
      },
      {
        clef: 'bass',
        measures: measures.map(m => ({ notes: m.notes.map(n => ({ ...n, keys: [...n.keys] })) }))
      }
    ]
  };
}

export function cloneScore(score) {
  return JSON.parse(JSON.stringify(score));
}

export function addNote(score, staffIndex, measureIndex, noteIndex, note) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;

  const measure = staff.measures[measureIndex];
  const beats = score.timeSignature.beats;

  const currentDuration = measureDuration(measure);
  const noteDuration = DURATION_VALUES[note.duration] || 0;

  // If measure has only a single whole rest, replace it
  if (measure.notes.length === 1 &&
      measure.notes[0].type === 'rest' &&
      measure.notes[0].duration === 'w') {
    measure.notes = [{ ...note, keys: [...note.keys] }];
    fillMeasureWithRests(measure, beats);
    return true;
  }

  let idx = noteIndex === -1 ? measure.notes.length : noteIndex;

  // If measure is full, remove rests to make room for the new note
  if (currentDuration + noteDuration > beats) {
    const deficit = currentDuration + noteDuration - beats;
    let freedBeats = 0;

    // Remove rests starting at insertion point, going forward
    let i = idx;
    while (i < measure.notes.length && freedBeats < deficit) {
      if (measure.notes[i].type === 'rest') {
        freedBeats += DURATION_VALUES[measure.notes[i].duration] || 0;
        measure.notes.splice(i, 1);
      } else {
        i++;
      }
    }

    // If still not enough, remove rests before insertion point (nearest first)
    for (let j = idx - 1; j >= 0 && freedBeats < deficit; j--) {
      if (measure.notes[j].type === 'rest') {
        freedBeats += DURATION_VALUES[measure.notes[j].duration] || 0;
        measure.notes.splice(j, 1);
        idx--;
      }
    }

    if (freedBeats < deficit) {
      return false; // not enough room even after removing all rests
    }

    idx = Math.min(idx, measure.notes.length);
    measure.notes.splice(idx, 0, { ...note, keys: [...note.keys] });
    fillMeasureWithRests(measure, beats);
    return true;
  }

  measure.notes.splice(idx, 0, { ...note, keys: [...note.keys] });
  return true;
}

export function replaceNote(score, staffIndex, measureIndex, noteIndex, newNote) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const measure = staff.measures[measureIndex];
  if (noteIndex < 0 || noteIndex >= measure.notes.length) return false;

  const oldDuration = DURATION_VALUES[measure.notes[noteIndex].duration] || 0;
  const newDuration = DURATION_VALUES[newNote.duration] || 0;
  const beats = score.timeSignature.beats;
  const currentTotal = measureDuration(measure);

  if (currentTotal - oldDuration + newDuration > beats) {
    return false;
  }

  measure.notes[noteIndex] = { ...newNote, keys: [...newNote.keys] };
  return true;
}

export function removeNote(score, staffIndex, measureIndex, noteIndex) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const measure = staff.measures[measureIndex];
  if (noteIndex < 0 || noteIndex >= measure.notes.length) return false;

  measure.notes.splice(noteIndex, 1);

  if (measure.notes.length === 0) {
    measure.notes = [createRest('w')];
  }

  return true;
}

export function addMeasure(score) {
  for (const staff of score.staves) {
    staff.measures.push(createEmptyMeasure());
  }
}

export function removeMeasure(score) {
  if (score.staves[0].measures.length <= 1) return false;
  for (const staff of score.staves) {
    staff.measures.pop();
  }
  return true;
}

function fillMeasureWithRests(measure, totalBeats) {
  let current = measureDuration(measure);
  const sortedDurations = ['w', 'h', 'q', '8', '16'];

  while (current < totalBeats - 0.001) {
    let filled = false;
    for (const dur of sortedDurations) {
      if (current + DURATION_VALUES[dur] <= totalBeats + 0.001) {
        measure.notes.push(createRest(dur));
        current += DURATION_VALUES[dur];
        filled = true;
        break;
      }
    }
    if (!filled) break;
  }
}

export function parseKey(key) {
  const parts = key.split('/');
  const pitchStr = parts[0];
  const octave = parseInt(parts[1], 10);
  const name = pitchStr[0];
  const accidental = pitchStr.substring(1) || '';
  return { name, accidental, octave };
}

export function buildKey(name, accidental, octave) {
  return `${name}${accidental}/${octave}`;
}

export function keyToMidi(key) {
  const { name, accidental, octave } = parseKey(key);
  const semitones = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  let midi = (octave + 1) * 12 + (semitones[name] || 0);
  if (accidental === '#') midi += 1;
  if (accidental === 'b') midi -= 1;
  return midi;
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function getMeasureCount(score) {
  return score.staves[0].measures.length;
}

export function yToKey(yOnStaff, clef, lineSpacing = 10) {
  const halfSpace = lineSpacing / 2;
  const steps = Math.round(yOnStaff / halfSpace);

  let noteIndex, octave;

  if (clef === 'treble') {
    const f5Index = 3;
    const startOctave = 5;
    const totalSemisteps = f5Index - steps;
    octave = startOctave + Math.floor(totalSemisteps / 7);
    noteIndex = ((totalSemisteps % 7) + 7) % 7;
  } else {
    const a3Index = 5;
    const startOctave = 3;
    const totalSemisteps = a3Index - steps;
    octave = startOctave + Math.floor(totalSemisteps / 7);
    noteIndex = ((totalSemisteps % 7) + 7) % 7;
  }

  octave = Math.max(1, Math.min(8, octave));
  const name = NOTE_NAMES[noteIndex];
  return `${name}/${octave}`;
}
