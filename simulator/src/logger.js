/**
 * JSONL logger for the simulator, same line format as the app (shared/log/format.js).
 * One file per run: simulator/logs/<ISO timestamp>.jsonl
 */
const fs = require('fs');
const path = require('path');
const { log, bytes: B } = require('@rowrace/shared');

class JsonlLogger {
  /** @param {{ dir?: string, enabled?: boolean, now?: () => number }} [opts] */
  constructor(opts = {}) {
    this.now = opts.now || Date.now;
    this.stream = null;
    this.file = null;
    if (opts.enabled === false) return;
    const dir = opts.dir || path.join(__dirname, '..', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
    this.file = path.join(dir, `${stamp}.jsonl`);
    this.stream = fs.createWriteStream(this.file, { flags: 'a' });
  }

  write(type, fields) {
    if (this.stream) this.stream.write(log.makeLine(type, fields, this.now()) + '\n');
  }

  meta(fields) {
    this.write('meta', { app: 'pm5-simulator', ...fields });
  }

  /** @param {'notify'|'read'|'write'} dir @param {string} char "0x0031" */
  packet(dir, char, bytes, decoded, malformed) {
    const fields = { dir, char, hex: B.toHex(bytes) };
    if (decoded)
      fields.decoded = decoded.ok ? stripHex(decoded) : { ok: false, error: decoded.error };
    if (malformed) fields.malformed = true;
    this.write('packet', fields);
  }

  event(event, fields = {}) {
    this.write('ble', { event, ...fields });
  }

  close() {
    return new Promise((resolve) => (this.stream ? this.stream.end(resolve) : resolve()));
  }
}

/** The hex is already on the line; don't repeat it inside `decoded`. */
function stripHex(d) {
  const { hex: _hex, ...rest } = d;
  return rest;
}

module.exports = { JsonlLogger };
