import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettings } from '../state/settings';
import { useConnection } from '../state/connection';
import { getScanner, logger, sourceManager, stopScanner } from '../services';
import { checkBlePermissions, isLegacyAndroid, requestBlePermissions } from './permissions';
import { useBluetoothState } from './useBluetoothState';
import { getBleSupport } from './bleSupport';

/**
 * Drives the Connect screen. Phases:
 *   unavailable Bluetooth source chosen but this build has no BLE (Expo Go)
 *   source      non-Bluetooth source selected (simulator / replay): one Start button
 *   checking    reading permission state
 *   permission  explanation before the system dialog (permStatus: denied | blocked | null)
 *   bluetooth   adapter off / unsupported
 *   scanning    searching; `devices` fills in
 *   timeout     scan ended; `devices` may be empty
 *   connecting  PM5Source connecting or retrying (see `detail`)
 *   connected
 */
export function useConnectFlow() {
  const dataSource = useSettings((s) => s.dataSource);
  const lastDevice = useSettings((s) => s.lastDevice);
  const autoReconnect = useSettings((s) => s.autoReconnect);
  const conn = useConnection(
    useShallow((s) => ({
      kind: s.kind,
      status: s.status,
      detail: s.statusDetail,
      info: s.deviceInfo,
    })),
  );

  const [permStatus, setPermStatus] = useState(
    /** @type {null|'granted'|'denied'|'blocked'} */ (null),
  );
  const [askedOnce, setAskedOnce] = useState(false);
  const [scan, setScan] = useState({ active: false, timedOut: false, devices: [] });
  const [target, setTarget] = useState(null);
  const triedLast = useRef(false);

  const bleSupport = getBleSupport();
  const isBle = dataSource === 'ble' && bleSupport.ok;
  const btState = useBluetoothState(isBle && permStatus === 'granted');
  const btReady = btState === 'PoweredOn';
  const connectedBle = conn.kind === 'ble' && ['connected', 'stale'].includes(conn.status);

  useEffect(() => {
    if (!isBle) return;
    checkBlePermissions().then(setPermStatus);
  }, [isBle]);

  const stopScan = useCallback(() => {
    stopScanner();
    setScan((s) => ({ ...s, active: false }));
  }, []);

  const startScan = useCallback(() => {
    setScan({ active: true, timedOut: false, devices: [] });
    getScanner().start({
      onUpdate: (devices) => setScan((s) => ({ ...s, devices })),
      onTimeout: (devices) => setScan({ active: false, timedOut: true, devices }),
      onError: (e) => {
        logger.ble('scan.ui.error', e);
        setScan((s) => ({ ...s, active: false, timedOut: true }));
      },
    });
  }, []);

  const connect = useCallback(
    (device) => {
      stopScan();
      setTarget(device);
      useSettings.getState().set({ lastDevice: { id: device.id, name: device.name } });
      logger.ui('connect.pick', { id: device.id, name: device.name });
      sourceManager.use('ble', { deviceId: device.id, deviceName: device.name });
    },
    [stopScan],
  );

  // Once Bluetooth is usable: try the last PM5 first, otherwise scan.
  useEffect(() => {
    if (!isBle || permStatus !== 'granted' || !btReady || connectedBle || target) return;
    if (lastDevice && autoReconnect && !triedLast.current) {
      triedLast.current = true;
      connect(lastDevice);
      return;
    }
    if (!scan.active && !scan.timedOut) startScan();
  }, [
    isBle,
    permStatus,
    btReady,
    connectedBle,
    target,
    lastDevice,
    autoReconnect,
    scan.active,
    scan.timedOut,
    connect,
    startScan,
  ]);

  useEffect(() => () => stopScanner(), []);

  const requestPermission = useCallback(async () => {
    setAskedOnce(true);
    const r = await requestBlePermissions();
    logger.ble('permission', { result: r, legacy: isLegacyAndroid() });
    setPermStatus(r);
  }, []);

  /** Cancel the current attempt and go back to the device list. */
  const chooseAnother = useCallback(async () => {
    await sourceManager.stop();
    setTarget(null);
    startScan();
  }, [startScan]);

  const startNonBle = useCallback(() => sourceManager.use(dataSource, {}), [dataSource]);

  let phase;
  if (dataSource === 'ble' && !bleSupport.ok) phase = 'unavailable';
  else if (!isBle)
    phase = connectedOrBusy(conn)
      ? conn.status === 'connected'
        ? 'connected'
        : 'connecting'
      : 'source';
  else if (permStatus == null) phase = 'checking';
  else if (permStatus !== 'granted') phase = 'permission';
  else if (btState !== 'PoweredOn' && btState !== 'Unknown' && btState !== 'Resetting')
    phase = 'bluetooth';
  else if (connectedBle) phase = 'connected';
  else if (
    target ||
    (conn.kind === 'ble' && conn.status !== 'idle' && conn.status !== 'disconnected')
  )
    phase = 'connecting';
  else if (scan.timedOut) phase = 'timeout';
  else phase = 'scanning';

  return {
    phase,
    dataSource,
    permStatus: askedOnce || permStatus === 'blocked' ? permStatus : null,
    legacyAndroid: isLegacyAndroid(),
    bleUnavailableReason: bleSupport.ok ? null : bleSupport.reason,
    btState,
    devices: scan.devices,
    lastDeviceId: lastDevice?.id,
    target: target || lastDevice,
    conn,
    requestPermission,
    startScan,
    connect,
    chooseAnother,
    startNonBle,
  };
}

const connectedOrBusy = (c) => c.kind != null && c.status !== 'idle' && c.status !== 'disconnected';
