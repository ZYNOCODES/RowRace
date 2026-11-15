/**
 * PM5 notification decoders. Pure functions, never throw: a bad packet returns
 * `{ ok: false, error, hex }` so the BLE hot path can log it and move on.
 * Output units are SI (s, m, m/s, W) plus a few derived fields.
 */
const { readUIntLE, toHex, isByteLike, readAscii } = require('./bytes');
const L = require('./layouts');
const { WorkoutDurationType } = require('./enums');
const { SHORT, shortIdLabel } = require('./uuids');

/** @typedef {{ ok: true, type: string, hex: string, [k: string]: any }} DecodedOk */
/** @typedef {{ ok: false, type?: string, error: string, hex: string }} DecodedError */
/** @typedef {DecodedOk | DecodedError} Decoded */

/**
 * @param {import('./layouts').Layout} lay
 * @param {ArrayLike<number>} bytes
 * @param {number} [offset]
 * @returns {Decoded}
 */
function decodeLayout(lay, bytes, offset = 0) {
  if (!isByteLike(bytes)) return { ok: false, type: lay.name, error: 'not a byte array', hex: '' };
  const hex = toHex(bytes);
  const available = bytes.length - offset;
  if (available < lay.minLength) {
    return {
      ok: false,
      type: lay.name,
      error: `${lay.name}: expected ${lay.minLength} bytes, got ${available}`,
      hex,
    };
  }
  /** @type {DecodedOk} */
  const out = { ok: true, type: lay.name, hex };
  let pos = offset;
  for (const [name, size, div = 1] of lay.fields) {
    if (pos + size - offset > available) break;
    out[name] = readUIntLE(bytes, pos, size) / div;
    pos += size;
  }
  return out;
}

/** 0 or missing pace means "no pace" on the PM5. */
const paceOrNull = (raw) => (raw > 0 ? raw : null);

function finishGeneralStatus(d) {
  if (!d.ok) return d;
  const raw = d.workoutDurationRaw;
  d.workoutDuration = d.workoutDurationType === WorkoutDurationType.TIME ? raw / 100 : raw;
  delete d.workoutDurationRaw;
  return d;
}

function finishAdditionalStatus1(d) {
  if (!d.ok) return d;
  // 255 is the spec's "invalid"; 0 is never a real heart rate either.
  d.heartRate = d.heartRateRaw === 255 || d.heartRateRaw === 0 ? null : d.heartRateRaw;
  d.speedKmh = d.speed * 3.6;
  d.currentPace = d.speed > 0 ? paceOrNull(d.currentPaceRaw) : null;
  d.paceSecPer500 = d.currentPace;
  d.averagePace = paceOrNull(d.averagePaceRaw);
  delete d.heartRateRaw;
  delete d.currentPaceRaw;
  delete d.averagePaceRaw;
  return d;
}

function finishAdditionalStatus2(d) {
  if (!d.ok) return d;
  d.splitAvgPace = paceOrNull(d.splitAvgPaceRaw);
  delete d.splitAvgPaceRaw;
  return d;
}

const identity = (d) => d;

/** @param {ArrayLike<number>} bytes */
const decodeGeneralStatus = (bytes) => finishGeneralStatus(decodeLayout(L.GENERAL_STATUS, bytes));
/** @param {ArrayLike<number>} bytes */
const decodeAdditionalStatus1 = (bytes) =>
  finishAdditionalStatus1(decodeLayout(L.ADDITIONAL_STATUS_1, bytes));
/** @param {ArrayLike<number>} bytes */
const decodeAdditionalStatus2 = (bytes) =>
  finishAdditionalStatus2(decodeLayout(L.ADDITIONAL_STATUS_2, bytes));
/** @param {ArrayLike<number>} bytes */
const decodeStrokeData = (bytes) => decodeLayout(L.STROKE_DATA, bytes);
/** @param {ArrayLike<number>} bytes */
const decodeAdditionalStrokeData = (bytes) => decodeLayout(L.ADDITIONAL_STROKE_DATA, bytes);

const MUX_FINISHERS = {
  0x31: finishGeneralStatus,
  0x32: finishAdditionalStatus1,
  0x33: finishAdditionalStatus2,
  0x35: identity,
  0x36: identity,
};

/**
 * 0x0080 multiplexed notification: byte 0 is the data ID, the rest is that ID's payload.
 * Only the IDs the app uses are decoded; others return ok:false with `unsupported`.
 * @param {ArrayLike<number>} bytes
 * @returns {Decoded & { muxId?: number }}
 */
function decodeMultiplexed(bytes) {
  if (!isByteLike(bytes) || bytes.length < 1) {
    return { ok: false, type: 'multiplexed', error: 'multiplexed: empty packet', hex: '' };
  }
  const id = bytes[0] & 0xff;
  const lay = L.BY_MUX_ID[id];
  if (!lay) {
    return {
      ok: false,
      type: 'multiplexed',
      muxId: id,
      unsupported: true,
      error: `multiplexed: unsupported id 0x${id.toString(16)}`,
      hex: toHex(bytes),
    };
  }
  const d = MUX_FINISHERS[id](decodeLayout(lay, bytes, 1));
  d.muxId = id;
  return d;
}

/**
 * Device Information characteristics (0x0011–0x0016).
 * @param {number} shortId
 * @param {ArrayLike<number>} bytes
 * @returns {Decoded}
 */
function decodeDeviceInfo(shortId, bytes) {
  if (!isByteLike(bytes))
    return { ok: false, type: 'deviceInfo', error: 'not a byte array', hex: '' };
  const hex = toHex(bytes);
  const fieldByShortId = {
    [SHORT.MODEL_NUMBER]: 'modelNumber',
    [SHORT.SERIAL_NUMBER]: 'serialNumber',
    [SHORT.HARDWARE_REVISION]: 'hardwareRevision',
    [SHORT.FIRMWARE_REVISION]: 'firmwareRevision',
    [SHORT.MANUFACTURER_NAME]: 'manufacturerName',
  };
  if (shortId === SHORT.ERG_MACHINE_TYPE) {
    if (bytes.length < 1) return { ok: false, type: 'deviceInfo', error: 'erg type: empty', hex };
    return { ok: true, type: 'deviceInfo', field: 'ergMachineType', value: bytes[0] & 0xff, hex };
  }
  const field = fieldByShortId[shortId];
  if (!field) {
    return {
      ok: false,
      type: 'deviceInfo',
      error: `not a device info id: ${shortIdLabel(shortId)}`,
      hex,
    };
  }
  return { ok: true, type: 'deviceInfo', field, value: readAscii(bytes), hex };
}

/** @returns {number | null} sample-rate enum (0..3) from a 0x0034 read. */
function decodeSampleRate(bytes) {
  if (!isByteLike(bytes) || bytes.length < 1) return null;
  const v = bytes[0] & 0xff;
  return v <= 3 ? v : null;
}

const BY_SHORT_ID = {
  [SHORT.GENERAL_STATUS]: decodeGeneralStatus,
  [SHORT.ADDITIONAL_STATUS_1]: decodeAdditionalStatus1,
  [SHORT.ADDITIONAL_STATUS_2]: decodeAdditionalStatus2,
  [SHORT.STROKE_DATA]: decodeStrokeData,
  [SHORT.ADDITIONAL_STROKE_DATA]: decodeAdditionalStrokeData,
  [SHORT.MULTIPLEXED]: decodeMultiplexed,
};

/**
 * Decodes any rowing-service notification by characteristic short ID.
 * @param {number} shortId e.g. 0x0031
 * @param {ArrayLike<number>} bytes
 * @returns {Decoded}
 */
function decodeCharacteristic(shortId, bytes) {
  const fn = BY_SHORT_ID[shortId];
  if (fn) return fn(bytes);
  if (shortId >= SHORT.MODEL_NUMBER && shortId <= SHORT.ERG_MACHINE_TYPE) {
    return decodeDeviceInfo(shortId, bytes);
  }
  return {
    ok: false,
    error: `no decoder for ${shortIdLabel(shortId)}`,
    hex: isByteLike(bytes) ? toHex(bytes) : '',
  };
}

module.exports = {
  decodeGeneralStatus,
  decodeAdditionalStatus1,
  decodeAdditionalStatus2,
  decodeStrokeData,
  decodeAdditionalStrokeData,
  decodeMultiplexed,
  decodeDeviceInfo,
  decodeSampleRate,
  decodeCharacteristic,
};
