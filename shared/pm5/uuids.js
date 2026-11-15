/**
 * PM5 Smart Bluetooth UUIDs.
 * Base: CE06XXXX-43E5-11E4-916C-0800200C9A66 (spec "Smart Bluetooth", Table 14).
 * Lowercase, because react-native-ble-plx and bleno both report UUIDs in lowercase.
 */

const BASE_SUFFIX = '-43e5-11e4-916c-0800200c9a66';

/** @param {number} shortId e.g. 0x0031 → "ce060031-43e5-11e4-916c-0800200c9a66" */
function pm5Uuid(shortId) {
  return `ce06${shortId.toString(16).padStart(4, '0')}${BASE_SUFFIX}`;
}

/** "ce060031-43e5-…" or "CE060031…" → 0x0031; returns null for non-PM5 UUIDs. */
function shortIdFromUuid(uuid) {
  const u = String(uuid || '').toLowerCase();
  const compact = u.replace(/-/g, '');
  if (
    compact.length === 32 &&
    compact.startsWith('ce06') &&
    compact.endsWith('43e511e4916c0800200c9a66')
  ) {
    return parseInt(compact.slice(4, 8), 16);
  }
  return null;
}

/** @param {number} shortId → "0x0031" */
function shortIdLabel(shortId) {
  return `0x${shortId.toString(16).padStart(4, '0')}`;
}

const SHORT = Object.freeze({
  DEVICE_INFO_SERVICE: 0x0010,
  MODEL_NUMBER: 0x0011,
  SERIAL_NUMBER: 0x0012,
  HARDWARE_REVISION: 0x0013,
  FIRMWARE_REVISION: 0x0014,
  MANUFACTURER_NAME: 0x0015,
  ERG_MACHINE_TYPE: 0x0016,

  CONTROL_SERVICE: 0x0020,
  CONTROL_RECEIVE: 0x0021,
  CONTROL_TRANSMIT: 0x0022,

  ROWING_SERVICE: 0x0030,
  GENERAL_STATUS: 0x0031,
  ADDITIONAL_STATUS_1: 0x0032,
  ADDITIONAL_STATUS_2: 0x0033,
  SAMPLE_RATE: 0x0034,
  STROKE_DATA: 0x0035,
  ADDITIONAL_STROKE_DATA: 0x0036,
  MULTIPLEXED: 0x0080,
});

const UUID = Object.freeze(
  Object.fromEntries(Object.entries(SHORT).map(([k, v]) => [k, pm5Uuid(v)])),
);

/** Characteristics the app subscribes to, in subscription order. */
const NOTIFY_CHARACTERISTICS = Object.freeze([
  SHORT.GENERAL_STATUS,
  SHORT.ADDITIONAL_STATUS_1,
  SHORT.ADDITIONAL_STATUS_2,
  SHORT.STROKE_DATA,
  SHORT.ADDITIONAL_STROKE_DATA,
]);

const DEVICE_NAME_PREFIX = 'PM5';

module.exports = {
  pm5Uuid,
  shortIdFromUuid,
  shortIdLabel,
  SHORT,
  UUID,
  NOTIFY_CHARACTERISTICS,
  DEVICE_NAME_PREFIX,
};
