/** Connection-time reads and writes for PM5Source: device information and sample rate. */
import {
  UUID,
  SHORT,
  bytes as B,
  decodeDeviceInfo,
  decodeSampleRate,
  SAMPLE_RATE_MS,
  pm5Uuid,
  shortIdLabel,
} from '@rowrace/shared';

/** Sample rate the app asks for (2 = 250 ms). */
export const WANTED_SAMPLE_RATE = 2;

const DEVICE_INFO_CHARS = [
  SHORT.MODEL_NUMBER,
  SHORT.SERIAL_NUMBER,
  SHORT.HARDWARE_REVISION,
  SHORT.FIRMWARE_REVISION,
  SHORT.MANUFACTURER_NAME,
  SHORT.ERG_MACHINE_TYPE,
];

const msg = (e) => String(e?.message || e);

/**
 * Reads 0x0011–0x0016. Each read may fail on its own (0x0016 only exists on some firmware;
 * the erg type also arrives in 0x0032), so failures are logged and skipped.
 * @returns {Promise<object|null>} null when the attempt was abandoned (`alive()` false)
 */
export async function readDeviceInfo(manager, deviceId, logger, alive) {
  const info = {};
  for (const shortId of DEVICE_INFO_CHARS) {
    try {
      const ch = await manager.readCharacteristicForDevice(
        deviceId,
        UUID.DEVICE_INFO_SERVICE,
        pm5Uuid(shortId),
      );
      if (!alive()) return null;
      const d = decodeDeviceInfo(shortId, B.base64ToBytes(ch?.value));
      logger.packet('read', shortIdLabel(shortId), d.hex, d);
      if (d.ok) info[d.field] = d.value;
    } catch (e) {
      logger.ble('read.error', { char: shortIdLabel(shortId), message: msg(e) });
    }
  }
  return info;
}

/** Reads 0x0034. @returns {Promise<number|null>} interval in ms, null if unreadable */
async function readSampleRateMs(manager, deviceId) {
  try {
    const ch = await manager.readCharacteristicForDevice(deviceId, UUID.ROWING_SERVICE, UUID.SAMPLE_RATE);
    const rate = decodeSampleRate(B.base64ToBytes(ch?.value));
    return rate == null ? null : SAMPLE_RATE_MS[rate];
  } catch {
    return null;
  }
}

/**
 * Writes 250 ms to 0x0034 and reads it back. Old firmware may refuse the write: then we read
 * what the PM5 actually uses (500 ms default if even that read fails) and carry on.
 * @returns {Promise<number|null>} effective interval in ms, null if abandoned
 */
export async function writeSampleRate(manager, deviceId, logger, alive) {
  const char = shortIdLabel(SHORT.SAMPLE_RATE);
  try {
    logger.packet('write', char, B.toHex([WANTED_SAMPLE_RATE]));
    await manager.writeCharacteristicWithResponseForDevice(
      deviceId,
      UUID.ROWING_SERVICE,
      UUID.SAMPLE_RATE,
      B.bytesToBase64([WANTED_SAMPLE_RATE]),
    );
    if (!alive()) return null;
    const ms = (await readSampleRateMs(manager, deviceId)) ?? SAMPLE_RATE_MS[WANTED_SAMPLE_RATE];
    logger.ble('sampleRate.ok', { ms });
    return ms;
  } catch (e) {
    if (!alive()) return null;
    const actual = await readSampleRateMs(manager, deviceId);
    const ms = actual ?? SAMPLE_RATE_MS[1];
    logger.ble('sampleRate.failed', { message: msg(e), actualMs: actual, usingMs: ms });
    return ms;
  }
}
