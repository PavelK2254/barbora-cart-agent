/**
 * Known Barbora product mappings (known-mappings.json): load, lookup, and parse validation.
 * Writes are performed only by `persistKnownMappings.ts` (explicit CLI approval workflow).
 */

import * as fs from 'node:fs';

import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';
import { normalizeForMatch } from '../resolver/normalizeForMatch';

const LOG = '[known-mappings]';

export interface KnownBarboraProductMappingEntry {
  matchKeys: string[];
  aliases: string[];
  barboraProductRef: string;
  displayName?: string;
}

export interface KnownMappingsStore {
  mappings: KnownBarboraProductMappingEntry[];
}

function warn(message: string): void {
  console.error(`${LOG} ${message}`);
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

function parseEntry(raw: unknown, index: number): KnownBarboraProductMappingEntry | null {
  if (raw === null || typeof raw !== 'object') {
    warn(`skipped mappings[${index}]: not an object`);
    return null;
  }
  const o = raw as Record<string, unknown>;
  const ref = o.barboraProductRef;
  if (!isNonEmptyString(ref)) {
    warn(`skipped mappings[${index}]: missing or empty barboraProductRef`);
    return null;
  }
  const urlCheck = validateBarboraProductUrl(ref);
  if (!urlCheck.ok) {
    warn(`skipped mappings[${index}]: invalid barboraProductRef (${urlCheck.message})`);
    return null;
  }
  const mk = o.matchKeys;
  if (!Array.isArray(mk) || mk.length === 0 || !mk.every(isNonEmptyString)) {
    warn(`skipped mappings[${index}]: matchKeys must be a non-empty array of non-empty strings`);
    return null;
  }
  const aliasesRaw = o.aliases;
  let aliases: string[] = [];
  if (aliasesRaw !== undefined) {
    if (!Array.isArray(aliasesRaw) || !aliasesRaw.every(isNonEmptyString)) {
      warn(`skipped mappings[${index}]: aliases must be an array of non-empty strings when present`);
      return null;
    }
    aliases = aliasesRaw.map((s) => s.trim());
  }
  const displayName =
    o.displayName !== undefined && isNonEmptyString(o.displayName) ? o.displayName.trim() : undefined;

  return {
    matchKeys: mk.map((s) => s.trim()),
    aliases,
    barboraProductRef: urlCheck.productUrl,
    displayName,
  };
}

/**
 * Loads mappings from a JSON file. Missing file → empty store.
 * Invalid JSON → stderr + empty store (run continues).
 * Invalid rows → skipped with stderr warnings.
 */
export function loadKnownMappingsFromFile(filePath: string): KnownMappingsStore {
  if (!fs.existsSync(filePath)) {
    return { mappings: [] };
  }
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`cannot read file (${filePath}): ${msg} — continuing with no mappings`);
    return { mappings: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`invalid JSON (${filePath}): ${msg} — continuing with no mappings`);
    return { mappings: [] };
  }
  if (parsed === null || typeof parsed !== 'object' || !('mappings' in parsed)) {
    warn(`invalid shape: root must be an object with "mappings" array (${filePath}) — continuing with no mappings`);
    return { mappings: [] };
  }
  const mappingsRaw = (parsed as { mappings: unknown }).mappings;
  if (!Array.isArray(mappingsRaw)) {
    warn(`invalid shape: "mappings" must be an array (${filePath}) — continuing with no mappings`);
    return { mappings: [] };
  }

  const mappings: KnownBarboraProductMappingEntry[] = [];
  for (let i = 0; i < mappingsRaw.length; i++) {
    const entry = parseEntry(mappingsRaw[i], i);
    if (entry != null) {
      mappings.push(entry);
    }
  }
  return { mappings };
}

/**
 * First entry in file order whose normalized matchKeys or aliases equals normalizedQuery.
 */
export function findMappingForNormalizedQuery(
  store: KnownMappingsStore,
  normalizedQuery: string,
): KnownBarboraProductMappingEntry | null {
  if (normalizedQuery.length === 0) {
    return null;
  }
  for (const entry of store.mappings) {
    const keys = [...entry.matchKeys, ...entry.aliases].map((k) => normalizeForMatch(k));
    if (keys.includes(normalizedQuery)) {
      return entry;
    }
  }
  return null;
}
