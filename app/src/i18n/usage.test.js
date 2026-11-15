import fs from 'fs';
import path from 'path';
import { DICTS } from './translate';

/** Every literal t('a.b') key used in the app exists in the English dictionary. */
test('all used translation keys exist', () => {
  const root = path.join(__dirname, '../..');
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules' || f.name.startsWith('.')) continue;
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(f.name) && !f.name.endsWith('.test.js')) files.push(p);
    }
  };
  walk(path.join(root, 'app'));
  walk(path.join(root, 'src'));
  const missing = [];
  const lookup = (key) => key.split('.').reduce((n, k) => (n == null ? undefined : n[k]), DICTS.en);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
      if (typeof lookup(m[1]) !== 'string') missing.push(`${path.relative(root, f)}: ${m[1]}`);
    }
    for (const m of src.matchAll(/translate\(\s*[a-z]+,\s*'([a-zA-Z0-9_.-]+)'/g)) {
      if (typeof lookup(m[1]) !== 'string') missing.push(`${path.relative(root, f)}: ${m[1]}`);
    }
  }
  expect(missing).toEqual([]);
});
