/**
 * BLE peripheral that presents the PM5 GATT table (spec Table 14) through bleno.
 * Acts as the SimulatorCore transport. bleno is required lazily so tests and --dry-run
 * work on machines without Bluetooth.
 */
const { EventEmitter } = require('events');

/** After a disconnect, check that bleno's own restart worked; start advertising if not. */
const SAFETY_CHECK_MS = 1500;
const RETRY_ADVERTISE_MS = 2000;
const { UUID, SHORT, pm5Uuid, encodeDeviceInfo, shortIdLabel } = require('@rowrace/shared');

/**
 * @typedef {Object} PeripheralOptions
 * @property {string} name advertised + GAP device name, e.g. "PM5 430000001"
 * @property {string} serial 9-digit serial
 * @property {string} firmware firmware revision string
 * @property {string} hardware hardware revision string
 * @property {number} ergMachineType
 * @property {() => number} getSampleRate
 * @property {(value: number) => boolean} onSampleRateWrite
 * @property {(bytes: Buffer) => Uint8Array | null} onControlWrite CSAFE frame in, response out
 * @property {{ packet: Function, event: Function }} logger
 * @property {object} [bleno] injected bleno-like module (tests); defaults to @abandonware/bleno
 */

class Pm5Peripheral extends EventEmitter {
  /** @param {PeripheralOptions} opts */
  constructor(opts) {
    super();
    this.opts = opts;
    /** @type {Map<number, (data: Buffer) => void>} */
    this.subscribers = new Map();
    this.connectedTo = null;
    this.hiddenUntil = 0;
    this.controlValue = Buffer.alloc(0);
    this.state = 'unknown';
    this.advertising = false;
    this.advertiseRetries = 0;
    this.advertiseTimer = null;
  }

  start() {
    // bleno reads the GAP device name (0x2A00) from this variable when services are set.
    process.env.BLENO_DEVICE_NAME = this.opts.name;
    this.bleno = this.opts.bleno || require('@abandonware/bleno');
    const b = this.bleno;
    const log = this.opts.logger;

    const onState = (state) => {
      if (state === this.state) return;
      this.state = state;
      log.event('ble.state', { state });
      this.emit('change');
      if (state === 'poweredOn') {
        b.setServices(this.buildServices(), (err) => {
          if (err) log.event('ble.servicesError', { message: String(err) });
          this.advertise();
        });
      } else if (state !== 'unknown') {
        this.connectedTo = null;
        this.subscribers.clear();
      }
    };
    b.on('stateChange', onState);
    // bleno initializes the adapter while this first listener is being added, so an
    // immediate state (e.g. poweredOff) is emitted before the listener exists. Catch up.
    onState(b.state);
    b.on('advertisingStart', () => {
      this.advertising = true;
      this.advertiseRetries = 0;
      log.event('ble.advertising', { name: this.opts.name });
      this.emit('change');
      // A restart that lands inside a "hidden" window (disconnect scenario) is undone.
      if (Date.now() < this.hiddenUntil) b.stopAdvertising();
    });
    b.on('advertisingStop', () => {
      this.advertising = false;
      log.event('ble.advertisingStop');
      this.emit('change');
    });
    b.on('advertisingStartError', (err) => {
      log.event('ble.advertisingError', { message: String(err), advertising: this.advertising });
      // "Command Disallowed" usually means we're already advertising; only retry if not.
      if (!this.advertising) this.scheduleAdvertise(RETRY_ADVERTISE_MS);
    });
    b.on('accept', (address) => {
      this.connectedTo = address;
      this.advertising = false; // the controller stops advertising once connected
      log.event('ble.connect', { address });
      this.emit('change');
    });
    b.on('disconnect', (address) => {
      this.connectedTo = null;
      this.subscribers.clear();
      log.event('ble.disconnect', { address });
      this.emit('change');
      // bleno restarts advertising by itself after a disconnect (unless we stopped it), so
      // don't start it a second time. Hidden period: make sure it's off, come back later.
      const wait = this.hiddenUntil - Date.now();
      if (wait > 0) {
        this.scheduleAdvertise(wait);
      } else {
        this.scheduleAdvertise(SAFETY_CHECK_MS);
      }
    });
    b.on('mtuChange', (mtu) => log.event('ble.mtu', { mtu }));
  }

  /** Starts advertising unless already advertising, connected, hidden or not powered. */
  advertise() {
    if (this.state !== 'poweredOn' || this.connectedTo || this.advertising) return;
    if (Date.now() < this.hiddenUntil) return this.scheduleAdvertise(this.hiddenUntil - Date.now());
    this.advertiseRetries += 1;
    this.bleno.startAdvertising(this.opts.name, [UUID.ROWING_SERVICE]);
  }

  scheduleAdvertise(ms) {
    clearTimeout(this.advertiseTimer);
    this.advertiseTimer = setTimeout(() => this.advertise(), Math.max(0, ms));
  }

  // ---- transport interface used by SimulatorCore ----

  isSubscribed(shortId) {
    return this.subscribers.has(shortId);
  }

  notify(shortId, bytes) {
    const cb = this.subscribers.get(shortId);
    if (cb) cb(Buffer.from(bytes));
  }

  /** Drops the current link and stays hidden (not advertising) for `blockSeconds`. */
  disconnect(blockSeconds = 0) {
    this.hiddenUntil = Date.now() + blockSeconds * 1000;
    if (!this.connectedTo) return;
    // Stopping first also clears bleno's own "restart after disconnect" flag.
    if (blockSeconds > 0) this.bleno.stopAdvertising();
    this.bleno.disconnect();
  }

  // ---- GATT ----

  buildServices() {
    const b = this.bleno || this.opts.bleno;
    const o = this.opts;
    const C = b.Characteristic;
    const log = o.logger;

    const staticRead = (shortId, value) =>
      new C({
        uuid: pm5Uuid(shortId),
        properties: ['read'],
        value: Buffer.from(encodeDeviceInfo(shortId, value)),
      });

    const notifyChar = (shortId) =>
      new C({
        uuid: pm5Uuid(shortId),
        properties: ['notify'],
        onSubscribe: (_maxSize, cb) => {
          this.subscribers.set(shortId, cb);
          log.event('ble.subscribe', { char: shortIdLabel(shortId) });
          this.emit('change');
        },
        onUnsubscribe: () => {
          this.subscribers.delete(shortId);
          log.event('ble.unsubscribe', { char: shortIdLabel(shortId) });
          this.emit('change');
        },
      });

    const deviceInfo = new b.PrimaryService({
      uuid: UUID.DEVICE_INFO_SERVICE,
      characteristics: [
        staticRead(SHORT.MODEL_NUMBER, 'PM5'),
        staticRead(SHORT.SERIAL_NUMBER, o.serial),
        staticRead(SHORT.HARDWARE_REVISION, o.hardware),
        staticRead(SHORT.FIRMWARE_REVISION, o.firmware),
        staticRead(SHORT.MANUFACTURER_NAME, 'Concept2'),
        staticRead(SHORT.ERG_MACHINE_TYPE, o.ergMachineType),
      ],
    });

    const controlTransmit = new C({
      uuid: UUID.CONTROL_TRANSMIT,
      properties: ['read', 'notify'],
      onReadRequest: (offset, cb) => {
        log.packet('read', shortIdLabel(SHORT.CONTROL_TRANSMIT), this.controlValue);
        cb(C.RESULT_SUCCESS, this.controlValue.subarray(offset));
      },
      onSubscribe: (_m, cb) => this.subscribers.set(SHORT.CONTROL_TRANSMIT, cb),
      onUnsubscribe: () => this.subscribers.delete(SHORT.CONTROL_TRANSMIT),
    });

    const controlReceive = new C({
      uuid: UUID.CONTROL_RECEIVE,
      properties: ['write', 'writeWithoutResponse'],
      onWriteRequest: (data, _offset, withoutResponse, cb) => {
        log.packet('write', shortIdLabel(SHORT.CONTROL_RECEIVE), data);
        const response = o.onControlWrite(data);
        if (!withoutResponse) cb(C.RESULT_SUCCESS);
        if (response) {
          this.controlValue = Buffer.from(response);
          this.notify(SHORT.CONTROL_TRANSMIT, response);
          log.packet('notify', shortIdLabel(SHORT.CONTROL_TRANSMIT), response);
        }
      },
    });

    const sampleRate = new C({
      uuid: UUID.SAMPLE_RATE,
      properties: ['read', 'write'],
      onReadRequest: (offset, cb) =>
        cb(C.RESULT_SUCCESS, Buffer.from([o.getSampleRate()]).subarray(offset)),
      onWriteRequest: (data, offset, _wr, cb) => {
        log.packet('write', shortIdLabel(SHORT.SAMPLE_RATE), data);
        if (offset !== 0) return cb(C.RESULT_INVALID_OFFSET);
        if (data.length !== 1) return cb(C.RESULT_INVALID_ATTRIBUTE_LENGTH);
        cb(o.onSampleRateWrite(data[0]) ? C.RESULT_SUCCESS : C.RESULT_UNLIKELY_ERROR);
      },
    });

    const control = new b.PrimaryService({
      uuid: UUID.CONTROL_SERVICE,
      characteristics: [controlReceive, controlTransmit],
    });

    const rowing = new b.PrimaryService({
      uuid: UUID.ROWING_SERVICE,
      characteristics: [
        notifyChar(SHORT.GENERAL_STATUS),
        notifyChar(SHORT.ADDITIONAL_STATUS_1),
        notifyChar(SHORT.ADDITIONAL_STATUS_2),
        sampleRate,
        notifyChar(SHORT.STROKE_DATA),
        notifyChar(SHORT.ADDITIONAL_STROKE_DATA),
        notifyChar(SHORT.MULTIPLEXED),
      ],
    });

    return [deviceInfo, control, rowing];
  }
}

module.exports = { Pm5Peripheral };
