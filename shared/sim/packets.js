/**
 * Turns a RowerModel snapshot into PM5 notifications, using the same encoders the app's
 * decoders are tested against.
 */
const E = require('../pm5/encode');
const { SHORT } = require('../pm5/uuids');

/** Status characteristics, sent every sample-rate tick. */
const STATUS_CHARS = [SHORT.GENERAL_STATUS, SHORT.ADDITIONAL_STATUS_1, SHORT.ADDITIONAL_STATUS_2];
/** Stroke characteristics, sent once per stroke (end of the drive). */
const STROKE_CHARS = [SHORT.STROKE_DATA, SHORT.ADDITIONAL_STROKE_DATA];

const SNAPSHOT_KEY = {
  [SHORT.GENERAL_STATUS]: 'generalStatus',
  [SHORT.ADDITIONAL_STATUS_1]: 'additionalStatus1',
  [SHORT.ADDITIONAL_STATUS_2]: 'additionalStatus2',
  [SHORT.STROKE_DATA]: 'strokeData',
  [SHORT.ADDITIONAL_STROKE_DATA]: 'additionalStrokeData',
};

/** Multiplexed ID for each individual characteristic (0x0031 → 0x31). */
const MUX_ID = (shortId) => shortId & 0xff;

/**
 * @param {number} shortId characteristic to build
 * @param {object} snapshot RowerModel.snapshot()
 * @returns {Uint8Array | null} null when there is nothing to send yet (no stroke so far)
 */
function buildPacket(shortId, snapshot) {
  const values = snapshot[SNAPSHOT_KEY[shortId]];
  if (!values) return null;
  return E.encodeCharacteristic(shortId, values);
}

/** Same data in the 0x0080 multiplexed form (ID byte + multiplexed layout). */
function buildMuxPacket(shortId, snapshot) {
  const values = snapshot[SNAPSHOT_KEY[shortId]];
  if (!values) return null;
  return E.encodeMultiplexed(MUX_ID(shortId), values);
}

/**
 * Corrupts a packet the way a flaky link would: wrong (shorter) length.
 * @param {Uint8Array} bytes @param {() => number} rand
 */
function malform(bytes, rand = Math.random) {
  const len = Math.floor(rand() * Math.max(1, bytes.length - 1));
  return bytes.slice(0, len);
}

module.exports = {
  STATUS_CHARS,
  STROKE_CHARS,
  SNAPSHOT_KEY,
  MUX_ID,
  buildPacket,
  buildMuxPacket,
  malform,
};
