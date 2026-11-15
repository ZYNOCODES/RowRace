/** Zips the session logs and opens the system share sheet (WhatsApp, email, …). */
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { createZip } from '../lib/zip';
import { expoLogStorage } from './logStorage';

/**
 * @param {import('./logger').SessionLogger} logger
 * @param {{ maxFiles?: number, deviceTag?: string }} [opts]
 * @returns {Promise<{ ok: true, files: number, bytes: number } | { ok: false, reason: string }>}
 */
export async function shareLogs(logger, opts = {}) {
  const files = (await logger.listFiles()).slice(0, opts.maxFiles ?? 20);
  if (files.length === 0) return { ok: false, reason: 'no-logs' };
  if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'sharing-unavailable' };

  const entries = [];
  for (const f of files) entries.push({ name: f.name, data: await expoLogStorage.read(f.name) });
  const zip = createZip(entries);

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = new File(Paths.cache, `rowrace-logs-${opts.deviceTag || 'device'}-${stamp}.zip`);
  if (out.exists) out.delete();
  out.create();
  out.write(zip);
  logger.ble('logs.shared', { files: files.length, bytes: zip.length });
  await Sharing.shareAsync(out.uri, { mimeType: 'application/zip', dialogTitle: 'Share logs' });
  return { ok: true, files: files.length, bytes: zip.length };
}
