/**
 * Checks the simulator's GATT table against the spec (Table 14), using a fake bleno so it
 * runs without Bluetooth hardware.
 */
const { Pm5Peripheral } = require('./peripheral');
const { CsafeHandler } = require('./csafeHandler');
const { parseArgs } = require('./cli');
const { pm5Uuid, decodeDeviceInfo, csafe } = require('@rowrace/shared');

class FakeCharacteristic {
  constructor(o) {
    Object.assign(this, o);
    this.uuid = o.uuid.replace(/-/g, '');
  }
}
FakeCharacteristic.RESULT_SUCCESS = 0;
FakeCharacteristic.RESULT_INVALID_OFFSET = 7;
FakeCharacteristic.RESULT_INVALID_ATTRIBUTE_LENGTH = 0x0d;
FakeCharacteristic.RESULT_UNLIKELY_ERROR = 0x0e;
class FakeService {
  constructor(o) {
    Object.assign(this, o);
    this.uuid = o.uuid.replace(/-/g, '');
  }
}
const fakeBleno = { Characteristic: FakeCharacteristic, PrimaryService: FakeService };

const id = (n) => pm5Uuid(n).replace(/-/g, '');

/** Spec Table 14, restricted to what the brief requires. */
const SPEC = {
  [id(0x10)]: {
    [id(0x11)]: ['read'],
    [id(0x12)]: ['read'],
    [id(0x13)]: ['read'],
    [id(0x14)]: ['read'],
    [id(0x15)]: ['read'],
    [id(0x16)]: ['read'],
  },
  [id(0x20)]: {
    [id(0x21)]: ['write'],
    [id(0x22)]: ['read'],
  },
  [id(0x30)]: {
    [id(0x31)]: ['notify'],
    [id(0x32)]: ['notify'],
    [id(0x33)]: ['notify'],
    [id(0x34)]: ['read', 'write'],
    [id(0x35)]: ['notify'],
    [id(0x36)]: ['notify'],
    [id(0x80)]: ['notify'],
  },
};

function build(overrides = {}) {
  const p = new Pm5Peripheral({
    name: 'PM5 430000001',
    serial: '430000001',
    firmware: 'SIM-1.0',
    hardware: '634',
    ergMachineType: 0,
    getSampleRate: () => 1,
    onSampleRateWrite: (v) => v <= 3,
    onControlWrite: () => Uint8Array.of(0xf1, 0x01, 0x01, 0xf2),
    logger: { packet() {}, event() {} },
    bleno: fakeBleno,
    ...overrides,
  });
  return { p, services: p.buildServices() };
}

describe('GATT layout matches the spec', () => {
  const { services } = build();

  test('services and characteristics', () => {
    expect(services.map((s) => s.uuid).sort()).toEqual(Object.keys(SPEC).sort());
    for (const s of services) {
      const expected = SPEC[s.uuid];
      expect(s.characteristics.map((c) => c.uuid).sort()).toEqual(Object.keys(expected).sort());
      for (const c of s.characteristics) {
        // Every property the spec lists must be present (extras like writeWithoutResponse are fine).
        for (const prop of expected[c.uuid]) expect(c.properties).toContain(prop);
      }
    }
  });

  test('device info values decode as a PM5', () => {
    const info = Object.fromEntries(
      services
        .find((s) => s.uuid === id(0x10))
        .characteristics.map((c) => {
          const d = decodeDeviceInfo(parseInt(c.uuid.slice(4, 8), 16), c.value);
          return [d.field, d.value];
        }),
    );
    expect(info).toEqual({
      modelNumber: 'PM5',
      serialNumber: '430000001',
      hardwareRevision: '634',
      firmwareRevision: 'SIM-1.0',
      manufacturerName: 'Concept2',
      ergMachineType: 0,
    });
  });
});

describe('GATT behavior', () => {
  const char = (services, n) =>
    services.flatMap((s) => s.characteristics).find((c) => c.uuid === id(n));

  test('subscribe / unsubscribe tracking', () => {
    const { p, services } = build();
    const got = [];
    char(services, 0x31).onSubscribe(20, (buf) => got.push(buf));
    expect(p.isSubscribed(0x31)).toBe(true);
    p.notify(0x31, [1, 2, 3]);
    expect(got[0]).toEqual(Buffer.from([1, 2, 3]));
    char(services, 0x31).onUnsubscribe();
    expect(p.isSubscribed(0x31)).toBe(false);
  });

  test('sample rate write: valid, out of range, wrong length', () => {
    const { services } = build();
    const c = char(services, 0x34);
    const result = (data) => {
      let r;
      c.onWriteRequest(Buffer.from(data), 0, false, (code) => (r = code));
      return r;
    };
    expect(result([2])).toBe(0);
    expect(result([9])).toBe(0x0e);
    expect(result([1, 2])).toBe(0x0d);
  });

  test('CSAFE write → response readable on 0x0022 and notified', () => {
    const { p, services } = build();
    const notified = [];
    char(services, 0x22).onSubscribe(20, (b) => notified.push(b));
    char(services, 0x21).onWriteRequest(Buffer.from([0xf1, 0x80, 0x80, 0xf2]), 0, false, () => {});
    let read;
    char(services, 0x22).onReadRequest(0, (_code, data) => (read = data));
    expect(Array.from(read)).toEqual([0xf1, 0x01, 0x01, 0xf2]);
    expect(notified).toHaveLength(1);
    expect(p.isSubscribed(0x22)).toBe(true);
  });
});

describe('CSAFE handler', () => {
  const h = new CsafeHandler({ serial: '430000001', hwVersion: 634, swVersion: 1 });
  const ask = (contents, inUse = false) => {
    const { response } = h.handle(csafe.buildFrame(contents), inUse);
    const f = csafe.parseFrame(response);
    return csafe.parseResponseContents(f.contents);
  };

  test('GETSTATUS reports the state machine', () => {
    expect(ask([0x80]).responses).toEqual([{ cmd: 0x80, data: [1] }]);
    expect(ask([0x80], true).state).toBe(5);
  });

  test('GETVERSION: Concept2, PM5', () => {
    expect(ask([0x91]).responses[0].data.slice(0, 3)).toEqual([22, 2, 5]);
  });

  test('frame toggle alternates', () => {
    expect(ask([0x80]).toggle).not.toBe(ask([0x80]).toggle);
  });

  test('unknown commands: status only, previous frame OK', () => {
    const r = ask([0x7e, 1, 0x89]);
    expect(r.responses).toEqual([]);
    expect(r.prevStatus).toBe(0);
  });

  test('bad checksum: previous frame status BAD', () => {
    const { response, error } = h.handle([0xf1, 0x80, 0x00, 0xf2], false);
    expect(error).toBe('bad checksum');
    expect(csafe.parseResponseContents(csafe.parseFrame(response).contents).prevStatus).toBe(0x20);
  });
});

describe('CLI', () => {
  test('defaults', () => {
    expect(parseArgs([])).toMatchObject({
      scenario: 'steady',
      pace: 125,
      spm: 24,
      rate: 1,
      serial: '430000001',
    });
  });
  test('flags', () => {
    expect(
      parseArgs([
        '--pace',
        '1:55',
        '--spm',
        '30',
        '--name',
        'PM5 430000777',
        '--scenario',
        'sprint',
        '--no-hr',
      ]),
    ).toMatchObject({ pace: 115, spm: 30, serial: '430000777', heartRateBelt: false });
  });
  test('errors are explicit', () => {
    expect(() => parseArgs(['--pace', 'fast'])).toThrow(/--pace/);
    expect(() => parseArgs(['--rate', '7'])).toThrow(/--rate/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['--scenario', 'x'])).toThrow(/Unknown scenario/);
  });
});
