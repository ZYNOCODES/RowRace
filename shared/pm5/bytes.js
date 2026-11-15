/**
 * Little-endian byte helpers. PM5 Smart Bluetooth fields are always Lo, Mid, Hi.
 * Works with Uint8Array, Buffer or plain number[].
 */

/** @param {ArrayLike<number>} bytes @param {number} offset @param {number} size */
function readUIntLE(bytes, offset, size) {
  let value = 0;
  for (let i = size - 1; i >= 0; i--) value = value * 256 + (bytes[offset + i] & 0xff);
  return value;
}

/** Writes `value` (clamped to the field range) into `out` at `offset`. */
function writeUIntLE(out, offset, size, value) {
  const max = 2 ** (8 * size) - 1;
  let v = Math.min(max, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
  for (let i = 0; i < size; i++) {
    out[offset + i] = v & 0xff;
    v = Math.floor(v / 256);
  }
}

/** @param {ArrayLike<number>} bytes */
function toHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] & 0xff).toString(16).padStart(2, '0');
  return s;
}

/** @param {string} hex e.g. "0a1bff" or "0a 1b ff" */
function fromHex(hex) {
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62;
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

/** Pure-JS base64 decode (react-native-ble-plx hands values over as base64). */
function base64ToBytes(b64) {
  const s = String(b64 || '').replace(/[^A-Za-z0-9+/\-_]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64_LOOKUP[s.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** @param {ArrayLike<number>} bytes */
function bytesToBase64(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

/** True for anything we can index as bytes. */
function isByteLike(x) {
  return x != null && typeof x === 'object' && typeof x.length === 'number';
}

/** Decodes a fixed-length ASCII string, dropping NUL padding. */
function readAscii(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i] & 0xff;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

/** Encodes `text` as ASCII bytes; when `size` is given, pads with NUL / truncates. */
function writeAscii(text, size) {
  const str = String(text ?? '');
  const len = size ?? str.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < Math.min(len, str.length); i++) out[i] = str.charCodeAt(i) & 0x7f;
  return out;
}

module.exports = {
  readUIntLE,
  writeUIntLE,
  toHex,
  fromHex,
  base64ToBytes,
  bytesToBase64,
  isByteLike,
  readAscii,
  writeAscii,
};
