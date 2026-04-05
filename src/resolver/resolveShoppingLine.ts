/**
 * Deterministic resolver v2: picks at most one SearchCandidate from Barbora SERP data.
 *
 * Signal order (see named constants below; higher contribution wins when comparing candidates):
 * 1. SCORE_PHRASE_BASE — normalized query equals a contiguous run of whole title tokens (avoids
 *    substring matches inside unrelated words, e.g. `piens` inside `bezpiens`).
 * 2. SCORE_PER_WORD_MATCH — each query token that exactly equals a title token (word boundary).
 * 3. BONUS_PACK_HINT_MATCH / BONUS_PACK_HINT_FROM_CARD — query contains an explicit l/ml/kg/g hint
 *    and the candidate title (or gated packSizeText) matches that hint.
 * 4. PENALTY_PACK_HINT_CONFLICT — subtract SCORE_PHRASE_BASE when the candidate contradicts the
 *    query’s pack hint (title primary; card text only when it passes isPackSizeLikePackSizeText).
 *
 * Rules after scoring:
 * - Only candidates with a valid Barbora https product URL (see validateBarboraProductUrl) are considered.
 * - Text normalization: normalizeForMatch (Unicode letter/number, lowercase, collapsed spaces).
 * - Minimum coverage: if the query has ≥2 tokens and there is no phrase match on that candidate,
 *   require ≥2 word-token hits; otherwise that candidate’s score is 0 (weak).
 * - If there are no usable candidates → review_needed.
 * - If the query has an explicit pack hint and every usable candidate contradicts it → review_needed.
 * - If the best score is 0 → review_needed (weak).
 * - If more than one candidate shares the best score (exact integer tie) → review_needed (ambiguous).
 * - Otherwise → add the unique best-scoring candidate.
 *
 * Known mapping (optional): if `knownProduct` is present with a valid Barbora product URL,
 * returns `add` with a synthetic candidate immediately (before SERP rules). No LLM, no substitution.
 *
 * `review_needed` carries stable `reasonCode` (machine) and `detail` (internal / tests; not user copy).
 */

import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';
import type { SearchCandidate } from '../executor/searchCandidate';
import {
  isPackSizeLikePackSizeText,
  packHintsConflict,
  packHintsEqual,
  parsePrimaryPackHint,
  type PackHint,
} from './parsePackHints';
import { normalizeForMatch } from './normalizeForMatch';

export type SearchCandidateWithUrl = SearchCandidate & { productUrl: string };

/** Stable, boring codes for review_needed; user-facing text lives in cart-prep. */
export type ResolverReviewReasonCode =
  | 'query_empty'
  | 'known_mapping_invalid'
  | 'no_candidates'
  | 'no_usable_candidates'
  | 'pack_conflict'
  | 'weak_match'
  | 'ambiguous_match';

export type ResolveShoppingLineResult =
  | { decision: 'add'; candidate: SearchCandidateWithUrl }
  | { decision: 'review_needed'; reasonCode: ResolverReviewReasonCode; detail: string };

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

/** Max rows in optional resolver debug shortlist (TASK-019). */
export const RESOLVER_DEBUG_MAX_RANKED = 5;

/** Max characters for candidate titles in resolver debug output. */
export const RESOLVER_DEBUG_TITLE_MAX = 80;

export interface ResolverDebugRankedRow {
  index: number;
  score: number;
  title: string;
}

/** Decision-focused resolver debug; omits long `detail` strings. */
export interface ShoppingLineResolverDebug {
  reasonCode?: ResolverReviewReasonCode;
  rankedCandidates?: ResolverDebugRankedRow[];
}

export interface ResolveShoppingLineOptions {
  /** When true, result includes `resolverDebug` (bounded; no secrets). */
  includeResolverDebug?: boolean;
}

type ScoredCandidateRow = { candidate: SearchCandidateWithUrl; score: number };

export type ResolveShoppingLineReturn = ResolveShoppingLineResult & {
  resolverDebug?: ShoppingLineResolverDebug;
};

function truncateForResolverDebug(title: string, max: number): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

function topRankedForDebug(scored: ScoredCandidateRow[]): ResolverDebugRankedRow[] {
  return [...scored]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.candidate.index - b.candidate.index;
    })
    .slice(0, RESOLVER_DEBUG_MAX_RANKED)
    .map((row) => ({
      index: row.candidate.index,
      score: row.score,
      title: truncateForResolverDebug(row.candidate.title, RESOLVER_DEBUG_TITLE_MAX),
    }));
}

function finalizeResolve(
  includeDebug: boolean,
  result: ResolveShoppingLineResult,
  scored?: ScoredCandidateRow[],
): ResolveShoppingLineReturn {
  if (!includeDebug) return result;
  const resolverDebug: ShoppingLineResolverDebug = {};
  if (result.decision === 'review_needed') {
    resolverDebug.reasonCode = result.reasonCode;
  }
  if (scored != null && scored.length > 0) {
    resolverDebug.rankedCandidates = topRankedForDebug(scored);
  }
  return { ...result, resolverDebug };
}

/** Phrase tier dominates token-only scores; penalty uses the same magnitude to cancel it on conflict. */
const SCORE_PHRASE_BASE = 1_000_000;
const SCORE_PER_WORD_MATCH = 100;
const BONUS_PACK_HINT_MATCH = 40;
/** When title has no pack hint but gated card text matches query pack (conservative gate). */
const BONUS_PACK_HINT_FROM_CARD = 12;
const PENALTY_PACK_HINT_CONFLICT = SCORE_PHRASE_BASE;

/** Internal explanations for review_needed (tests, logs); not shown to end users. */
export const RESOLVER_REVIEW_DETAIL_QUERY_EMPTY =
  'Search text is empty after cleanup; try a clearer product name.';
export const RESOLVER_REVIEW_DETAIL_KNOWN_MAPPING_INVALID =
  'Saved product link is not a valid Barbora URL; cannot use known mapping.';
export const RESOLVER_REVIEW_DETAIL_NO_CANDIDATES = 'No search result rows were provided.';
export const RESOLVER_REVIEW_DETAIL_NO_USABLE_CANDIDATES =
  'No product links in search results; choose on Barbora.';
export const RESOLVER_REVIEW_DETAIL_PACK_CONFLICT =
  'Pack size in results does not match your search; choose on Barbora.';
export const RESOLVER_REVIEW_DETAIL_WEAK =
  'No strong title match; refine search or choose on Barbora.';
export const RESOLVER_REVIEW_DETAIL_AMBIGUOUS =
  'Several equally good matches; choose on Barbora.';

function queryTokens(normalizedQuery: string): string[] {
  return normalizedQuery.split(' ').filter((t) => t.length > 0);
}

function titleWordTokens(normalizedTitle: string): string[] {
  return normalizedTitle.split(' ').filter((t) => t.length > 0);
}

function countWordTokenMatches(queryToks: string[], titleToks: string[]): number {
  const set = new Set(titleToks);
  let n = 0;
  for (const t of queryToks) {
    if (set.has(t)) n += 1;
  }
  return n;
}

/** True when normalized query equals joining a contiguous slice of title tokens. */
function hasPhraseMatch(normalizedQuery: string, titleToks: string[]): boolean {
  if (normalizedQuery.length === 0) return false;
  const n = titleToks.length;
  for (let i = 0; i < n; i++) {
    let acc = titleToks[i]!;
    if (acc === normalizedQuery) return true;
    for (let j = i + 1; j < n; j++) {
      acc += ' ' + titleToks[j]!;
      if (acc === normalizedQuery) return true;
    }
  }
  return false;
}

function candidateConflictsWithQueryPack(
  queryHint: PackHint,
  titleNorm: string,
  packSizeText: string | null,
): boolean {
  const titleHint = parsePrimaryPackHint(titleNorm);
  if (titleHint != null) {
    return packHintsConflict(queryHint, titleHint);
  }
  if (!isPackSizeLikePackSizeText(packSizeText)) return false;
  const gatedHint = parsePrimaryPackHint(normalizeForMatch(packSizeText!));
  if (gatedHint == null) return false;
  return packHintsConflict(queryHint, gatedHint);
}

function scoreCandidate(
  normalizedQuery: string,
  queryToks: string[],
  queryHint: PackHint | null,
  titleNorm: string,
  packSizeText: string | null,
): number {
  const titleToks = titleWordTokens(titleNorm);
  const phrase = hasPhraseMatch(normalizedQuery, titleToks);
  const wordMatches = countWordTokenMatches(queryToks, titleToks);

  if (queryToks.length >= 2 && !phrase && wordMatches < 2) {
    return 0;
  }

  let score = phrase ? SCORE_PHRASE_BASE : 0;
  score += wordMatches * SCORE_PER_WORD_MATCH;

  const titleHint = parsePrimaryPackHint(titleNorm);

  let packBonus = 0;
  let packPenalty = 0;
  if (queryHint != null) {
    if (titleHint != null) {
      if (packHintsConflict(queryHint, titleHint)) {
        packPenalty = PENALTY_PACK_HINT_CONFLICT;
      } else if (packHintsEqual(queryHint, titleHint)) {
        packBonus += BONUS_PACK_HINT_MATCH;
      }
    } else if (isPackSizeLikePackSizeText(packSizeText)) {
      const gatedHint = parsePrimaryPackHint(normalizeForMatch(packSizeText!));
      if (gatedHint != null) {
        if (packHintsConflict(queryHint, gatedHint)) {
          packPenalty = PENALTY_PACK_HINT_CONFLICT;
        } else if (packHintsEqual(queryHint, gatedHint)) {
          packBonus += BONUS_PACK_HINT_FROM_CARD;
        }
      }
    }
  }

  return score + packBonus - packPenalty;
}

/**
 * Candidates Barbora can add to cart and the LLM slice can list — same rules as
 * {@link validateBarboraProductUrl} (https + barbora.lv host).
 */
function usableCandidates(candidates: SearchCandidate[]): SearchCandidateWithUrl[] {
  const out: SearchCandidateWithUrl[] = [];
  for (const c of candidates) {
    const raw = c.productUrl;
    if (raw == null || typeof raw !== 'string') continue;
    const v = validateBarboraProductUrl(raw);
    if (!v.ok) continue;
    out.push({ ...c, productUrl: v.productUrl });
  }
  return out;
}

/**
 * Deterministic resolution for one shopping line and its search candidates.
 * Caller must pass a non-empty trimmed query (orchestration usually skips empty lines earlier).
 */
export function resolveShoppingLine(
  input: ResolveShoppingLineInput,
  options?: ResolveShoppingLineOptions,
): ResolveShoppingLineReturn {
  const includeDebug = options?.includeResolverDebug === true;

  const normalizedQuery = normalizeForMatch(input.query);
  if (normalizedQuery.length === 0) {
    return finalizeResolve(includeDebug, {
      decision: 'review_needed',
      reasonCode: 'query_empty',
      detail: RESOLVER_REVIEW_DETAIL_QUERY_EMPTY,
    });
  }

  if (input.knownProduct != null) {
    const urlResult = validateBarboraProductUrl(input.knownProduct.productUrl);
    if (!urlResult.ok) {
      return finalizeResolve(includeDebug, {
        decision: 'review_needed',
        reasonCode: 'known_mapping_invalid',
        detail: RESOLVER_REVIEW_DETAIL_KNOWN_MAPPING_INVALID,
      });
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
    return finalizeResolve(includeDebug, { decision: 'add', candidate });
  }

  const queryToks = queryTokens(normalizedQuery);
  const queryHint = parsePrimaryPackHint(normalizedQuery);
  const usable = usableCandidates(input.candidates);
  if (usable.length === 0) {
    if (input.candidates.length === 0) {
      return finalizeResolve(includeDebug, {
        decision: 'review_needed',
        reasonCode: 'no_candidates',
        detail: RESOLVER_REVIEW_DETAIL_NO_CANDIDATES,
      });
    }
    return finalizeResolve(includeDebug, {
      decision: 'review_needed',
      reasonCode: 'no_usable_candidates',
      detail: RESOLVER_REVIEW_DETAIL_NO_USABLE_CANDIDATES,
    });
  }

  if (queryHint != null) {
    const allConflict = usable.every((c) =>
      candidateConflictsWithQueryPack(queryHint, normalizeForMatch(c.title), c.packSizeText),
    );
    if (allConflict) {
      return finalizeResolve(includeDebug, {
        decision: 'review_needed',
        reasonCode: 'pack_conflict',
        detail: RESOLVER_REVIEW_DETAIL_PACK_CONFLICT,
      });
    }
  }

  const scored: ScoredCandidateRow[] = usable.map((candidate) => ({
    candidate,
    score: scoreCandidate(
      normalizedQuery,
      queryToks,
      queryHint,
      normalizeForMatch(candidate.title),
      candidate.packSizeText,
    ),
  }));

  let best = scored[0]!.score;
  for (const row of scored) {
    if (row.score > best) best = row.score;
  }

  if (best < 0) {
    return finalizeResolve(
      includeDebug,
      {
        decision: 'review_needed',
        reasonCode: queryHint != null ? 'pack_conflict' : 'weak_match',
        detail: queryHint != null ? RESOLVER_REVIEW_DETAIL_PACK_CONFLICT : RESOLVER_REVIEW_DETAIL_WEAK,
      },
      scored,
    );
  }

  if (best === 0) {
    return finalizeResolve(
      includeDebug,
      {
        decision: 'review_needed',
        reasonCode: 'weak_match',
        detail: RESOLVER_REVIEW_DETAIL_WEAK,
      },
      scored,
    );
  }

  const atBest = scored.filter((row) => row.score === best);
  if (atBest.length !== 1) {
    return finalizeResolve(
      includeDebug,
      {
        decision: 'review_needed',
        reasonCode: 'ambiguous_match',
        detail: RESOLVER_REVIEW_DETAIL_AMBIGUOUS,
      },
      scored,
    );
  }

  return finalizeResolve(
    includeDebug,
    {
      decision: 'add',
      candidate: atBest[0]!.candidate,
    },
    scored,
  );
}
