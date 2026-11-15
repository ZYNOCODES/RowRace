/** LogStorage implementation on expo-file-system: <documents>/logs/*.jsonl */
import { Directory, File, Paths } from 'expo-file-system';

const dir = () => new Directory(Paths.document, 'logs');

/** @type {import('./logger').LogStorage} */
export const expoLogStorage = {
  async ensureDir() {
    const d = dir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
  },
  async list() {
    const d = dir();
    if (!d.exists) return [];
    return d
      .list()
      .filter((e) => e instanceof File)
      .map((f) => ({ name: f.name, size: f.size ?? 0, modified: f.modificationTime ?? 0 }));
  },
  async append(name, text) {
    const f = new File(dir(), name);
    if (!f.exists) f.create();
    await f.write(text, { append: true });
  },
  async remove(name) {
    const f = new File(dir(), name);
    if (f.exists) f.delete();
  },
  async read(name) {
    return new File(dir(), name).text();
  },
};

/** File handle for a log, e.g. to share it. */
export const logFile = (name) => new File(dir(), name);
