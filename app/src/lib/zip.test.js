import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createZip, crc32, utf8 } from './zip';

test('crc32 matches the standard check value', () => {
  expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
});

test('archive layout: signatures and entry count', () => {
  const zip = createZip([
    { name: 'a.jsonl', data: '{"x":1}\n' },
    { name: 'b.jsonl', data: '' },
  ]);
  const view = new DataView(zip.buffer);
  expect(view.getUint32(0, true)).toBe(0x04034b50);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  expect(view.getUint16(end + 10, true)).toBe(2);
  const cdSize = view.getUint32(end + 12, true);
  const cdOffset = view.getUint32(end + 16, true);
  expect(cdOffset + cdSize).toBe(end);
});

let hasUnzip = true;
try {
  execFileSync('unzip', ['-v'], { stdio: 'ignore' });
} catch {
  hasUnzip = false;
}

(hasUnzip ? test : test.skip)(
  'system unzip accepts the archive and extracts identical files',
  () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    const text = '{"type":"meta"}\n{"type":"note","text":"héllo ✓"}\n';
    const file = path.join(dir, 'logs.zip');
    fs.writeFileSync(
      file,
      createZip([
        { name: 'session-1.jsonl', data: text },
        { name: 'session-2.jsonl', data: 'x' },
      ]),
    );
    expect(execFileSync('unzip', ['-t', file]).toString()).toMatch(/No errors detected/);
    execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
    expect(fs.readFileSync(path.join(dir, 'session-1.jsonl'), 'utf8')).toBe(text);
    fs.rmSync(dir, { recursive: true });
  },
);
