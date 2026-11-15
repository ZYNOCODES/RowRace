const E = require('../pm5/encode');
const D = require('../pm5/decode');
const L = require('../pm5/layouts');
const { WorkoutDurationType, StrokeState } = require('../pm5/enums');

const MAX24 = 0xffffff;
const MAX16 = 0xffff;

/** Expects every key of `expected` to be close to the decoded value. */
function expectClose(decoded, expected) {
  expect(decoded.ok).toBe(true);
  for (const [k, v] of Object.entries(expected)) {
    if (v === null) expect(decoded[k]).toBeNull();
    else expect(decoded[k]).toBeCloseTo(v, 3);
  }
}

describe('0x0031 general status', () => {
  const typical = {
    elapsed: 123.45,
    distance: 456.7,
    workoutType: 3,
    intervalType: 1,
    workoutState: 1,
    rowingState: 1,
    strokeState: StrokeState.DRIVING,
    totalWorkDistance: 2000,
    workoutDuration: 2000,
    workoutDurationType: WorkoutDurationType.DISTANCE,
    dragFactor: 120,
  };

  test('typical values', () => {
    const bytes = E.encodeGeneralStatus(typical);
    expect(bytes).toHaveLength(19);
    expectClose(D.decodeGeneralStatus(bytes), typical);
  });

  test('time-based duration uses 0.01 s', () => {
    const v = {
      ...typical,
      workoutDuration: 1800.5,
      workoutDurationType: WorkoutDurationType.TIME,
    };
    expectClose(D.decodeGeneralStatus(E.encodeGeneralStatus(v)), v);
  });

  test('zero and 24-bit max', () => {
    expectClose(D.decodeGeneralStatus(E.encodeGeneralStatus({})), { elapsed: 0, distance: 0 });
    const max = { elapsed: MAX24 / 100, distance: MAX24 / 10, totalWorkDistance: MAX24 };
    expectClose(D.decodeGeneralStatus(E.encodeGeneralStatus(max)), max);
  });

  test('values above the field range are clamped, not wrapped', () => {
    const d = D.decodeGeneralStatus(E.encodeGeneralStatus({ elapsed: 1e9, dragFactor: 999 }));
    expect(d.elapsed).toBeCloseTo(MAX24 / 100);
    expect(d.dragFactor).toBe(255);
  });

  test('little-endian byte order', () => {
    const bytes = E.encodeGeneralStatus({ elapsed: 0x010203 / 100 });
    expect(Array.from(bytes.slice(0, 3))).toEqual([0x03, 0x02, 0x01]);
  });
});

describe('0x0032 additional status 1', () => {
  test('typical values with derived fields', () => {
    const v = {
      elapsed: 60,
      speed: 4.0,
      strokeRate: 26,
      heartRate: 152,
      currentPace: 125,
      averagePace: 127.5,
      restDistance: 0,
      restTime: 0,
      ergMachineType: 0,
    };
    const bytes = E.encodeAdditionalStatus1(v);
    expect(bytes).toHaveLength(17);
    const d = D.decodeAdditionalStatus1(bytes);
    expectClose(d, v);
    expect(d.speedKmh).toBeCloseTo(14.4);
    expect(d.paceSecPer500).toBeCloseTo(125);
  });

  test('speed 0 gives null pace, never Infinity/NaN', () => {
    const d = D.decodeAdditionalStatus1(E.encodeAdditionalStatus1({ speed: 0, currentPace: 125 }));
    expect(d.currentPace).toBeNull();
    expect(d.paceSecPer500).toBeNull();
    expect(d.speedKmh).toBe(0);
  });

  test('heart rate 255 decodes to null, null encodes to 255', () => {
    const bytes = E.encodeAdditionalStatus1({ heartRate: null });
    expect(bytes[6]).toBe(255);
    expect(D.decodeAdditionalStatus1(bytes).heartRate).toBeNull();
  });

  test('16-bit max speed and pace', () => {
    const v = { speed: MAX16 / 1000, currentPace: MAX16 / 100, averagePace: MAX16 / 100 };
    expectClose(D.decodeAdditionalStatus1(E.encodeAdditionalStatus1(v)), v);
  });
});

describe('0x0033 additional status 2', () => {
  test('typical and limits', () => {
    const v = {
      elapsed: 300.25,
      intervalCount: 2,
      averagePower: 210,
      totalCalories: 75,
      splitAvgPace: 122.3,
      splitAvgPower: 215,
      splitAvgCalories: 1020,
      lastSplitTime: 125.4,
      lastSplitDistance: 500,
    };
    const bytes = E.encodeAdditionalStatus2(v);
    expect(bytes).toHaveLength(20);
    expectClose(D.decodeAdditionalStatus2(bytes), v);
    const max = { lastSplitTime: MAX24 / 10, lastSplitDistance: MAX24 };
    expectClose(D.decodeAdditionalStatus2(E.encodeAdditionalStatus2(max)), max);
    expect(D.decodeAdditionalStatus2(E.encodeAdditionalStatus2({})).splitAvgPace).toBeNull();
  });
});

describe('0x0035 stroke data', () => {
  test('typical and limits', () => {
    const v = {
      elapsed: 61.2,
      distance: 250.3,
      driveLength: 1.42,
      driveTime: 0.82,
      recoveryTime: 1.55,
      strokeDistance: 9.87,
      peakDriveForce: 180.5,
      averageDriveForce: 110.2,
      workPerStroke: 520.4,
      strokeCount: 31,
    };
    const bytes = E.encodeStrokeData(v);
    expect(bytes).toHaveLength(20);
    expectClose(D.decodeStrokeData(bytes), v);
    const max = { driveLength: 2.55, driveTime: 2.55, recoveryTime: 655.35, strokeCount: MAX16 };
    expectClose(D.decodeStrokeData(E.encodeStrokeData(max)), max);
  });
});

describe('0x0036 additional stroke data', () => {
  const v = {
    elapsed: 61.3,
    strokePower: 230,
    strokeCalories: 1090,
    strokeCount: 31,
    projectedWorkTime: 480,
    projectedWorkDistance: 2000,
    projectedWorkOther: 7,
  };

  test('18-byte spec layout round-trips', () => {
    const bytes = E.encodeAdditionalStrokeData(v);
    expect(bytes).toHaveLength(18);
    expectClose(D.decodeAdditionalStrokeData(bytes), v);
  });

  test('15-byte variant (no projected-other) is accepted', () => {
    const bytes = E.encodeAdditionalStrokeData(v).slice(0, 15);
    const d = D.decodeAdditionalStrokeData(bytes);
    expect(d.ok).toBe(true);
    expect(d.projectedWorkDistance).toBe(2000);
    expect(d.projectedWorkOther).toBeUndefined();
  });
});

describe('0x0080 multiplexed', () => {
  const cases = [
    [0x31, L.GENERAL_STATUS, { elapsed: 10.5, distance: 40.2, strokeState: 4, dragFactor: 110 }],
    [
      0x32,
      L.MUX_ADDITIONAL_STATUS_1,
      { speed: 4.1, strokeRate: 24, averagePower: 200, ergMachineType: 5 },
    ],
    [
      0x33,
      L.MUX_ADDITIONAL_STATUS_2,
      { intervalCount: 1, totalCalories: 30, lastSplitDistance: 500 },
    ],
    [0x35, L.MUX_STROKE_DATA, { distance: 99.9, driveTime: 0.8, strokeCount: 12 }],
    [0x36, L.MUX_ADDITIONAL_STROKE_DATA, { strokePower: 190, workPerStroke: 480.5 }],
  ];

  test.each(cases)('id 0x%s round-trips with the multiplexed layout', (id, lay, v) => {
    const bytes = E.encodeMultiplexed(id, v);
    expect(bytes[0]).toBe(id);
    expect(bytes).toHaveLength(lay.length + 1);
    const d = D.decodeMultiplexed(bytes);
    expect(d.muxId).toBe(id);
    expectClose(d, v);
  });

  test('multiplexed 0x32 is 19 bytes (adds average power)', () => {
    expect(L.MUX_ADDITIONAL_STATUS_1.length).toBe(19);
  });

  test('unsupported ids are reported, not thrown', () => {
    const d = D.decodeMultiplexed([0x37, 1, 2, 3]);
    expect(d.ok).toBe(false);
    expect(d.unsupported).toBe(true);
  });
});

describe('device info', () => {
  test('strings are NUL padded and trimmed', () => {
    const bytes = E.encodeDeviceInfo(0x0012, '430000001');
    expect(bytes).toHaveLength(9);
    expect(D.decodeDeviceInfo(0x0012, bytes)).toMatchObject({
      ok: true,
      field: 'serialNumber',
      value: '430000001',
    });
    const model = E.encodeDeviceInfo(0x0011, 'PM5');
    expect(model).toHaveLength(16);
    expect(D.decodeDeviceInfo(0x0011, model).value).toBe('PM5');
  });

  test('erg machine type', () => {
    expect(D.decodeDeviceInfo(0x0016, E.encodeDeviceInfo(0x0016, 128))).toMatchObject({
      field: 'ergMachineType',
      value: 128,
    });
  });
});

test('decodeCharacteristic dispatches by short id', () => {
  const bytes = E.encodeCharacteristic(0x0035, { strokeCount: 5 });
  expect(D.decodeCharacteristic(0x0035, bytes)).toMatchObject({
    ok: true,
    type: 'strokeData',
    strokeCount: 5,
  });
  expect(D.decodeCharacteristic(0x0099, [1]).ok).toBe(false);
});
