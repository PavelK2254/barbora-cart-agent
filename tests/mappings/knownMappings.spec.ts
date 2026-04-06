import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  findMappingForNormalizedQuery,
  loadKnownMappingsFromFile,
} from '../../src/mappings/knownMappings';
import { normalizeForMatch } from '../../src/resolver/normalizeForMatch';

function writeTempJson(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barbora-mappings-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

test('loadKnownMappingsFromFile returns empty for missing file', () => {
  const p = path.join(os.tmpdir(), `nonexistent-${Date.now()}.json`);
  const store = loadKnownMappingsFromFile(p);
  expect(store.mappings).toEqual([]);
});

test('loadKnownMappingsFromFile parses valid mappings and skips bad rows', () => {
  const p = writeTempJson(
    'm.json',
    JSON.stringify({
      mappings: [
        {
          matchKeys: ['piens 2l'],
          aliases: ['piens'],
          barboraProductRef: 'https://www.barbora.lv/produkti/x',
          displayName: 'Tere piens',
        },
        { matchKeys: [], barboraProductRef: 'https://www.barbora.lv/produkti/y' },
        { matchKeys: ['bad'], barboraProductRef: 'http://evil.com/p' },
      ],
    }),
  );
  const store = loadKnownMappingsFromFile(p);
  expect(store.mappings).toHaveLength(1);
  expect(store.mappings[0]!.matchKeys).toEqual(['piens 2l']);
  expect(store.mappings[0]!.barboraProductRef).toBe('https://www.barbora.lv/produkti/x');
});

test('loadKnownMappingsFromFile invalid JSON yields empty store', () => {
  const p = writeTempJson('bad.json', '{ not json');
  const store = loadKnownMappingsFromFile(p);
  expect(store.mappings).toEqual([]);
});

test('findMappingForNormalizedQuery matches matchKeys and aliases; first wins', () => {
  const store = loadKnownMappingsFromFile(
    writeTempJson(
      'm.json',
      JSON.stringify({
        mappings: [
          {
            matchKeys: ['a'],
            barboraProductRef: 'https://www.barbora.lv/produkti/first',
          },
          {
            matchKeys: ['a'],
            barboraProductRef: 'https://www.barbora.lv/produkti/second',
          },
          {
            matchKeys: ['other'],
            aliases: ['alias line'],
            barboraProductRef: 'https://www.barbora.lv/produkti/third',
          },
        ],
      }),
    ),
  );

  const n = normalizeForMatch('a');
  const hit = findMappingForNormalizedQuery(store, n);
  expect(hit?.barboraProductRef).toContain('/first');

  const aliasNorm = normalizeForMatch('alias line');
  expect(findMappingForNormalizedQuery(store, aliasNorm)?.barboraProductRef).toContain('/third');
});

test('findMappingForNormalizedQuery returns null when no match', () => {
  const store = { mappings: [] };
  expect(findMappingForNormalizedQuery(store, 'piens')).toBeNull();
});

test('findMappingForNormalizedQuery matches Latvian matchKey to ASCII-normalized query', () => {
  const store = loadKnownMappingsFromFile(
    writeTempJson(
      'm.json',
      JSON.stringify({
        mappings: [
          {
            matchKeys: ['piēns 2l'],
            aliases: [],
            barboraProductRef: 'https://www.barbora.lv/produkti/piens',
          },
        ],
      }),
    ),
  );
  const n = normalizeForMatch('piens 2l');
  expect(findMappingForNormalizedQuery(store, n)?.barboraProductRef).toContain('/piens');
});
