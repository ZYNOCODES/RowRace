import { create } from 'zustand';

/**
 * Live connection / diagnostics state, written only by the SourceManager.
 * @typedef {import('../data/PacketSource').SourceStatus} SourceStatus
 */
export const useConnection = create(() => ({
  /** @type {'ble'|'mock'|'replay'|null} */
  kind: null,
  /** @type {SourceStatus} */
  status: 'idle',
  statusDetail: {},
  deviceInfo: {},
  lastSample: null,
  recentPackets: [],
  /** packets/second per characteristic, e.g. { '0x0031': 4 } */
  rates: {},
  stats: null,
  warning: null,
  error: null,
}));

/**
 * Maps a status to the connection pill: tone + i18n key. Tone is never the only signal: the
 * pill also has an icon and text.
 * @param {SourceStatus} status
 */
export function pillFor(status) {
  switch (status) {
    case 'connected':
      return { tone: 'success', key: 'status.connected', icon: 'check' };
    case 'connecting':
      return { tone: 'warning', key: 'status.connecting', icon: 'refresh' };
    case 'reconnecting':
      return { tone: 'warning', key: 'status.reconnecting', icon: 'refresh' };
    case 'stale':
      return { tone: 'warning', key: 'status.stale', icon: 'warning' };
    case 'failed':
      return { tone: 'danger', key: 'status.failed', icon: 'warning' };
    default:
      return { tone: 'danger', key: 'status.disconnected', icon: 'close' };
  }
}
