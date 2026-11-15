/**
 * On-demand characters: downloaded once into <documents>/characters/<id>.glb and reused
 * offline afterwards. Bundled characters never touch this.
 */
import { Directory, File, Paths } from 'expo-file-system';

const dir = () => new Directory(Paths.document, 'characters');
const fileFor = (id) => new File(dir(), `${id}.glb`);

/** @returns {string|null} local file URI if already downloaded */
export function downloadedUri(id) {
  const f = fileFor(id);
  return f.exists && (f.size ?? 0) > 0 ? f.uri : null;
}

/**
 * @param {import('./catalog').CharacterEntry} entry
 * @returns {Promise<string>} local file URI
 */
export async function downloadCharacter(entry) {
  if (!entry.url) throw new Error('not-hosted');
  const d = dir();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  const target = fileFor(entry.id);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(entry.url, target);
  if (entry.bytes && Math.abs((file.size ?? 0) - entry.bytes) > 1024) {
    file.delete();
    throw new Error('size-mismatch');
  }
  return file.uri;
}

export function deleteCharacter(id) {
  const f = fileFor(id);
  if (f.exists) f.delete();
}
