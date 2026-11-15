/**
 * Minimal ZIP writer (STORE method, no compression) in pure JS, for "Share logs".
 * JSONL logs are small enough that compression isn't worth a native dependency.
 * Format: PKWARE APPNOTE 6.3.x local headers + central directory + end record.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {string} s */
export function utf8(s) {
  return new TextEncoder().encode(s);
}

/** MS-DOS date/time fields. */
function dosTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * @param {{ name: string, data: Uint8Array | string }[]} files
 * @param {Date} [date]
 * @returns {Uint8Array}
 */
export function createZip(files, date = new Date()) {
  const { time, day } = dosTime(date);
  const entries = files.map((f) => {
    const data = typeof f.data === 'string' ? utf8(f.data) : f.data;
    return { name: utf8(f.name), data, crc: crc32(data) };
  });

  let localSize = 0;
  for (const e of entries) localSize += 30 + e.name.length + e.data.length;
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v) => {
    view.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v) => {
    view.setUint32(p, v >>> 0, true);
    p += 4;
  };
  const bytes = (b) => {
    out.set(b, p);
    p += b.length;
  };

  const offsets = [];
  for (const e of entries) {
    offsets.push(p);
    u32(0x04034b50); // local file header
    u16(20); // version needed
    u16(0x0800); // flags: UTF-8 names
    u16(0); // method: store
    u16(time);
    u16(day);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0);
    bytes(e.name);
    bytes(e.data);
  }

  const centralStart = p;
  entries.forEach((e, i) => {
    u32(0x02014b50); // central directory header
    u16(20); // made by
    u16(20); // needed
    u16(0x0800);
    u16(0);
    u16(time);
    u16(day);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attrs
    u32(0); // external attrs
    u32(offsets[i]);
    bytes(e.name);
  });

  const centralLength = p - centralStart;
  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(centralLength);
  u32(centralStart);
  u16(0);
  return out;
}
