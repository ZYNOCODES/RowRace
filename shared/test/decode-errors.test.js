const D = require('../pm5/decode');
const E = require('../pm5/encode');

const decoders = [
  ['generalStatus', D.decodeGeneralStatus, 19],
  ['additionalStatus1', D.decodeAdditionalStatus1, 17],
  ['additionalStatus2', D.decodeAdditionalStatus2, 20],
  ['strokeData', D.decodeStrokeData, 20],
  ['additionalStrokeData', D.decodeAdditionalStrokeData, 15],
];

describe.each(decoders)('%s', (type, decode, minLen) => {
  test('too short → ok:false with error, no throw', () => {
    const d = decode(new Uint8Array(minLen - 1));
    expect(d.ok).toBe(false);
    expect(d.type).toBe(type);
    expect(d.error).toMatch(/expected/);
    expect(d.hex).toHaveLength((minLen - 1) * 2);
  });

  test('garbage input never throws', () => {
    for (const input of [null, undefined, 42, 'abc', {}, []]) {
      expect(() => decode(input)).not.toThrow();
      expect(decode(input).ok).toBe(false);
    }
  });

  test('longer packets are accepted (future firmware)', () => {
    expect(decode(new Uint8Array(minLen + 5)).ok).toBe(true);
  });

  test('keeps raw hex', () => {
    const d = decode(new Uint8Array(minLen).fill(0xab));
    expect(d.hex).toBe('ab'.repeat(minLen));
  });
});

test('all-zero status 1 has no NaN or Infinity anywhere', () => {
  const d = D.decodeAdditionalStatus1(new Uint8Array(17));
  for (const v of Object.values(d)) {
    if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  }
});

test('multiplexed: empty or truncated payload', () => {
  expect(D.decodeMultiplexed([]).ok).toBe(false);
  const truncated = E.encodeMultiplexed(0x31, {}).slice(0, 10);
  const d = D.decodeMultiplexed(truncated);
  expect(d.ok).toBe(false);
  expect(d.muxId).toBe(0x31);
});

test('sample rate decode', () => {
  expect(D.decodeSampleRate([2])).toBe(2);
  expect(D.decodeSampleRate([9])).toBeNull();
  expect(D.decodeSampleRate([])).toBeNull();
});
