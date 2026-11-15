const C = require('../pm5/csafe');

describe('CSAFE framing', () => {
  test('standard frame for GETSTATUS', () => {
    // contents [0x80], checksum 0x80
    expect(Array.from(C.buildFrame([0x80]))).toEqual([0xf1, 0x80, 0x80, 0xf2]);
  });

  test('byte stuffing of flag values (Table 6)', () => {
    expect(C.stuff([0xf0, 0xf1, 0xf2, 0xf3, 0x10])).toEqual([
      0xf3, 0, 0xf3, 1, 0xf3, 2, 0xf3, 3, 0x10,
    ]);
    expect(C.unstuff([0xf3, 0, 0xf3, 3, 0x10])).toEqual([0xf0, 0xf3, 0x10]);
    expect(C.unstuff([0xf3, 9])).toBeNull();
  });

  test('round-trip including a checksum that needs stuffing', () => {
    const contents = [0x76, 0x02, 0xf0, 0x01]; // checksum = 0x76^0x02^0xf0^0x01 = 0x85
    const frame = C.buildFrame(contents);
    expect(frame.slice(1, -1)).not.toContain(0xf2);
    expect(C.parseFrame(frame)).toEqual({ ok: true, extended: false, contents });
  });

  test('extended frame keeps addresses out of the checksum', () => {
    const frame = C.buildFrame([0x91], { dest: 0xfd, src: 0x00 });
    expect(frame[0]).toBe(0xf0);
    expect(C.parseFrame(frame)).toEqual({
      ok: true,
      extended: true,
      dest: 0xfd,
      src: 0,
      contents: [0x91],
    });
  });

  test('bad checksum, missing flags', () => {
    expect(C.parseFrame([0xf1, 0x80, 0x81, 0xf2])).toEqual({ ok: false, error: 'bad checksum' });
    expect(C.parseFrame([0x80, 0xf2]).ok).toBe(false);
    expect(C.parseFrame([0xf1, 0x80]).ok).toBe(false);
    expect(C.parseFrame([0x00, 0xf1, 0x80, 0x80, 0xf2]).ok).toBe(true); // resync
  });
});

describe('commands and responses', () => {
  test('short and long commands', () => {
    expect(C.command(C.CMD.GETSTATUS)).toEqual([0x80]);
    expect(C.command(C.CMD.GETPMDATA, [0x89])).toEqual([0x7f, 1, 0x89]);
    expect(C.parseCommands([0x80, 0x7f, 1, 0x89, 0x91])).toEqual([
      { cmd: 0x80, data: [] },
      { cmd: 0x7f, data: [0x89] },
      { cmd: 0x91, data: [] },
    ]);
    expect(C.parseCommands([0x7f, 3, 1])).toBeNull();
  });

  test('response contents round-trip', () => {
    const contents = C.buildResponseContents(
      { toggle: true, prevStatus: C.PREV_FRAME_STATUS.OK, state: C.STATE.READY },
      [{ cmd: 0x80, data: [0x81] }],
    );
    expect(contents[0]).toBe(0x81);
    expect(C.parseResponseContents(contents)).toEqual({
      toggle: true,
      prevStatus: 0,
      state: 1,
      responses: [{ cmd: 0x80, data: [0x81] }],
    });
  });
});
