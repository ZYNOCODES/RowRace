/**
 * Advertising lifecycle against a fake bleno that behaves like the real hci-socket one:
 * - on disconnect it emits 'disconnect', then restarts advertising itself if it was advertising
 * - startAdvertising while already advertising fails with "Command Disallowed"
 */
const { EventEmitter } = require('events');
const { Pm5Peripheral } = require('./peripheral');

class FakeBleno extends EventEmitter {
  constructor() {
    super();
    this.state = 'poweredOn';
    this.on_ = false; // controller advertising
    this.flag = false; // bleno's _advertising (restart after disconnect)
    this.starts = 0;
    this.errors = 0;
  }
  setServices(_s, cb) {
    setTimeout(cb, 0);
  }
  startAdvertising() {
    this.starts += 1;
    this.flag = true;
    setTimeout(() => {
      if (this.on_) {
        this.errors += 1;
        this.emit('advertisingStartError', new Error('Command Disallowed'));
      } else {
        this.on_ = true;
        this.emit('advertisingStart');
      }
    }, 5);
  }
  stopAdvertising() {
    this.flag = false;
    this.on_ = false;
    setTimeout(() => this.emit('advertisingStop'), 5);
  }
  clientConnects(addr = 'aa') {
    this.on_ = false;
    this.emit('accept', addr);
  }
  disconnect() {
    this.emit('disconnect', 'aa');
    if (this.flag) setTimeout(() => ((this.on_ = true), this.emit('advertisingStart')), 5);
  }
}

function setup() {
  const bleno = new FakeBleno();
  const p = new Pm5Peripheral({
    name: 'PM5 430000001',
    serial: '430000001',
    firmware: 'SIM-1.0',
    hardware: '634',
    ergMachineType: 0,
    getSampleRate: () => 1,
    onSampleRateWrite: () => true,
    onControlWrite: () => null,
    logger: { packet() {}, event() {} },
    bleno,
  });
  bleno.Characteristic = class {
    constructor(o) {
      Object.assign(this, o);
    }
  };
  bleno.PrimaryService = class {
    constructor(o) {
      Object.assign(this, o);
    }
  };
  p.start();
  return { bleno, p };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('client disconnect: bleno restarts advertising, no duplicate start, no error', () => {
  const { bleno, p } = setup();
  jest.advanceTimersByTime(50);
  expect(p.advertising).toBe(true);
  bleno.clientConnects();
  bleno.disconnect();
  jest.advanceTimersByTime(5000);
  expect(bleno.errors).toBe(0);
  expect(bleno.starts).toBe(1);
  expect(p.advertising).toBe(true);
});

test('safety net: if the restart never happens, the simulator advertises again', () => {
  const { bleno, p } = setup();
  jest.advanceTimersByTime(50);
  bleno.clientConnects();
  bleno.flag = false; // bleno lost its flag: it won't restart
  bleno.disconnect();
  jest.advanceTimersByTime(2000);
  expect(p.advertising).toBe(true);
  expect(bleno.starts).toBe(2);
});

test('forced disconnect with 5 s hidden: invisible for 5 s, then advertises', () => {
  const { bleno, p } = setup();
  jest.advanceTimersByTime(50);
  bleno.clientConnects();
  p.disconnect(5);
  jest.advanceTimersByTime(4900);
  expect(bleno.on_).toBe(false);
  jest.advanceTimersByTime(200);
  expect(bleno.on_).toBe(true);
  expect(bleno.errors).toBe(0);
});

test('start error while not advertising is retried', () => {
  const { bleno, p } = setup();
  jest.advanceTimersByTime(50);
  bleno.clientConnects();
  bleno.flag = false;
  bleno.on_ = true; // controller in a stuck state: first start fails
  bleno.disconnect();
  jest.advanceTimersByTime(1600);
  expect(bleno.errors).toBe(1);
  bleno.on_ = false;
  jest.advanceTimersByTime(2100);
  expect(p.advertising).toBe(true);
});
