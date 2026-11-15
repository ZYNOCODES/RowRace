/**
 * App-wide singletons: the session logger and the data-source manager, wired to the real
 * native modules. Screens import from here; the classes themselves stay testable.
 */
import { SessionLogger } from '../logging/logger';
import { expoLogStorage } from '../logging/logStorage';
import { SourceManager } from '../data/sourceManager';
import { PM5Source } from '../data/pm5';
import { PM5Scanner } from '../data/scanner';
import { MockPM5 } from '../data/mockPM5';
import { ReplaySource } from '../data/replaySource';
import { getBleManager } from '../data/bleManager';
import { useConnection } from '../state/connection';

export const logger = new SessionLogger({
  storage: expoLogStorage,
  onError: (e) => console.warn('[logger]', e?.message || e),
});

export const sourceManager = new SourceManager({
  store: useConnection,
  logger,
  factories: {
    ble: ({ deviceId, deviceName }) =>
      new PM5Source({ manager: getBleManager(), deviceId, deviceName, logger }),
    mock: ({ scenario }) => new MockPM5({ scenario, logger }),
    replay: ({ text, name, speed }) => new ReplaySource({ text, name, speed, logger }),
  },
});

/** One scanner for the Connect screen. */
let scanner = null;
export function getScanner() {
  if (!scanner) scanner = new PM5Scanner({ manager: getBleManager(), logger });
  return scanner;
}

/** Stops scanning if a scanner exists. Never creates one (Bluetooth may be unavailable). */
export function stopScanner() {
  scanner?.stop();
}
