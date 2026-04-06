/**
 * Merge approved cart-prep lines into known-mappings.json (TASK-011).
 *
 * Merge rule: for each new entry in order, if any normalized matchKey or alias collides with any
 * normalized key on an existing entry, replace the first such existing row; otherwise append.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';
import { normalizeForMatch } from '../resolver/normalizeForMatch';
import { readTextFileAutodetect } from '../text/readTextFileAutodetect';
import { transliterateLatvianToAscii } from '../text/transliterateLatvianToAscii';
import type { RunLineResult, RunResultSummary } from '../run/runTypes';
import type { KnownBarboraProductMappingEntry } from './knownMappings';
import { loadKnownMappingsFromFile } from './knownMappings';

export interface PersistLineOutcome {
  lineId: string;
  status: 'persisted' | 'skipped';
  reason?: string;
}

function normalizedKeySet(entry: KnownBarboraProductMappingEntry): Set<string> {
  const set = new Set<string>();
  for (const k of [...entry.matchKeys, ...entry.aliases]) {
    const n = normalizeForMatch(k);
    if (n.length > 0) set.add(n);
  }
  return set;
}

/** True if any normalized match key or alias overlaps between the two entries. */
export function entriesNormalizedKeysCollide(
  a: KnownBarboraProductMappingEntry,
  b: KnownBarboraProductMappingEntry,
): boolean {
  const sa = normalizedKeySet(a);
  const sb = normalizedKeySet(b);
  for (const x of sa) {
    if (sb.has(x)) return true;
  }
  return false;
}

/**
 * Applies incoming entries in order: each replaces the first existing entry that collides on normalized
 * keys, or is appended.
 */
export function mergeKnownMappingEntries(
  existing: KnownBarboraProductMappingEntry[],
  incoming: KnownBarboraProductMappingEntry[],
): KnownBarboraProductMappingEntry[] {
  const out = [...existing];
  for (const neu of incoming) {
    const idx = out.findIndex((e) => entriesNormalizedKeysCollide(e, neu));
    if (idx >= 0) out[idx] = neu;
    else out.push(neu);
  }
  return out;
}

export function parseRunResultSummaryJson(parsed: unknown): RunResultSummary | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (!Array.isArray(o.lines)) return null;
  if (typeof o.checkoutHandoffReached !== 'boolean') return null;

  const lines: RunLineResult[] = [];
  for (const row of o.lines) {
    if (row === null || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    if (typeof r.lineId !== 'string' || typeof r.outcome !== 'string' || typeof r.userMessage !== 'string') {
      return null;
    }
    if (r.outcome !== 'added' && r.outcome !== 'skipped' && r.outcome !== 'review_needed') return null;
    lines.push(r as unknown as RunLineResult);
  }

  return {
    runId: typeof o.runId === 'string' ? o.runId : undefined,
    lines,
    checkoutHandoffReached: o.checkoutHandoffReached,
    handoffMessage: typeof o.handoffMessage === 'string' ? o.handoffMessage : undefined,
  };
}

export function dedupeApprovedLineIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const t = raw.trim();
    if (t.length === 0 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function mappingEntryFromApprovedLine(
  line: RunLineResult,
  options: { includeKnownMappingHits: boolean },
): { ok: true; entry: KnownBarboraProductMappingEntry } | { ok: false; reason: string } {
  if (line.outcome !== 'added') {
    return { ok: false, reason: `outcome is "${line.outcome}", expected added` };
  }
  if (line.resolutionSource === 'known_mapping' && !options.includeKnownMappingHits) {
    return {
      ok: false,
      reason: 'resolutionSource is known_mapping (pass --include-known-mapping-hits to persist)',
    };
  }
  const query = line.query?.trim() ?? '';
  if (query.length === 0) {
    return {
      ok: false,
      reason: 'missing query on run line (re-run cart-prep with a build that records query on each line)',
    };
  }
  const label = line.barboraLabel?.trim() ?? '';
  if (label.length === 0) {
    return { ok: false, reason: 'missing barboraLabel' };
  }
  const rawRef = line.barboraProductRef?.trim() ?? '';
  if (rawRef.length === 0) {
    return { ok: false, reason: 'missing barboraProductRef (re-run cart-prep with a build that records product URLs)' };
  }
  const urlCheck = validateBarboraProductUrl(rawRef);
  if (!urlCheck.ok) {
    return { ok: false, reason: `invalid barboraProductRef: ${urlCheck.message}` };
  }
  const keyAscii = transliterateLatvianToAscii(query);
  const displayAscii = transliterateLatvianToAscii(label);
  return {
    ok: true,
    entry: {
      matchKeys: [keyAscii],
      aliases: [],
      barboraProductRef: urlCheck.productUrl,
      displayName: displayAscii,
    },
  };
}

export function collectApprovedMappingEntries(
  summary: RunResultSummary,
  approvedLineIds: string[],
  options: { includeKnownMappingHits: boolean },
): { entries: KnownBarboraProductMappingEntry[]; outcomes: PersistLineOutcome[] } {
  const ids = dedupeApprovedLineIds(approvedLineIds);
  const idToLine = new Map(summary.lines.map((l) => [l.lineId, l]));
  const entries: KnownBarboraProductMappingEntry[] = [];
  const outcomes: PersistLineOutcome[] = [];

  for (const id of ids) {
    const line = idToLine.get(id);
    if (line == null) {
      outcomes.push({ lineId: id, status: 'skipped', reason: 'no line with this lineId in run summary' });
      continue;
    }
    const built = mappingEntryFromApprovedLine(line, options);
    if (!built.ok) {
      outcomes.push({ lineId: id, status: 'skipped', reason: built.reason });
      continue;
    }
    entries.push(built.entry);
    outcomes.push({ lineId: id, status: 'persisted' });
  }

  return { entries, outcomes };
}

export function writeKnownMappingsStoreAtomic(filePath: string, store: { mappings: KnownBarboraProductMappingEntry[] }): void {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  const payload = `${JSON.stringify(store, null, 2)}\n`;
  const tmp = path.join(dir, `.known-mappings.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, payload, 'utf8');
  try {
    fs.renameSync(tmp, resolved);
  } catch {
    try {
      fs.unlinkSync(resolved);
    } catch {
      /* ignore */
    }
    fs.renameSync(tmp, resolved);
  }
}

export interface PersistToKnownMappingsFileOptions {
  runJsonPath: string;
  knownMappingsPath: string;
  approvedLineIds: string[];
  dryRun: boolean;
  includeKnownMappingHits: boolean;
}

export function persistApprovedLinesToKnownMappingsFile(
  options: PersistToKnownMappingsFileOptions,
): { outcomes: PersistLineOutcome[]; written: boolean; mergedMappings: KnownBarboraProductMappingEntry[] } {
  const resolvedRun = path.resolve(options.runJsonPath);
  let text: string;
  try {
    text = readTextFileAutodetect(resolvedRun);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`cannot read run file (${resolvedRun}): ${msg}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`invalid JSON in run file (${resolvedRun}): ${msg}`);
  }
  const summary = parseRunResultSummaryJson(parsed);
  if (summary == null) {
    throw new Error(`run file is not a valid RunResultSummary (${resolvedRun})`);
  }

  const { entries, outcomes } = collectApprovedMappingEntries(summary, options.approvedLineIds, {
    includeKnownMappingHits: options.includeKnownMappingHits,
  });

  const resolvedMappingsPath = path.resolve(options.knownMappingsPath);
  const prior = loadKnownMappingsFromFile(resolvedMappingsPath);
  const mergedMappings = mergeKnownMappingEntries(prior.mappings, entries);

  const shouldWrite = !options.dryRun && entries.length > 0;
  if (shouldWrite) {
    writeKnownMappingsStoreAtomic(resolvedMappingsPath, { mappings: mergedMappings });
  }

  return { outcomes, written: shouldWrite, mergedMappings };
}
