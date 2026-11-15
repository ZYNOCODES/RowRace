import { useEffect, useState } from 'react';
import { getBleManager } from './bleManager';
import { getBleSupport } from './bleSupport';

/**
 * Live Bluetooth adapter state from ble-plx:
 * 'Unknown' | 'Resetting' | 'Unsupported' | 'Unauthorized' | 'PoweredOff' | 'PoweredOn'.
 * @param {boolean} enabled only touch Bluetooth when the data source is the real PM5
 */
export function useBluetoothState(enabled = true) {
  const [state, setState] = useState('Unknown');
  useEffect(() => {
    if (!enabled || !getBleSupport().ok) return undefined;
    const sub = getBleManager().onStateChange(setState, true);
    return () => sub.remove();
  }, [enabled]);
  return state;
}
