/**
 * Deterministic resolver v1: picks at most one SearchCandidate from Barbora SERP data.
 *
 * Rules (read in order):
 * 1. Only candidates with a non-empty productUrl are considered.
 * 2. Text: lowercase, trim, collapse whitespace, replace non letter/number marks with spaces (Unicode-aware).
 * 3. Query tokens: split normalized query on spaces (empty segments dropped).
 * 4. Score per candidate title: if normalized full query is a substring of normalized title, score =
 *    QUERY_SUBSTRING_BONUS (1_000_000) + count of query tokens that appear as substrings in the title;
 *    else score = that token hit count only.
 * 5. If there are no usable candidates → review_needed.
 * 6. If the best score is 0 → review_needed (weak match).
 * 7. If more than one candidate shares the best score → review_needed (ambiguous).
 * 8. Otherwise → add the unique best-scoring candidate.
 *
 * Known mapping (optional): if `knownProduct` is present with a valid Barbora product URL,
 * returns `add` with a synthetic candidate immediately (before SERP rules). No LLM, no substitution.
 */

import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';
import type { SearchCandidate } from '../executor/searchCandidate';
import { normalizeForMatch } from './normalizeForMatch';

export type SearchCandidateWithUrl = SearchCandidate & { productUrl: string };

export type ResolveShoppingLineResult =
  | { decision: 'add'; candidate: SearchCandidateWithUrl; reason: string }
  | { decision: 'review_needed'; reason: string };

export interface ResolveShoppingLineKnownProduct {
  productUrl: string;
  /** Shown as candidate title / barboraLabel when not from SERP */
  displayName?: string;
}

export interface ResolveShoppingLineInput {
  query: string;
  candidates: SearchCandidate[];
  /** When set and URL is valid, skips SERP candidate selection */
  knownProduct?: ResolveShoppingLineKnownProduct;
}

/** Separates full-query substring matches from token-only scores. */
const QUERY_SUBSTRING_BONUS = 1_000_000;

export const RESOLVER_REASON_ADD = 'Best match: title overlap with your search.';
export const RESOLVER_REASON_AMBIGUOUS = 'Several equally good matches; choose on Barbora.';
export const RESOLVER_REASON_WEAK = 'No strong title match; refine search or choose on Barbora.';
export const RESOLVER_REASON_NO_PRODUCT_URLS =
  'No product links in search results; choose on Barbora.';
export const RESOLVER_REASON_QUERY_EMPTY_AFTER_NORMALIZE =
  'Search text is empty after cleanup; try a clearer product name.';
export const RESOLVER_REASON_KNOWN_MAPPING =
  'Using saved Barbora product link for this list line (known-mappings.json).';
export const RESOLVER_REASON_KNOWN_MAPPING_INVALID_URL =
  'Saved product link is not a valid Barbora URL; cannot use known mapping.';

function queryTokens(normalizedQuery: string): string[] {
  return normalizedQuery.split(' ').filter((t) => t.length > 0);
}

function scoreTitle(normalizedQuery: string, tokens: string[], normalizedTitle: string): number {
  let tokenHits = 0;
  for (const t of tokens) {
    if (normalizedTitle.includes(t)) tokenHits += 1;
  }
  if (normalizedQuery.length > 0 && normalizedTitle.includes(normalizedQuery)) {
    return QUERY_SUBSTRING_BONUS + tokenHits;
  }
  return tokenHits;
}

function usableCandidates(candidates: SearchCandidate[]): SearchCandidateWithUrl[] {
  return candidates.filter(
    (c): c is SearchCandidateWithUrl =>
      c.productUrl != null && typeof c.productUrl === 'string' && c.productUrl.trim().length > 0,
  );
}

/**
 * Deterministic resolution for one shopping line and its search candidates.
 * Caller must pass a non-empty trimmed query (orchestration usually skips empty lines earlier).
 */
export function resolveShoppingLine(input: ResolveShoppingLineInput): ResolveShoppingLineResult {
  const normalizedQuery = normalizeForMatch(input.query);
  if (normalizedQuery.length === 0) {
    return { decision: 'review_needed', reason: RESOLVER_REASON_QUERY_EMPTY_AFTER_NORMALIZE };
  }

  if (input.knownProduct != null) {
    const urlResult = validateBarboraProductUrl(input.knownProduct.productUrl);
    if (!urlResult.ok) {
      return { decision: 'review_needed', reason: RESOLVER_REASON_KNOWN_MAPPING_INVALID_URL };
    }
    const title =
      input.knownProduct.displayName != null && input.knownProduct.displayName.trim().length > 0
        ? input.knownProduct.displayName.trim()
        : '(known mapping)';
    const candidate: SearchCandidateWithUrl = {
      index: 0,
      title,
      productUrl: urlResult.productUrl,
      priceText: null,
      packSizeText: null,
    };
    return { decision: 'add', candidate, reason: RESOLVER_REASON_KNOWN_MAPPING };
  }

  const tokens = queryTokens(normalizedQuery);
  const usable = usableCandidates(input.candidates);
  if (usable.length === 0) {
    return { decision: 'review_needed', reason: RESOLVER_REASON_NO_PRODUCT_URLS };
  }

  const scored = usable.map((candidate) => ({
    candidate,
    score: scoreTitle(normalizedQuery, tokens, normalizeForMatch(candidate.title)),
  }));

  let best = scored[0]!.score;
  for (const row of scored) {
    if (row.score > best) best = row.score;
  }

  if (best === 0) {
    return { decision: 'review_needed', reason: RESOLVER_REASON_WEAK };
  }

  const atBest = scored.filter((row) => row.score === best);
  if (atBest.length !== 1) {
    return { decision: 'review_needed', reason: RESOLVER_REASON_AMBIGUOUS };
  }

  return {
    decision: 'add',
    candidate: atBest[0]!.candidate,
    reason: RESOLVER_REASON_ADD,
  };
}
