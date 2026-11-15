/**
 * PM5 notification encoders: the exact inverse of decode.js. Used by the PC simulator
 * and the in-app mock, so both exercise the same parsing path as a real PM5.
 * Inputs use the decoder's field names and SI units. Out-of-range values are clamped
 * to the field size; missing values encode as 0.
 */
const { writeUIntLE, writeAscii } = require('./bytes');
const L = require('./layouts');
const { WorkoutDurationType } = require('./enums');
const { SHORT } = require('./uuids');

/**
 * @param {import('./layouts').Layout} lay
 * @param {Record<string, number>} values
 * @param {number} [prefixByte] multiplexed ID written before the payload
 * @returns {Uint8Array}
 */
function encodeLayout(lay, values, prefixByte) {
  const head = prefixByte === undefined ? 0 : 1;
  const out = new Uint8Array(lay.length + head);
  if (head) out[0] = prefixByte;
  let pos = head;
  for (const [name, size, div = 1] of lay.fields) {
    writeUIntLE(out, pos, size, (Number(values[name]) || 0) * div);
    pos += size;
  }
  return out;
}

const pace = (v) => (v == null || !Number.isFinite(v) ? 0 : v);

function prepGeneralStatus(v) {
  const isTime = (v.workoutDurationType ?? 0) === WorkoutDurationType.TIME;
  const d = Number(v.workoutDuration) || 0;
  return { ...v, workoutDurationRaw: isTime ? Math.round(d * 100) : d };
}

function prepAdditionalStatus1(v) {
  return {
    ...v,
    heartRateRaw: v.heartRate == null ? 255 : v.heartRate,
    currentPaceRaw: pace(v.currentPace ?? v.paceSecPer500),
    averagePaceRaw: pace(v.averagePace),
  };
}

function prepAdditionalStatus2(v) {
  return { ...v, splitAvgPaceRaw: pace(v.splitAvgPace) };
}

const same = (v) => v;

/** @param {object} v */
const encodeGeneralStatus = (v) => encodeLayout(L.GENERAL_STATUS, prepGeneralStatus(v));
/** @param {object} v */
const encodeAdditionalStatus1 = (v) =>
  encodeLayout(L.ADDITIONAL_STATUS_1, prepAdditionalStatus1(v));
/** @param {object} v */
const encodeAdditionalStatus2 = (v) =>
  encodeLayout(L.ADDITIONAL_STATUS_2, prepAdditionalStatus2(v));
/** @param {object} v */
const encodeStrokeData = (v) => encodeLayout(L.STROKE_DATA, v);
/** @param {object} v */
const encodeAdditionalStrokeData = (v) => encodeLayout(L.ADDITIONAL_STROKE_DATA, v);

const MUX_PREP = {
  0x31: prepGeneralStatus,
  0x32: prepAdditionalStatus1,
  0x33: prepAdditionalStatus2,
  0x35: same,
  0x36: same,
};

/**
 * Builds a 0x0080 multiplexed notification for one of the supported IDs.
 * @param {number} muxId 0x31 | 0x32 | 0x33 | 0x35 | 0x36
 * @param {object} v
 */
function encodeMultiplexed(muxId, v) {
  const lay = L.BY_MUX_ID[muxId];
  if (!lay) throw new Error(`encodeMultiplexed: unsupported id 0x${muxId.toString(16)}`);
  return encodeLayout(lay, MUX_PREP[muxId](v), muxId);
}

/** Fixed sizes from the spec's attribute table (strings are NUL padded). */
const DEVICE_INFO_SIZES = {
  [SHORT.MODEL_NUMBER]: 16,
  [SHORT.SERIAL_NUMBER]: 9,
  [SHORT.HARDWARE_REVISION]: 3,
  [SHORT.FIRMWARE_REVISION]: 20,
  [SHORT.MANUFACTURER_NAME]: 16,
};

/**
 * @param {number} shortId 0x0011–0x0016
 * @param {string|number} value string, or the erg machine type number for 0x0016
 */
function encodeDeviceInfo(shortId, value) {
  if (shortId === SHORT.ERG_MACHINE_TYPE) return Uint8Array.of(Number(value) & 0xff);
  const size = DEVICE_INFO_SIZES[shortId];
  if (!size) throw new Error(`encodeDeviceInfo: not a device info id 0x${shortId.toString(16)}`);
  return writeAscii(value, size);
}

const BY_SHORT_ID = {
  [SHORT.GENERAL_STATUS]: encodeGeneralStatus,
  [SHORT.ADDITIONAL_STATUS_1]: encodeAdditionalStatus1,
  [SHORT.ADDITIONAL_STATUS_2]: encodeAdditionalStatus2,
  [SHORT.STROKE_DATA]: encodeStrokeData,
  [SHORT.ADDITIONAL_STROKE_DATA]: encodeAdditionalStrokeData,
};

/** @param {number} shortId @param {object} values */
function encodeCharacteristic(shortId, values) {
  const fn = BY_SHORT_ID[shortId];
  if (!fn) throw new Error(`encodeCharacteristic: no encoder for 0x${shortId.toString(16)}`);
  return fn(values);
}

module.exports = {
  encodeGeneralStatus,
  encodeAdditionalStatus1,
  encodeAdditionalStatus2,
  encodeStrokeData,
  encodeAdditionalStrokeData,
  encodeMultiplexed,
  encodeDeviceInfo,
  encodeCharacteristic,
};
