#!/usr/bin/env node
/**
 * PM5 simulator entry point. See simulator/README.md for the Linux Bluetooth setup.
 */
const fs = require('fs');
const path = require('path');
const { constants, ErgMachineType, SHORT } = require('@rowrace/shared');
const { parseArgs, HELP } = require('./cli');
const { SimulatorCore } = require('./core');
const { ReplayCore } = require('./replay');
const { CsafeHandler } = require('./csafeHandler');
const { JsonlLogger } = require('./logger');
const { Pm5Peripheral } = require('./peripheral');
const { startTerminal } = require('./terminal');

const TICK_MS = 50;
const FIRMWARE = 'SIM-1.0';
const HARDWARE = '634';

/** Printed once per Bluetooth state change; details in simulator/README.md. */
const STATE_HINTS = {
  poweredOn: 'adapter ready.',
  poweredOff:
    'the adapter is off or blocked. Run "rfkill unblock bluetooth" and "sudo hciconfig hci0 up" (README step 3).',
  unauthorized:
    'no permission for raw Bluetooth. Run the setcap command from README step 2, or start with sudo.',
  unsupported: 'no usable Bluetooth LE adapter found (try --hci 1 for a USB dongle).',
};

/** Transport for --dry-run: everything "subscribed", packets printed as hex. */
function dryRunTransport() {
  let lastPrint = 0;
  return {
    connectedTo: null,
    state: 'dry-run',
    isSubscribed: (id) => id !== SHORT.MULTIPLEXED,
    notify(id, bytes) {
      const now = Date.now();
      if (now - lastPrint > 1000) {
        lastPrint = now;
        console.log(
          `\n0x${id.toString(16).padStart(4, '0')} ${Buffer.from(bytes).toString('hex')}`,
        );
      }
    },
    disconnect: () => console.log('\n[dry-run] disconnect requested'),
  };
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (opts.hci != null) process.env.BLENO_HCI_DEVICE_ID = String(opts.hci);

  const logger = new JsonlLogger({ enabled: opts.log });
  logger.meta({
    simulator: constants.APP_NAME,
    name: opts.name,
    serial: opts.serial,
    scenario: opts.replay ? null : opts.scenario,
    replay: opts.replay,
    pace: opts.pace,
    spm: opts.spm,
    node: process.version,
  });

  let core;
  if (opts.replay) {
    const file = path.resolve(opts.replay);
    core = new ReplayCore(fs.readFileSync(file, 'utf8'), {
      speed: opts.speed,
      loop: opts.loop,
      logger,
    });
    console.log(
      `Replaying ${core.packets.length} packets (${Math.round(core.duration)} s) from ${file}`,
    );
  } else {
    core = new SimulatorCore({
      pace: opts.pace,
      spm: opts.spm,
      scenario: opts.scenario,
      sampleRate: opts.rate,
      heartRateBelt: opts.heartRateBelt,
      seed: opts.seed,
      logger,
    });
  }

  const csafe = new CsafeHandler({ serial: opts.serial, hwVersion: 634, swVersion: 1 });
  let peripheral = null;
  if (opts.dryRun) {
    core.attach(dryRunTransport());
  } else {
    peripheral = new Pm5Peripheral({
      name: opts.name,
      serial: opts.serial,
      firmware: FIRMWARE,
      hardware: HARDWARE,
      ergMachineType: ErgMachineType.STATIC_D,
      getSampleRate: () => core.sampleRate ?? 1,
      onSampleRateWrite: (v) => (core.setSampleRate ? core.setSampleRate(v, 'app') : false),
      onControlWrite: (data) => {
        const inUse = core.model ? core.model.rowing : false;
        const { response, error } = csafe.handle(data, inUse);
        if (error) logger.event('csafe.badFrame', { error });
        return response;
      },
      logger,
    });
    core.attach(peripheral);
    let lastState = null;
    peripheral.on('change', () => {
      if (peripheral.state === lastState) return;
      lastState = peripheral.state;
      const hint = STATE_HINTS[peripheral.state];
      if (hint) console.error(`\n[bluetooth] ${peripheral.state}: ${hint}`);
    });
    try {
      peripheral.start();
    } catch (e) {
      console.error(
        `Bluetooth failed to start: ${e.message}\nSee simulator/README.md (Troubleshooting).`,
      );
      process.exit(1);
    }
  }

  console.log(
    `${opts.dryRun ? 'Dry run' : `PM5 simulator "${opts.name}" (waits for the adapter, then advertises)`}${logger.file ? ` · log: ${logger.file}` : ''}`,
  );

  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    core.tick(Math.min(250, now - last)); // clamp after a suspend/debugger pause
    last = now;
  }, TICK_MS);

  let stopTerminal = () => {};
  const quit = async () => {
    clearInterval(timer);
    stopTerminal();
    if (peripheral && peripheral.bleno) {
      try {
        peripheral.bleno.stopAdvertising();
        peripheral.bleno.disconnect();
      } catch {
        // already down
      }
    }
    await logger.close();
    process.exit(0);
  };
  stopTerminal = startTerminal({ core, peripheral, onQuit: quit, replay: !!opts.replay });
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

main();
