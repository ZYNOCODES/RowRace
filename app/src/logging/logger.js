/**
 * Session logger: JSONL lines (shared/log/format.js), one file per app session,
 * `session-<ISO>.jsonl`, buffered in memory and flushed every second, on app background,
 * and on demand. Keeps the last 20 files; a file over 10 MB rolls over to `…-part2.jsonl`.
 *
 * Storage is injected (logStorage.js on device, an in-memory fake in tests), so the
 * logger never blocks the UI thread: every write is one async append of the whole buffer.
 */
import { log } from '@rowrace/shared';
import { realClock } from '../lib/clock';

export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FLUSH_EVERY_MS = 1000;
/** Hard cap on unflushed lines (a stuck storage must not eat the heap). */
const MAX_BUFFERED_LINES = 20000;

/**
 * @typedef {Object} LogStorage
 * @property {() => Promise<void>} ensureDir
 * @property {() => Promise<{ name: string, size: number, modified: number }[]>} list
 * @property {(name: string, text: string) => Promise<void>} append
 * @property {(name: string) => Promise<void>} remove
 * @property {(name: string) => Promise<string>} read
 */

const fileStamp = (ms) => new Date(ms).toISOString().replace(/[:.]/g, '-');

export class SessionLogger {
  /** @param {{ storage: LogStorage, clock?: import('../lib/clock').Clock, onError?: (e: any) => void }} opts */
  constructor({ storage, clock, onError }) {
    this.storage = storage;
    this.clock = clock || realClock;
    this.onError = onError || (() => {});
    this.buffer = [];
    this.timer = null;
    this.flushing = null;
    this.file = null;
    this.part = 1;
    this.fileBytes = 0;
    this.dropped = 0;
    this.meta = {};
  }

  /** Opens a new session file and writes the `meta` line. */
  async start(meta = {}) {
    this.meta = meta;
    await this.storage.ensureDir();
    this.base = `session-${fileStamp(this.clock.now())}`;
    this.part = 1;
    this.file = `${this.base}.jsonl`;
    this.fileBytes = 0;
    this.write('meta', meta);
    if (this.timer == null) this.timer = this.clock.setInterval(() => this.flush(), FLUSH_EVERY_MS);
    await this.rotate();
  }

  /** "Start test recording": close this file and start a fresh one with the same meta. */
  async restart(extraMeta = {}) {
    await this.flush();
    await this.start({ ...this.meta, ...extraMeta });
  }

  async stop() {
    if (this.timer != null) this.clock.clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }

  // ---- line types ----

  write(type, fields) {
    if (!this.file) return;
    if (this.buffer.length >= MAX_BUFFERED_LINES) {
      this.dropped += 1;
      return;
    }
    this.buffer.push(log.makeLine(type, fields, this.clock.now()));
  }

  /** @param {'notify'|'read'|'write'} dir @param {string} char @param {string} hex */
  packet(dir, char, hex, decoded) {
    const fields = { dir, char, hex };
    if (decoded)
      fields.decoded = decoded.ok ? withoutHex(decoded) : { ok: false, error: decoded.error };
    this.write('packet', fields);
  }

  ble(event, fields = {}) {
    this.write('ble', { event, ...fields });
  }

  race(event, fields = {}) {
    this.write('race', { event, ...fields });
  }

  ui(screen, fields = {}) {
    this.write('ui', { screen, ...fields });
  }

  note(text) {
    this.write('note', { text });
  }

  error(message, fields = {}) {
    const err = message instanceof Error ? message : null;
    this.write('error', {
      message: err ? err.message : String(message),
      stack: err?.stack,
      ...fields,
    });
  }

  // ---- persistence ----

  /** Appends everything buffered. Concurrent calls share one in-flight write. */
  flush() {
    if (this.flushing)
      return this.flushing.then(() => (this.buffer.length ? this.flush() : undefined));
    if (!this.file || this.buffer.length === 0) return Promise.resolve();
    const lines = this.buffer.splice(0);
    if (this.dropped) {
      lines.push(
        log.makeLine(
          'error',
          { message: `logger dropped ${this.dropped} lines` },
          this.clock.now(),
        ),
      );
      this.dropped = 0;
    }
    const text = lines.join('\n') + '\n';
    this.flushing = (async () => {
      try {
        if (this.fileBytes > 0 && this.fileBytes + text.length > MAX_FILE_BYTES) {
          this.part += 1;
          this.file = `${this.base}-part${this.part}.jsonl`;
          this.fileBytes = 0;
          await this.rotate();
        }
        await this.storage.append(this.file, text);
        this.fileBytes += text.length;
      } catch (e) {
        this.onError(e);
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  /** Deletes the oldest files beyond MAX_FILES (never the current one). */
  async rotate() {
    try {
      const files = (await this.storage.list())
        .filter((f) => f.name.endsWith('.jsonl') && f.name !== this.file)
        .sort((a, b) => b.name.localeCompare(a.name));
      for (const f of files.slice(MAX_FILES - 1)) await this.storage.remove(f.name);
    } catch (e) {
      this.onError(e);
    }
  }

  /** @returns {Promise<{ name: string, size: number, modified: number, current: boolean }[]>} newest first */
  async listFiles() {
    await this.flush();
    const files = await this.storage.list();
    return files
      .filter((f) => f.name.endsWith('.jsonl'))
      .sort((a, b) => b.name.localeCompare(a.name))
      .map((f) => ({ ...f, current: f.name === this.file }));
  }

  /** Deletes every log except the current session (which is truncated to a fresh start). */
  async clear() {
    await this.flush();
    for (const f of await this.storage.list()) await this.storage.remove(f.name);
    await this.start(this.meta);
  }
}

function withoutHex(d) {
  const { hex: _hex, ...rest } = d;
  return rest;
}
