import { log } from '@rowrace/shared';
import { createFakeClock } from '../lib/clock';
import { SessionLogger, MAX_FILES, MAX_FILE_BYTES } from './logger';

function memoryStorage() {
  const files = new Map();
  return {
    files,
    async ensureDir() {},
    async list() {
      return [...files.entries()].map(([name, text]) => ({ name, size: text.length, modified: 0 }));
    },
    async append(name, text) {
      files.set(name, (files.get(name) || '') + text);
    },
    async remove(name) {
      files.delete(name);
    },
    async read(name) {
      return files.get(name) || '';
    },
  };
}

const flushAll = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test('buffers lines and flushes every second', async () => {
  const storage = memoryStorage();
  const clock = createFakeClock(Date.UTC(2026, 10, 20, 18, 0, 0));
  const logger = new SessionLogger({ storage, clock });
  await logger.start({ app: 'RowRace 3D', source: 'mock' });
  logger.packet('notify', '0x0031', '00ff', {
    ok: true,
    type: 'generalStatus',
    hex: '00ff',
    distance: 1,
  });
  logger.note('I just pressed reset on the PM5');
  expect(storage.files.size).toBe(0);
  clock.advance(1000);
  await flushAll();
  const [name, text] = [...storage.files.entries()][0];
  expect(name).toBe('session-2026-11-20T18-00-00-000Z.jsonl');
  const lines = text.trim().split('\n').map(log.parseLine);
  expect(lines.map((l) => l.type)).toEqual(['meta', 'packet', 'note']);
  expect(lines[1]).toMatchObject({
    dir: 'notify',
    char: '0x0031',
    hex: '00ff',
    decoded: { distance: 1 },
  });
  expect(lines[1].decoded.hex).toBeUndefined();
  await logger.stop();
});

test('errors keep message and stack', async () => {
  const storage = memoryStorage();
  const logger = new SessionLogger({ storage, clock: createFakeClock() });
  await logger.start();
  logger.error(new Error('boom'), { where: 'connect' });
  await logger.flush();
  const line = log.parseLine([...storage.files.values()][0].trim().split('\n')[1]);
  expect(line).toMatchObject({ type: 'error', message: 'boom', where: 'connect' });
  expect(line.stack).toMatch(/boom/);
});

test(`keeps only the last ${MAX_FILES} files`, async () => {
  const storage = memoryStorage();
  for (let i = 0; i < 30; i++)
    storage.files.set(`session-2026-01-${String(i).padStart(2, '0')}.jsonl`, 'x\n');
  const logger = new SessionLogger({ storage, clock: createFakeClock(Date.UTC(2026, 10, 1)) });
  await logger.start();
  await logger.flush();
  const names = [...storage.files.keys()].sort();
  expect(names).toHaveLength(MAX_FILES);
  expect(names).toContain(logger.file);
  expect(names).not.toContain('session-2026-01-00.jsonl');
});

test('rolls over to a part file past 10 MB', async () => {
  const storage = memoryStorage();
  const logger = new SessionLogger({ storage, clock: createFakeClock() });
  await logger.start();
  const big = 'a'.repeat(1024 * 1024);
  for (let i = 0; i < 12; i++) {
    logger.note(big);
    await logger.flush();
  }
  const sizes = [...storage.files.entries()].map(([n, t]) => [n, t.length]);
  expect(sizes.length).toBe(2);
  expect(sizes.every(([, s]) => s <= MAX_FILE_BYTES)).toBe(true);
  expect(logger.file).toMatch(/-part2\.jsonl$/);
});

test('concurrent flushes do not lose or duplicate lines', async () => {
  const storage = memoryStorage();
  const logger = new SessionLogger({ storage, clock: createFakeClock() });
  await logger.start();
  const flushes = [];
  for (let i = 0; i < 50; i++) {
    logger.note(String(i));
    if (i % 7 === 0) flushes.push(logger.flush());
  }
  flushes.push(logger.flush());
  await Promise.all(flushes);
  await logger.flush();
  const notes = [...storage.files.values()][0]
    .trim()
    .split('\n')
    .map(log.parseLine)
    .filter((l) => l.type === 'note');
  expect(notes.map((n) => n.text)).toEqual(Array.from({ length: 50 }, (_, i) => String(i)));
});

test('restart opens a new file; clear keeps a fresh current file', async () => {
  const storage = memoryStorage();
  const clock = createFakeClock(Date.UTC(2026, 0, 1));
  const logger = new SessionLogger({ storage, clock });
  await logger.start({ source: 'ble' });
  logger.note('a');
  clock.advance(5000);
  await logger.restart({ recording: true });
  await logger.flush();
  expect(storage.files.size).toBe(2);
  const files = await logger.listFiles();
  expect(files[0].current).toBe(true);
  await logger.clear();
  await logger.flush();
  expect(storage.files.size).toBe(1);
  expect([...storage.files.values()][0]).toMatch(/"recording":true/);
});
