/**
 * Byte layouts of the PM5 rowing notifications, taken from the spec
 * ("Smart Bluetooth" Table 14 and "C2 Multiplexed Information: Data Definitions" Table 15).
 *
 * A field is [name, sizeInBytes, divisor]. The decoder computes raw / divisor, the
 * encoder computes round(value * divisor), so both directions share one definition.
 * `minLength` lets a decoder accept older/shorter firmware variants; fields that end
 * past the received length come back as `undefined`.
 *
 * See docs/PROTOCOL_NOTES.md for where the spec differs from the original brief.
 */

/** @typedef {[string, number, number?]} Field */
/** @typedef {{ name: string, length: number, minLength: number, fields: Field[] }} Layout */

/** @param {string} name @param {Field[]} fields @param {number} [minLength] @returns {Layout} */
function layout(name, fields, minLength) {
  const length = fields.reduce((n, f) => n + f[1], 0);
  return Object.freeze({ name, length, minLength: minLength ?? length, fields });
}

const ELAPSED = ['elapsed', 3, 100]; // 0.01 s → s

/** 0x0031 C2 rowing general status (19 bytes). Same layout when multiplexed (ID 0x31). */
const GENERAL_STATUS = layout('generalStatus', [
  ELAPSED,
  ['distance', 3, 10], // 0.1 m → m
  ['workoutType', 1],
  ['intervalType', 1],
  ['workoutState', 1],
  ['rowingState', 1],
  ['strokeState', 1],
  ['totalWorkDistance', 3], // m
  ['workoutDurationRaw', 3], // 0.01 s when duration type is time, else m / cal / watt-min
  ['workoutDurationType', 1],
  ['dragFactor', 1],
]);

const STATUS_1_HEAD = [
  ELAPSED,
  ['speed', 2, 1000], // 0.001 m/s → m/s
  ['strokeRate', 1], // spm
  ['heartRateRaw', 1], // bpm, 255 = invalid
  ['currentPaceRaw', 2, 100], // 0.01 s/500 m → s
  ['averagePaceRaw', 2, 100],
  ['restDistance', 2], // m
  ['restTime', 3, 100], // 0.01 s → s
];

/** 0x0032 C2 rowing additional status 1 (17 bytes). */
const ADDITIONAL_STATUS_1 = layout('additionalStatus1', [...STATUS_1_HEAD, ['ergMachineType', 1]]);

/** Multiplexed 0x32 (19 bytes): average power is inserted before the erg machine type. */
const MUX_ADDITIONAL_STATUS_1 = layout('additionalStatus1', [
  ...STATUS_1_HEAD,
  ['averagePower', 2], // W
  ['ergMachineType', 1],
]);

const STATUS_2_TAIL = [
  ['totalCalories', 2], // cal
  ['splitAvgPaceRaw', 2, 100], // 0.01 s → s
  ['splitAvgPower', 2], // W
  ['splitAvgCalories', 2], // cal/hr
  ['lastSplitTime', 3, 10], // 0.1 s → s
  ['lastSplitDistance', 3], // m
];

/** 0x0033 C2 rowing additional status 2 (20 bytes). */
const ADDITIONAL_STATUS_2 = layout('additionalStatus2', [
  ELAPSED,
  ['intervalCount', 1],
  ['averagePower', 2], // W
  ...STATUS_2_TAIL,
]);

/** Multiplexed 0x33 (18 bytes): no average power (it moved to multiplexed 0x32). */
const MUX_ADDITIONAL_STATUS_2 = layout('additionalStatus2', [
  ELAPSED,
  ['intervalCount', 1],
  ...STATUS_2_TAIL,
]);

const STROKE_HEAD = [
  ELAPSED,
  ['distance', 3, 10], // 0.1 m → m
  ['driveLength', 1, 100], // 0.01 m → m
  ['driveTime', 1, 100], // 0.01 s → s
  ['recoveryTime', 2, 100], // 0.01 s → s
  ['strokeDistance', 2, 100], // 0.01 m → m
  ['peakDriveForce', 2, 10], // 0.1 lbf → lbf
  ['averageDriveForce', 2, 10], // 0.1 lbf → lbf
];

/** 0x0035 C2 rowing stroke data (20 bytes). */
const STROKE_DATA = layout('strokeData', [
  ...STROKE_HEAD,
  ['workPerStroke', 2, 10], // 0.1 J → J
  ['strokeCount', 2],
]);

/** Multiplexed 0x35 (18 bytes): no work per stroke (it moved to multiplexed 0x36). */
const MUX_STROKE_DATA = layout('strokeData', [...STROKE_HEAD, ['strokeCount', 2]]);

const STROKE_2_HEAD = [
  ELAPSED,
  ['strokePower', 2], // W
  ['strokeCalories', 2], // cal/hr
  ['strokeCount', 2],
  ['projectedWorkTime', 3], // s
  ['projectedWorkDistance', 3], // m
];

/**
 * 0x0036 C2 rowing additional stroke data. The spec lists 18 bytes (a trailing
 * "Projected Work Other" 24-bit field); the brief listed 15. Accept both.
 */
const ADDITIONAL_STROKE_DATA = layout(
  'additionalStrokeData',
  [...STROKE_2_HEAD, ['projectedWorkOther', 3]],
  15,
);

/** Multiplexed 0x36 (17 bytes): work per stroke appended. */
const MUX_ADDITIONAL_STROKE_DATA = layout('additionalStrokeData', [
  ...STROKE_2_HEAD,
  ['workPerStroke', 2, 10],
]);

/** Layouts per individual characteristic short ID. */
const BY_CHARACTERISTIC = Object.freeze({
  0x0031: GENERAL_STATUS,
  0x0032: ADDITIONAL_STATUS_1,
  0x0033: ADDITIONAL_STATUS_2,
  0x0035: STROKE_DATA,
  0x0036: ADDITIONAL_STROKE_DATA,
});

/** Layouts per multiplexed ID (first byte of a 0x0080 notification). */
const BY_MUX_ID = Object.freeze({
  0x31: GENERAL_STATUS,
  0x32: MUX_ADDITIONAL_STATUS_1,
  0x33: MUX_ADDITIONAL_STATUS_2,
  0x35: MUX_STROKE_DATA,
  0x36: MUX_ADDITIONAL_STROKE_DATA,
});

module.exports = {
  GENERAL_STATUS,
  ADDITIONAL_STATUS_1,
  MUX_ADDITIONAL_STATUS_1,
  ADDITIONAL_STATUS_2,
  MUX_ADDITIONAL_STATUS_2,
  STROKE_DATA,
  MUX_STROKE_DATA,
  ADDITIONAL_STROKE_DATA,
  MUX_ADDITIONAL_STROKE_DATA,
  BY_CHARACTERISTIC,
  BY_MUX_ID,
};
