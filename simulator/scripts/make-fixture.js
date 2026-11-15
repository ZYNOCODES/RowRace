#!/usr/bin/env node
/**
 * Writes a deterministic replay fixture (no Bluetooth needed):
 *   node simulator/scripts/make-fixture.js [out.jsonl] [seconds] [scenario]
 * Default: app/assets/fixtures/demo-session.jsonl, 60 s, steady, 250 ms sample rate.
 */
const fs = require('fs');
const path = require('path');
const { log, bytes: B, shortIdLabel } = require('@rowrace/shared');
const { SimulatorCore } = require('../src/core');

const out = process.argv[2] || path.join(__dirname, '../../app/assets/fixtures/demo-session.jsonl');
const seconds = Number(process.argv[3] || 60);
const scenario = process.argv[4] || 'steady';

let t = Date.UTC(2026, 0, 1, 12, 0, 0);
const lines = [log.makeLine('meta', { app: 'pm5-simulator', fixture: true, scenario, seconds }, t)];
const core = new SimulatorCore({ pace: 125, spm: 24, scenario, sampleRate: 2, seed: 7 });
core.attach({ isSubscribed: (id) => id !== 0x80, notify() {}, disconnect() {} });
core.on('packet', ({ shortId, bytes }) =>
  lines.push(
    log.makeLine('packet', { dir: 'notify', char: shortIdLabel(shortId), hex: B.toHex(bytes) }, t),
  ),
);
for (let i = 0; i < seconds * 20; i++) {
  core.tick(50);
  t += 50;
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`wrote ${lines.length} lines to ${out}`);
