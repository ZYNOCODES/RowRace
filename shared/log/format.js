/**
 * JSONL log line format shared by the app logger and the PC simulator, so a client log can
 * be replayed by the simulator and a simulator log can be replayed by the app.
 *
 * Every line: { v, t, type, ... } where `t` is epoch milliseconds.
 *   meta    { app, version, build, device, os, source, ... }
 *   ble     { event, ... }                     scan / connect / mtu / read / write / error …
 *   packet  { dir: 'notify'|'read'|'write', char: '0x0031', hex, decoded? }
 *           `dir` is the GATT operation, so app and simulator logs read the same way:
 *           notify/read = PM5 → app, write = app → PM5.
 *   race    { event, ... }
 *   ui      { screen, ... }
 *   note    { text }                           "Mark event" from the Diagnostics screen
 *   error   { message, stack? }
 */
const { LOG_FORMAT_VERSION } = require('../constants');

/** @param {string} type @param {object} fields @param {number} [t] */
function makeLine(type, fields, t = Date.now()) {
  return JSON.stringify({ v: LOG_FORMAT_VERSION, t, type, ...fields });
}

/**
 * @param {string} line
 * @returns {object | null} null for blank or unparseable lines (logs may be truncated)
 */
function parseLine(line) {
  const s = String(line).trim();
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === 'object' && typeof obj.type === 'string' ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Packet lines from a whole log, in file order, with `char` parsed to a number.
 * @param {string} text JSONL contents
 * @returns {{ t: number, shortId: number, hex: string, dir: 'notify'|'read'|'write' }[]}
 */
function extractPackets(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const o = parseLine(line);
    if (!o || o.type !== 'packet' || typeof o.hex !== 'string') continue;
    const shortId = parseInt(String(o.char), 16);
    if (!Number.isFinite(shortId) || !Number.isFinite(o.t)) continue;
    out.push({ t: o.t, shortId, hex: o.hex, dir: o.dir || 'notify' });
  }
  return out;
}

module.exports = { makeLine, parseLine, extractPackets };
