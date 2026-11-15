/**
 * CSAFE framing (spec "Frame Structure", "Frame Contents", Tables 5–9).
 *
 * Standard frame: F1 | contents | checksum | F2
 * Extended frame: F0 | dest | src | contents | checksum | F2
 * Contents, addresses and checksum are byte-stuffed (F0..F3 → F3 00..03).
 * Checksum = XOR of the unstuffed contents (addresses excluded).
 *
 * Implemented: framing, stuffing, checksum, command/response packing.
 * TODO (not needed by the MVP): splitting frames > 20 bytes across several BLE writes,
 * and the PM proprietary command sets behind the 0x76/0x77/0x7E/0x7F wrappers.
 */

const FLAG = Object.freeze({ EXTENDED_START: 0xf0, STANDARD_START: 0xf1, STOP: 0xf2, STUFF: 0xf3 });

const MAX_FRAME_BYTES = 120;
const MIN_INTERFRAME_GAP_MS = 50;

/** Selected public commands (spec "Public CSAFE"). */
const CMD = Object.freeze({
  GETSTATUS: 0x80,
  RESET: 0x81,
  GOIDLE: 0x82,
  GOHAVEID: 0x83,
  GOINUSE: 0x85,
  GOFINISHED: 0x86,
  GOREADY: 0x87,
  GETVERSION: 0x91,
  SETUSERCFG1: 0x1a,
  SETPMCFG: 0x76,
  SETPMDATA: 0x77,
  GETPMCFG: 0x7e,
  GETPMDATA: 0x7f,
});

/** Status byte state-machine values (Table 9). */
const STATE = Object.freeze({
  ERROR: 0x00,
  READY: 0x01,
  IDLE: 0x02,
  HAVE_ID: 0x03,
  IN_USE: 0x05,
  PAUSE: 0x06,
  FINISH: 0x07,
  MANUAL: 0x08,
  OFFLINE: 0x09,
});

const PREV_FRAME_STATUS = Object.freeze({ OK: 0x00, REJECT: 0x10, BAD: 0x20, NOT_READY: 0x30 });

/** @param {ArrayLike<number>} bytes */
function checksum(bytes) {
  let c = 0;
  for (let i = 0; i < bytes.length; i++) c ^= bytes[i] & 0xff;
  return c;
}

/** @param {ArrayLike<number>} bytes @returns {number[]} */
function stuff(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    if (b >= 0xf0 && b <= 0xf3) out.push(FLAG.STUFF, b - 0xf0);
    else out.push(b);
  }
  return out;
}

/** @param {ArrayLike<number>} bytes @returns {number[] | null} null on a bad escape */
function unstuff(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    if (b === FLAG.STUFF) {
      const next = bytes[++i];
      if (next === undefined || next > 3) return null;
      out.push(0xf0 + next);
    } else {
      out.push(b);
    }
  }
  return out;
}

/**
 * @param {ArrayLike<number>} contents frame contents (commands or a response)
 * @param {{ dest?: number, src?: number }} [ext] pass both for an extended frame
 * @returns {Uint8Array}
 */
function buildFrame(contents, ext) {
  const body = Array.from(contents, (b) => b & 0xff);
  const cs = checksum(body);
  const isExt = ext && ext.dest !== undefined && ext.src !== undefined;
  const addr = isExt ? [ext.dest & 0xff, ext.src & 0xff] : [];
  const frame = [
    isExt ? FLAG.EXTENDED_START : FLAG.STANDARD_START,
    ...stuff(addr),
    ...stuff(body),
    ...stuff([cs]),
    FLAG.STOP,
  ];
  return Uint8Array.from(frame);
}

/**
 * Parses one frame. Leading bytes before a start flag are ignored (resync).
 * @param {ArrayLike<number>} bytes
 * @returns {{ ok: true, extended: boolean, dest?: number, src?: number, contents: number[] }
 *   | { ok: false, error: string }}
 */
function parseFrame(bytes) {
  const arr = Array.from(bytes || [], (b) => b & 0xff);
  const start = arr.findIndex((b) => b === FLAG.STANDARD_START || b === FLAG.EXTENDED_START);
  if (start < 0) return { ok: false, error: 'no start flag' };
  const stop = arr.indexOf(FLAG.STOP, start + 1);
  if (stop < 0) return { ok: false, error: 'no stop flag' };
  const extended = arr[start] === FLAG.EXTENDED_START;
  const raw = unstuff(arr.slice(start + 1, stop));
  if (!raw) return { ok: false, error: 'bad byte stuffing' };
  const head = extended ? 2 : 0;
  if (raw.length < head + 1) return { ok: false, error: 'frame too short' };
  const contents = raw.slice(head, raw.length - 1);
  if (checksum(contents) !== raw[raw.length - 1]) return { ok: false, error: 'bad checksum' };
  return extended
    ? { ok: true, extended, dest: raw[0], src: raw[1], contents }
    : { ok: true, extended, contents };
}

/**
 * Packs one command. Short commands (≥ 0x80) carry no data; long ones carry a byte count.
 * @param {number} cmd @param {ArrayLike<number>} [data]
 * @returns {number[]}
 */
function command(cmd, data = []) {
  if (cmd >= 0x80) return [cmd];
  return [cmd, data.length, ...Array.from(data, (b) => b & 0xff)];
}

/**
 * Splits frame contents into commands (the PM's view of an incoming frame).
 * @param {ArrayLike<number>} contents
 * @returns {{ cmd: number, data: number[] }[] | null} null when a long command is truncated
 */
function parseCommands(contents) {
  const out = [];
  for (let i = 0; i < contents.length;) {
    const cmd = contents[i++];
    if (cmd >= 0x80) {
      out.push({ cmd, data: [] });
      continue;
    }
    const n = contents[i++];
    if (n === undefined || i + n > contents.length) return null;
    out.push({ cmd, data: Array.from(contents).slice(i, i + n) });
    i += n;
  }
  return out;
}

/**
 * Builds response contents: status byte then [cmd, count, data…] per answered command.
 * @param {{ toggle?: boolean, prevStatus?: number, state?: number }} status
 * @param {{ cmd: number, data?: ArrayLike<number> }[]} responses
 */
function buildResponseContents(status, responses = []) {
  const s =
    (status.toggle ? 0x80 : 0) | ((status.prevStatus ?? 0) & 0x30) | ((status.state ?? 0) & 0x0f);
  const out = [s];
  for (const r of responses) {
    const data = Array.from(r.data || [], (b) => b & 0xff);
    out.push(r.cmd & 0xff, data.length, ...data);
  }
  return out;
}

/**
 * @param {ArrayLike<number>} contents response frame contents
 * @returns {{ toggle: boolean, prevStatus: number, state: number,
 *   responses: { cmd: number, data: number[] }[] } | null}
 */
function parseResponseContents(contents) {
  if (!contents || contents.length < 1) return null;
  const s = contents[0];
  const responses = [];
  for (let i = 1; i < contents.length;) {
    const cmd = contents[i];
    const n = contents[i + 1];
    if (n === undefined || i + 2 + n > contents.length) return null;
    responses.push({ cmd, data: Array.from(contents).slice(i + 2, i + 2 + n) });
    i += 2 + n;
  }
  return { toggle: (s & 0x80) !== 0, prevStatus: s & 0x30, state: s & 0x0f, responses };
}

module.exports = {
  FLAG,
  CMD,
  STATE,
  PREV_FRAME_STATUS,
  MAX_FRAME_BYTES,
  MIN_INTERFRAME_GAP_MS,
  checksum,
  stuff,
  unstuff,
  buildFrame,
  parseFrame,
  command,
  parseCommands,
  buildResponseContents,
  parseResponseContents,
};
