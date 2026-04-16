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

const DURATIONS = ['w', 'h', 'q', '8', '16'];
const ACCIDENTALS = ['#', 'b', 'n'];
const DYNAMICS = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
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
  if (options.arpeggio) {
    note.arpeggio = options.arpeggio;
  }
  return note;
}

export function createRest(duration) {
  return createNote(['b/4'], duration, { type: 'rest' });
}

function createEmptyMeasure() {
  return {
    notes: []
  };
}

export function measureDuration(measure) {
  return measure.notes.reduce((sum, note) => {
    let dur = DURATION_VALUES[note.duration] || 0;
    if (note.dotted) dur *= 1.5;
    return sum + dur;
  }, 0);
}

export function isMeasureOverflowing(measure, beats) {
  return measureDuration(measure) > beats + 0.001;
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
  const idx = noteIndex === -1 ? measure.notes.length : noteIndex;

  measure.notes.splice(idx, 0, { ...note, keys: [...note.keys] });
  return true;
}

export function addKeyToNote(score, staffIndex, measureIndex, noteIndex, newKey) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const note = staff.measures[measureIndex].notes[noteIndex];
  if (!note || note.type === 'rest') return false;
  // Avoid duplicate keys
  if (note.keys.includes(newKey)) return false;
  note.keys.push(newKey);
  // Sort keys by pitch (low to high) for proper VexFlow rendering
  note.keys.sort((a, b) => keyToMidi(a) - keyToMidi(b));
  return true;
}

export function removeKeyFromNote(score, staffIndex, measureIndex, noteIndex, keyToRemove) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const note = staff.measures[measureIndex].notes[noteIndex];
  if (!note || note.type === 'rest') return false;
  if (note.keys.length <= 1) return false; // don't remove last key
  const idx = note.keys.indexOf(keyToRemove);
  if (idx === -1) return false;
  note.keys.splice(idx, 1);
  return true;
}

export function replaceNote(score, staffIndex, measureIndex, noteIndex, newNote) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const measure = staff.measures[measureIndex];
  if (noteIndex < 0 || noteIndex >= measure.notes.length) return false;

  measure.notes[noteIndex] = { ...newNote, keys: [...newNote.keys] };
  return true;
}

export function removeNote(score, staffIndex, measureIndex, noteIndex) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;
  const measure = staff.measures[measureIndex];
  if (noteIndex < 0 || noteIndex >= measure.notes.length) return false;

  // Rule 1: only note in measure → measure becomes empty
  if (measure.notes.length === 1) {
    measure.notes = [];
    return true;
  }

  const removed = measure.notes[noteIndex];

  // Rule 2: removing an explicit rest → splice it away
  if (removed.type === 'rest') {
    measure.notes.splice(noteIndex, 1);
    return true;
  }

  // Rule 3: removing a real note with siblings → replace with rest of same duration
  const rest = createRest(removed.duration);
  if (removed.dotted) rest.dotted = true;
  measure.notes[noteIndex] = rest;
  return true;
}

function _mergeAdjacentRests(measure, totalBeats) {
  // If all notes are rests, simplify to a single whole rest
  if (measure.notes.every(n => n.type === 'rest')) {
    measure.notes = [createRest('w')];
    return;
  }

  // Merge consecutive rests into the largest possible rest values
  let i = 0;
  while (i < measure.notes.length - 1) {
    if (measure.notes[i].type === 'rest' && measure.notes[i + 1].type === 'rest') {
      const combined = (DURATION_VALUES[measure.notes[i].duration] || 0) +
                       (DURATION_VALUES[measure.notes[i + 1].duration] || 0);
      // Find the largest single rest that fits
      const bestDur = ['w', 'h', 'q', '8', '16'].find(d => Math.abs(DURATION_VALUES[d] - combined) < 0.001);
      if (bestDur) {
        measure.notes.splice(i, 2, createRest(bestDur));
        continue; // check again at same index
      }
    }
    i++;
  }
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

export function insertNoteAt(score, staffIndex, measureIndex, noteIndex, note) {
  const staff = score.staves[staffIndex];
  if (!staff || !staff.measures[measureIndex]) return false;

  const measure = staff.measures[measureIndex];
  const idx = Math.min(noteIndex, measure.notes.length);
  measure.notes.splice(idx, 0, { ...note, keys: [...note.keys] });
  return true;
}

export function fillMeasureWithRests(measure, totalBeats) {
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

export function midiToKey(midi, preferFlat = false) {
  const octave = Math.floor(midi / 12) - 1;
  const pitchClass = midi % 12;
  const sharpNames = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const flatNames  = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];
  const names = preferFlat ? flatNames : sharpNames;
  const n = names[pitchClass];
  return buildKey(n[0], n.substring(1), octave);
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
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

export function getEffectiveClef(score, staffIndex, measureIndex) {
  const staff = score.staves[staffIndex];
  for (let i = measureIndex; i >= 0; i--) {
    if (staff.measures[i].clef) return staff.measures[i].clef;
  }
  return staff.clef;
}

export function setMeasureClef(score, staffIndex, measureIndex, clef) {
  score.staves[staffIndex].measures[measureIndex].clef = clef;
}
