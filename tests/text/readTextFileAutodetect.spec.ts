import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { readTextFileAutodetect } from '../../src/text/readTextFileAutodetect';

test('readTextFileAutodetect reads UTF-16 LE with BOM (Windows “Unicode”)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barbora-encoding-'));
  const p = path.join(dir, 'run.json');
  const json = '{"a":1}';
  const buf = Buffer.alloc(2 + json.length * 2);
  buf.writeUInt16LE(0xfeff, 0);
  for (let i = 0; i < json.length; i++) {
    buf.writeUInt16LE(json.charCodeAt(i), 2 + i * 2);
  }
  fs.writeFileSync(p, buf);

  expect(readTextFileAutodetect(p)).toBe(json);
});

test('readTextFileAutodetect reads UTF-8 with BOM', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barbora-encoding-'));
  const p = path.join(dir, 'x.json');
  const body = Buffer.from('{"x":true}', 'utf8');
  fs.writeFileSync(p, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]));

  expect(readTextFileAutodetect(p)).toBe('{"x":true}');
});
