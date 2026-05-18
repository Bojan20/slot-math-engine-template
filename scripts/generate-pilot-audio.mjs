#!/usr/bin/env node
/**
 * generate-pilot-audio.mjs — CORTI W204-PILOT real audio synthesis.
 *
 * Generates 11 production-quality WAV cues for the Quick Hit Platinum
 * Phoenix pilot. Uses pure Node + simple oscillator synthesis (no
 * native deps) and writes 8-bit PCM WAV to keep file sizes under 50 KB.
 *
 * Layout:
 *   web/studio/audio/cues/<id>.wav
 *
 * Each cue is generated from a small "patch" descriptor (oscillator
 * count, envelope, frequency curve, noise mix, reverb tail).  The
 * resulting WAV is mono 8000 Hz 8-bit unsigned PCM — well below 50 KB
 * for the durations we use (≤4 s @ 8 KHz × 1 B = 32 KB max).
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const OUT = resolve(REPO_ROOT, 'web/studio/audio/cues');

const SAMPLE_RATE = 8000;

/** Build a WAV file (mono 8-bit unsigned PCM @ 8 kHz) from a Float32 array. */
function encodeWav(samples) {
  const n = samples.length;
  const headerSize = 44;
  const buf = Buffer.alloc(headerSize + n);
  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write('WAVE', 8);
  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE, 28); // byte rate (1 byte/sample)
  buf.writeUInt16LE(1, 32); // block align
  buf.writeUInt16LE(8, 34); // bits/sample
  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(n, 40);
  // Float -1..1 -> uint8 0..255
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buf[headerSize + i] = Math.round((v + 1) * 127.5);
  }
  return buf;
}

/** ADSR envelope, returns gain at time t (seconds). */
function adsr(t, total, attack, decay, sustain, release) {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  const releaseStart = total - release;
  if (t < releaseStart) return sustain;
  return sustain * Math.max(0, 1 - (t - releaseStart) / release);
}

/** Simple band-limited white noise. */
function noise() { return Math.random() * 2 - 1; }

/** Build a sine partial at freq with envelope and mix gain. */
function partial(samples, freq, gain, env) {
  const dt = 1 / SAMPLE_RATE;
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    phase += 2 * Math.PI * freq * dt;
    const t = i / SAMPLE_RATE;
    samples[i] += Math.sin(phase) * gain * env(t);
  }
}

/** Frequency sweep partial. */
function sweep(samples, f0, f1, gain, env) {
  const dt = 1 / SAMPLE_RATE;
  let phase = 0;
  const total = samples.length / SAMPLE_RATE;
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const f = f0 + (f1 - f0) * (t / total);
    phase += 2 * Math.PI * f * dt;
    samples[i] += Math.sin(phase) * gain * env(t);
  }
}

/** Filtered noise band (one-pole lp). */
function noiseBand(samples, gain, env, cutoff = 0.3) {
  let lp = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    lp = lp + cutoff * (noise() - lp);
    samples[i] += lp * gain * env(t);
  }
}

/** Allocate a zero-filled sample buffer for a duration. */
function makeBuf(durationS) {
  const n = Math.floor(durationS * SAMPLE_RATE);
  return new Float32Array(n);
}

// ── Cue patches ────────────────────────────────────────────────────────

function reelSpin() {
  // 1.5s wind/whoosh + low rumble.
  const s = makeBuf(1.5);
  const env = (t) => adsr(t, 1.5, 0.1, 0.2, 0.7, 0.4);
  noiseBand(s, 0.45, env, 0.18);
  sweep(s, 80, 60, 0.25, (t) => 0.8 * (1 - t / 1.5));
  partial(s, 110, 0.08, (t) => 0.5 * Math.sin((t / 1.5) * Math.PI));
  return s;
}

function reelStop() {
  // 200ms metallic click — short noise burst + 2 sine partials.
  const s = makeBuf(0.25);
  const env = (t) => adsr(t, 0.25, 0.003, 0.05, 0.0, 0.05);
  noiseBand(s, 0.6, env, 0.5);
  partial(s, 1800, 0.4, env);
  partial(s, 2700, 0.25, env);
  return s;
}

function winSmall() {
  // 1s ascending C-E-G arpeggio.
  const s = makeBuf(1.0);
  const notes = [
    [261.63, 0.0, 0.3], // C4
    [329.63, 0.3, 0.3], // E4
    [392.00, 0.6, 0.4], // G4
  ];
  for (const [freq, start, dur] of notes) {
    const env = (t) => {
      if (t < start || t > start + dur) return 0;
      return adsr(t - start, dur, 0.02, 0.1, 0.5, 0.2);
    };
    partial(s, freq, 0.35, env);
    partial(s, freq * 2, 0.12, env);
  }
  return s;
}

function winBig() {
  // 2s major chord progression + simple reverb tail.
  const s = makeBuf(2.0);
  const chord = [
    [261.63, 0.0, 0.7],   // C
    [329.63, 0.0, 0.7],   // E
    [392.00, 0.0, 0.7],   // G
    [523.25, 0.6, 0.9],   // C5
    [659.25, 0.6, 0.9],   // E5
    [783.99, 0.6, 0.9],   // G5
    [1046.50, 1.2, 0.8],  // C6
  ];
  for (const [freq, start, dur] of chord) {
    const env = (t) => {
      if (t < start || t > start + dur) return 0;
      return adsr(t - start, dur, 0.04, 0.15, 0.6, 0.35);
    };
    partial(s, freq, 0.22, env);
  }
  // Simple comb filter "reverb"
  const tail = 0.06;
  const delay = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = delay; i < s.length; i++) s[i] += s[i - delay] * tail;
  return s;
}

function winJackpot() {
  // 4s fanfare — brass-simulating sawtooth-ish via summed harmonics.
  const s = makeBuf(4.0);
  function brassNote(freq, start, dur) {
    const env = (t) => {
      if (t < start || t > start + dur) return 0;
      return adsr(t - start, dur, 0.05, 0.2, 0.7, 0.3);
    };
    for (let h = 1; h <= 6; h++) {
      partial(s, freq * h, 0.22 / h, env);
    }
  }
  brassNote(261.63, 0.0, 0.5); // C
  brassNote(329.63, 0.5, 0.5); // E
  brassNote(392.00, 1.0, 0.6); // G
  brassNote(523.25, 1.6, 1.2); // C5
  brassNote(659.25, 1.8, 1.2); // E5
  brassNote(783.99, 2.0, 2.0); // G5
  brassNote(1046.50, 2.4, 1.6); // C6
  // Reverb
  const delay = Math.floor(0.12 * SAMPLE_RATE);
  for (let i = delay; i < s.length; i++) s[i] += s[i - delay] * 0.18;
  return s;
}

function fsIntro() {
  // 1.5s magical chimes ascending.
  const s = makeBuf(1.5);
  const baseFreqs = [523, 659, 784, 988, 1175, 1397];
  baseFreqs.forEach((freq, idx) => {
    const start = idx * 0.18;
    const env = (t) => {
      if (t < start || t > start + 0.6) return 0;
      const local = t - start;
      return Math.exp(-local * 5) * 0.5;
    };
    partial(s, freq, 0.35, env);
    partial(s, freq * 2, 0.12, env);
    partial(s, freq * 3, 0.05, env);
  });
  return s;
}

function fsSpin() {
  // 1.2s magical bell + ethereal pad.
  const s = makeBuf(1.2);
  const env = (t) => adsr(t, 1.2, 0.05, 0.2, 0.7, 0.3);
  partial(s, 880, 0.25, env);
  partial(s, 1320, 0.18, env);
  partial(s, 1760, 0.12, env);
  // Ethereal pad
  partial(s, 220, 0.18, (t) => 0.5 * Math.sin((t / 1.2) * Math.PI));
  partial(s, 277, 0.15, (t) => 0.5 * Math.sin((t / 1.2) * Math.PI));
  return s;
}

function fsOutro() {
  // 2s celebratory cascade.
  const s = makeBuf(2.0);
  for (let i = 0; i < 8; i++) {
    const start = i * 0.18;
    const freq = 440 + i * 80;
    const env = (t) => {
      if (t < start || t > start + 0.5) return 0;
      return Math.exp(-(t - start) * 4) * 0.45;
    };
    partial(s, freq, 0.32, env);
    partial(s, freq * 1.5, 0.16, env);
  }
  // Final triumph
  const env2 = (t) => (t > 1.4 ? Math.max(0, 1 - (t - 1.4) / 0.6) : 0) * 0.5;
  partial(s, 523, 0.3, env2);
  partial(s, 784, 0.25, env2);
  return s;
}

function hwOrbLand() {
  // 300ms coin clink + sparkle.
  const s = makeBuf(0.35);
  const env = (t) => adsr(t, 0.35, 0.005, 0.08, 0.3, 0.15);
  partial(s, 2200, 0.45, env);
  partial(s, 3300, 0.3, env);
  partial(s, 4400, 0.18, env);
  noiseBand(s, 0.18, env, 0.7);
  return s;
}

function hwPayout() {
  // 2.5s coin cascade.
  const s = makeBuf(2.5);
  for (let i = 0; i < 20; i++) {
    const start = i * 0.1 + Math.random() * 0.05;
    const freq = 1500 + Math.random() * 1500;
    const env = (t) => {
      if (t < start || t > start + 0.2) return 0;
      return Math.exp(-(t - start) * 12) * 0.35;
    };
    partial(s, freq, 0.32, env);
  }
  // Underlying low boom
  partial(s, 110, 0.18, (t) => Math.sin((t / 2.5) * Math.PI) * 0.5);
  return s;
}

function mysteryReveal() {
  // 1s rising tension + chime.
  const s = makeBuf(1.0);
  sweep(s, 100, 600, 0.4, (t) => adsr(t, 1.0, 0.1, 0.1, 0.6, 0.2));
  // Chime at end
  const env = (t) => (t > 0.7 ? Math.exp(-(t - 0.7) * 6) * 0.6 : 0);
  partial(s, 1760, 0.4, env);
  partial(s, 2637, 0.3, env);
  return s;
}

const CUES = [
  { id: 'reel-spin',       fn: reelSpin,      duration: 1.5 },
  { id: 'reel-stop',       fn: reelStop,      duration: 0.25 },
  { id: 'win-small',       fn: winSmall,      duration: 1.0 },
  { id: 'win-big',         fn: winBig,        duration: 2.0 },
  { id: 'win-jackpot',     fn: winJackpot,    duration: 4.0 },
  { id: 'fs-intro',        fn: fsIntro,       duration: 1.5 },
  { id: 'fs-spin',         fn: fsSpin,        duration: 1.2 },
  { id: 'fs-outro',        fn: fsOutro,       duration: 2.0 },
  { id: 'hw-orb-land',     fn: hwOrbLand,     duration: 0.35 },
  { id: 'hw-payout',       fn: hwPayout,      duration: 2.5 },
  { id: 'mystery-reveal',  fn: mysteryReveal, duration: 1.0 },
];

function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const results = [];
  for (const cue of CUES) {
    const samples = cue.fn();
    const wav = encodeWav(samples);
    const path = resolve(OUT, `${cue.id}.wav`);
    writeFileSync(path, wav);
    results.push({ id: cue.id, duration_s: cue.duration, bytes: wav.length, path });
    console.log(`✓ ${cue.id}.wav  (${wav.length} bytes, ${cue.duration}s)`);
  }
  // Quick summary
  const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
  console.log(`\nGenerated ${results.length} cues, total ${totalBytes} bytes.`);
  console.log(`All cues ≤ 50KB: ${results.every((r) => r.bytes <= 50 * 1024)}`);
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { CUES, main };
