#!/usr/bin/env node
/** Synthesizes the start horn (original sound, no third-party audio): app/assets/sounds/horn.wav */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RATE = 22050;
const SECONDS = 0.9;
const n = Math.floor(RATE * SECONDS);
const pcm = new Int16Array(n);
const partials = [
  [233, 0.55],
  [466, 0.3],
  [699, 0.18],
  [932, 0.08],
];
for (let i = 0; i < n; i++) {
  const t = i / RATE;
  const attack = Math.min(1, t / 0.03);
  const release = Math.min(1, (SECONDS - t) / 0.15);
  const vibrato = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t);
  let s = 0;
  for (const [f, a] of partials) s += a * Math.sin(2 * Math.PI * f * vibrato * t);
  pcm[i] = Math.round(Math.tanh(s * 1.4) * 0.8 * attack * release * 32767);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + n * 2, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(n * 2, 40);
const out = path.join(ROOT, 'app/assets/sounds/horn.wav');
fs.writeFileSync(out, Buffer.concat([header, Buffer.from(pcm.buffer)]));
console.log(`wrote ${out}`);
