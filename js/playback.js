// playback.js — Web Audio API playback engine with ADSR, scheduler, and visual cursor
import { keyToMidi, midiToFrequency, DURATION_VALUES } from './score-model.js';

export const ENVELOPE = {
  attack: 0.01,
  decay: 0.15,
  sustain: 0.3,
  release: 0.3,
};

export const DYNAMICS_GAIN = {
  pp: 0.15,
  p: 0.25,
  mp: 0.35,
  mf: 0.5,
  f: 0.7,
  ff: 0.9,
};

// Module-level state
let audioContext = null;
let scheduledSources = [];
let animationFrameId = null;
let playbackStartTime = 0;       // audioContext.currentTime when playback began
let performanceStartTime = 0;    // performance.now() when playback began
let totalDuration = 0;           // total playback duration in seconds
let timeline = [];               // sorted list of { time, duration, frequencies, dynamics, staffIndex, measureIndex, noteIndex }
let cursorEl = null;
let isPlaying = false;
let onProgressCallback = null;
let onEndCallback = null;
let scoreContainer = null;

// ─── Public API ──────────────────────────────────────────────────────────────

export function initPlayback({ onProgress, onEnd } = {}) {
  onProgressCallback = onProgress || null;
  onEndCallback = onEnd || null;
}

export function getIsPlaying() {
  return isPlaying;
}

export function startPlayback(score, container) {
  if (isPlaying) stopPlayback();

  scoreContainer = container;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  timeline = buildTimeline(score);
  if (timeline.length === 0) return;

  totalDuration = timeline.reduce((max, ev) => Math.max(max, ev.time + ev.duration), 0);
  totalDuration += ENVELOPE.release + 0.1; // pad for release tail

  const startOffset = audioContext.currentTime + 0.05;
  playbackStartTime = startOffset;
  performanceStartTime = performance.now();

  scheduledSources = [];

  for (const event of timeline) {
    if (event.frequencies.length === 0) continue; // rest — no sound
    const gainValue = DYNAMICS_GAIN[event.dynamics] || DYNAMICS_GAIN.mf;
    for (const freq of event.frequencies) {
      playTone(freq, startOffset + event.time, event.duration, gainValue);
    }
  }

  isPlaying = true;
  createCursor(container);
  scheduleAnimationLoop();
}

export function stopPlayback() {
  isPlaying = false;

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  for (const src of scheduledSources) {
    try { src.stop(); } catch (_) {}
  }
  scheduledSources = [];

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  removeCursor();
  timeline = [];
}

export function setCursorPosition(x, y, height) {
  if (!cursorEl) return;
  cursorEl.style.left = x + 'px';
  cursorEl.style.top = y + 'px';
  cursorEl.style.height = height + 'px';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function playTone(frequency, startTime, duration, gain) {
  if (!audioContext) return;

  const osc = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, startTime);

  // ADSR envelope
  const { attack, decay, sustain, release } = ENVELOPE;
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + attack);
  gainNode.gain.linearRampToValueAtTime(gain * sustain, startTime + attack + decay);
  gainNode.gain.setValueAtTime(gain * sustain, startTime + duration);
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration + release);

  osc.connect(gainNode);
  gainNode.connect(audioContext.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + release + 0.05);

  scheduledSources.push(osc);
}

export function buildTimeline(score) {
  const events = [];
  const secondsPerBeat = 60 / score.tempo;

  for (let si = 0; si < score.staves.length; si++) {
    const stave = score.staves[si];
    let time = 0;

    for (let mi = 0; mi < stave.measures.length; mi++) {
      const measure = stave.measures[mi];

      for (let ni = 0; ni < measure.notes.length; ni++) {
        const note = measure.notes[ni];
        const beatDuration = DURATION_VALUES[note.duration] || 1;
        const durationSeconds = beatDuration * secondsPerBeat;

        const frequencies = [];
        if (note.type !== 'rest') {
          for (const key of note.keys) {
            const midi = keyToMidi(key);
            frequencies.push(midiToFrequency(midi));
          }
        }

        events.push({
          time,
          duration: durationSeconds,
          frequencies,
          dynamics: note.dynamics || 'mf',
          staffIndex: si,
          measureIndex: mi,
          noteIndex: ni,
        });

        time += durationSeconds;
      }
    }
  }

  events.sort((a, b) => a.time - b.time || a.staffIndex - b.staffIndex);
  return events;
}

function createCursor(container) {
  removeCursor();
  cursorEl = document.createElement('div');
  cursorEl.className = 'playback-cursor';
  cursorEl.style.position = 'absolute';
  cursorEl.style.top = '0px';
  cursorEl.style.left = '0px';
  cursorEl.style.width = '2px';
  cursorEl.style.height = '100px';
  cursorEl.style.pointerEvents = 'none';
  cursorEl.style.zIndex = '10';

  // Make container relatively positioned so cursor is positioned inside it
  const containerStyle = window.getComputedStyle(container);
  if (containerStyle.position === 'static') {
    container.style.position = 'relative';
  }

  container.appendChild(cursorEl);
}

function removeCursor() {
  if (cursorEl && cursorEl.parentNode) {
    cursorEl.parentNode.removeChild(cursorEl);
  }
  cursorEl = null;
}

function scheduleAnimationLoop() {
  function loop() {
    if (!isPlaying) return;

    const elapsed = (performance.now() - performanceStartTime) / 1000;

    if (elapsed >= totalDuration) {
      isPlaying = false;
      removeCursor();
      if (onEndCallback) onEndCallback();
      return;
    }

    // Find the event currently playing (last event whose start time <= elapsed)
    let currentEvent = null;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].time <= elapsed) {
        currentEvent = timeline[i];
        break;
      }
    }

    if (currentEvent && onProgressCallback) {
      const progress = totalDuration > 0 ? elapsed / totalDuration : 0;
      onProgressCallback(progress, currentEvent);
    }

    animationFrameId = requestAnimationFrame(loop);
  }

  animationFrameId = requestAnimationFrame(loop);
}
