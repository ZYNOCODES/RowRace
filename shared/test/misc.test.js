const { pm5Uuid, shortIdFromUuid, shortIdLabel, UUID } = require('../pm5/uuids');
const { ErgMachineType, WorkoutState, ergFamily } = require('../pm5/enums');
const bytes = require('../pm5/bytes');
const physics = require('../physics');
const { formatPace, formatTime, parseTime, formatDistance } = require('../format');
const shared = require('..');

describe('uuids', () => {
  test('builds the 128-bit UUID from the spec base', () => {
    expect(pm5Uuid(0x0031)).toBe('ce060031-43e5-11e4-916c-0800200c9a66');
    expect(UUID.ROWING_SERVICE).toBe('ce060030-43e5-11e4-916c-0800200c9a66');
  });
  test('short id round-trip and labels', () => {
    expect(shortIdFromUuid('CE060080-43E5-11E4-916C-0800200C9A66')).toBe(0x0080);
    expect(shortIdFromUuid('0000180a-0000-1000-8000-00805f9b34fb')).toBeNull();
    expect(shortIdLabel(0x31)).toBe('0x0031');
  });
});

describe('enums', () => {
  test('labels', () => {
    expect(WorkoutState.label(WorkoutState.WORKOUTROW)).toBe('Workout row');
    expect(ErgMachineType.label(250)).toBe('Unknown (250)');
  });
  test('erg family', () => {
    expect(ergFamily(ErgMachineType.STATIC_D)).toBe('rower');
    expect(ergFamily(ErgMachineType.STATIC_SKI)).toBe('ski');
    expect(ergFamily(ErgMachineType.BIKE)).toBe('bike');
    expect(ergFamily(ErgMachineType.MULTIERG_ROW)).toBe('rower');
  });
});

describe('bytes', () => {
  test('base64 round-trip, any length', () => {
    for (let n = 0; n < 25; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
      expect(Array.from(bytes.base64ToBytes(bytes.bytesToBase64(b)))).toEqual(Array.from(b));
    }
    expect(bytes.bytesToBase64([0xfb, 0xff])).toBe(Buffer.from([0xfb, 0xff]).toString('base64'));
  });
  test('hex round-trip', () => {
    expect(Array.from(bytes.fromHex('00 ff 1a'))).toEqual([0, 255, 26]);
    expect(bytes.toHex([0, 255, 26])).toBe('00ff1a');
  });
});

describe('physics (Concept2 formulas)', () => {
  test('2:00/500m ≈ 202.5 W', () => {
    expect(physics.wattsFromPace(120)).toBeCloseTo(202.5, 1);
  });
  test('pace ↔ watts ↔ speed are inverse', () => {
    expect(physics.paceFromWatts(physics.wattsFromPace(105))).toBeCloseTo(105, 6);
    expect(physics.wattsFromSpeed(physics.speedFromPace(130))).toBeCloseTo(
      physics.wattsFromPace(130),
      6,
    );
  });
  test('zero speed is safe', () => {
    expect(physics.paceFromSpeed(0)).toBeNull();
    expect(physics.speedFromPace(null)).toBe(0);
    expect(physics.wattsFromPace(0)).toBe(0);
    expect(physics.paceFromWatts(0)).toBeNull();
  });
  test('calories per hour', () => {
    expect(physics.caloriesPerHourFromWatts(0)).toBe(300);
    expect(physics.caloriesPerHourFromPace(120)).toBeCloseTo(202.5 * 4 * 0.8604 + 300, 0);
  });
});

describe('format', () => {
  test('pace and time', () => {
    expect(formatPace(125.36)).toBe('2:05');
    expect(formatPace(125.36, { tenths: true })).toBe('2:05.3');
    expect(formatPace(null)).toBe('--:--');
    expect(formatTime(3725)).toBe('1:02:05');
  });
  test('parse', () => {
    expect(parseTime('2:05')).toBe(125);
    expect(parseTime('1:02:03')).toBe(3723);
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
  test('distance', () => {
    expect(formatDistance(850.7)).toBe('850 m');
    expect(formatDistance(1250)).toBe('1.25 km');
  });
});

test('package index exposes the public API', () => {
  expect(typeof shared.decodeGeneralStatus).toBe('function');
  expect(typeof shared.encodeMultiplexed).toBe('function');
  expect(shared.constants.APP_NAME).toBe('RowRace 3D');
  expect(typeof shared.csafe.buildFrame).toBe('function');
});
