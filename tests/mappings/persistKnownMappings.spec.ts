import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { loadKnownMappingsFromFile } from '../../src/mappings/knownMappings';
import {
  collectApprovedMappingEntries,
  dedupeApprovedLineIds,
  mappingEntryFromApprovedLine,
  mergeKnownMappingEntries,
  parseRunResultSummaryJson,
  persistApprovedLinesToKnownMappingsFile,
} from '../../src/mappings/persistKnownMappings';
import type { RunResultSummary } from '../../src/run/runTypes';

const BAR = 'https://www.barbora.lv/produkti/test-product';

function writeTempJson(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barbora-persist-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function minimalSummary(lines: RunResultSummary['lines']): RunResultSummary {
  return {
    runId: 'run-test',
    lines,
    checkoutHandoffReached: false,
    handoffMessage: 'x',
  };
}

test('mergeKnownMappingEntries appends when no key collision', () => {
  const a = { matchKeys: ['piens'], aliases: [] as string[], barboraProductRef: `${BAR}-a` };
  const b = { matchKeys: ['maize'], aliases: [] as string[], barboraProductRef: `${BAR}-b` };
  expect(mergeKnownMappingEntries([a], [b])).toEqual([a, b]);
});

test('mergeKnownMappingEntries replaces first colliding entry', () => {
  const oldRow = { matchKeys: ['Piens 2l'], aliases: [] as string[], barboraProductRef: `${BAR}-old` };
  const other = { matchKeys: ['maize'], aliases: [] as string[], barboraProductRef: `${BAR}-other` };
  const neu = {
    matchKeys: ['piens 2l'],
    aliases: [] as string[],
    barboraProductRef: `${BAR}-new`,
    displayName: 'New',
  };
  const merged = mergeKnownMappingEntries([oldRow, other], [neu]);
  expect(merged).toHaveLength(2);
  expect(merged[0]).toEqual(neu);
  expect(merged[1]).toEqual(other);
});

test('mergeKnownMappingEntries second incoming collides with first incoming after it was appended', () => {
  const existing = [{ matchKeys: ['x'], aliases: [] as string[], barboraProductRef: `${BAR}-x` }];
  const first = { matchKeys: ['a'], aliases: [] as string[], barboraProductRef: `${BAR}-a` };
  const second = { matchKeys: ['a'], aliases: [] as string[], barboraProductRef: `${BAR}-a2` };
  const merged = mergeKnownMappingEntries(existing, [first, second]);
  expect(merged.map((m) => m.barboraProductRef)).toEqual([`${BAR}-x`, `${BAR}-a2`]);
});

test('mappingEntryFromApprovedLine skips known_mapping unless flag', () => {
  const line = {
    lineId: '1',
    outcome: 'added' as const,
    userMessage: 'ok',
    query: 'piens',
    barboraLabel: 'T',
    barboraProductRef: BAR,
    resolutionSource: 'known_mapping' as const,
  };
  expect(mappingEntryFromApprovedLine(line, { includeKnownMappingHits: false }).ok).toBe(false);
  const withFlag = mappingEntryFromApprovedLine(line, { includeKnownMappingHits: true });
  expect(withFlag.ok).toBe(true);
  if (withFlag.ok) {
    expect(withFlag.entry.matchKeys).toEqual(['piens']);
    expect(withFlag.entry.barboraProductRef).toBe(BAR);
  }
});

test('collectApprovedMappingEntries respects eligibility', () => {
  const summary = minimalSummary([
    {
      lineId: '1',
      outcome: 'added',
      userMessage: 'ok',
      query: 'q1',
      barboraLabel: 'L1',
      barboraProductRef: BAR,
      resolutionSource: 'deterministic',
    },
    {
      lineId: '2',
      outcome: 'review_needed',
      userMessage: 'check',
      query: 'q2',
    },
  ]);
  const { entries, outcomes } = collectApprovedMappingEntries(summary, ['1', '2', '99'], {
    includeKnownMappingHits: false,
  });
  expect(entries).toHaveLength(1);
  expect(outcomes).toHaveLength(3);
  expect(outcomes[0]?.status).toBe('persisted');
  expect(outcomes[1]?.status).toBe('skipped');
  expect(outcomes[2]?.status).toBe('skipped');
});

test('dedupeApprovedLineIds preserves first occurrence order', () => {
  expect(dedupeApprovedLineIds([' 2 ', '1', '2', '1'])).toEqual(['2', '1']);
});

test('parseRunResultSummaryJson rejects invalid root', () => {
  expect(parseRunResultSummaryJson(null)).toBeNull();
  expect(parseRunResultSummaryJson({ lines: [] })).toBeNull();
  expect(parseRunResultSummaryJson({ lines: [], checkoutHandoffReached: true })).not.toBeNull();
});

test('persistApprovedLinesToKnownMappingsFile dryRun does not write', () => {
  const runPath = writeTempJson(
    'run.json',
    JSON.stringify(
      minimalSummary([
        {
          lineId: '1',
          outcome: 'added',
          userMessage: 'ok',
          query: 'piens',
          barboraLabel: 'Tere',
          barboraProductRef: BAR,
          resolutionSource: 'deterministic',
        },
      ]),
    ),
  );
  const dir = path.dirname(runPath);
  const km = path.join(dir, 'known-mappings.json');
  const { written } = persistApprovedLinesToKnownMappingsFile({
    runJsonPath: runPath,
    knownMappingsPath: km,
    approvedLineIds: ['1'],
    dryRun: true,
    includeKnownMappingHits: false,
  });
  expect(written).toBe(false);
  expect(fs.existsSync(km)).toBe(false);
});

test('persistApprovedLinesToKnownMappingsFile writes and loadKnownMappingsFromFile accepts', () => {
  const runPath = writeTempJson(
    'run.json',
    JSON.stringify(
      minimalSummary([
        {
          lineId: '1',
          outcome: 'added',
          userMessage: 'ok',
          query: 'piens 2l',
          barboraLabel: 'Tere piens',
          barboraProductRef: BAR,
          resolutionSource: 'deterministic',
        },
      ]),
    ),
  );
  const dir = path.dirname(runPath);
  const km = path.join(dir, 'known-mappings.json');

  const { written } = persistApprovedLinesToKnownMappingsFile({
    runJsonPath: runPath,
    knownMappingsPath: km,
    approvedLineIds: ['1'],
    dryRun: false,
    includeKnownMappingHits: false,
  });
  expect(written).toBe(true);

  const store = loadKnownMappingsFromFile(km);
  expect(store.mappings).toHaveLength(1);
  expect(store.mappings[0]!.matchKeys).toEqual(['piens 2l']);
  expect(store.mappings[0]!.displayName).toBe('Tere piens');
});

test('persist CLI exits non-zero when --lines is missing', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const script = path.join(repoRoot, 'scripts', 'persist-known-mappings.ts');
  const tmpRun = writeTempJson('run.json', JSON.stringify(minimalSummary([])));
  let exited = false;
  try {
    execSync(`npx tsx "${script}" --run "${tmpRun}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e: unknown) {
    exited = true;
    const err = e as { status: number | null };
    expect(err.status).toBe(1);
  }
  expect(exited).toBe(true);
});
