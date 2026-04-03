import type { SearchCandidate } from '../executor/searchCandidate';
import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';
import type { ResolverReviewReasonCode } from '../resolver/resolveShoppingLine';
import type { LlmFallbackReasonCode, LlmResolveInput, LlmUserPayload } from './llmTypes';

const DEFAULT_MAX_LLM_CANDIDATES = 6;

/**
 * True when normalized form adds information beyond trivial trim/lowercase/space collapse.
 */
export function normalizedQueryAddsValue(query: string, normalizedQuery: string): boolean {
  const rough = query
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return normalizedQuery !== rough;
}

function isUsableCandidate(c: SearchCandidate): boolean {
  const u = c.productUrl?.trim();
  if (!u) return false;
  return validateBarboraProductUrl(u).ok;
}

/**
 * Usable candidates (valid Barbora HTTPS product URL), first maxN in SERP order.
 * Cart prep passes its run `topN` here so the LLM sees the same breadth as search + resolver.
 */
export function buildLlmCandidateSlice(
  candidates: SearchCandidate[],
  maxN: number = DEFAULT_MAX_LLM_CANDIDATES,
): SearchCandidate[] {
  const cap = Math.max(1, maxN);
  const out: SearchCandidate[] = [];
  for (const c of candidates) {
    if (!isUsableCandidate(c)) continue;
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

export function buildLlmUserPayload(input: LlmResolveInput): LlmUserPayload {
  const payload: LlmUserPayload = {
    query: input.query,
    reasonCode: input.reasonCode,
    candidates: input.candidates.map((c, index) => ({
      index,
      title: c.title,
      priceText: c.priceText,
      packSizeText: c.packSizeText,
    })),
  };
  if (normalizedQueryAddsValue(input.query, input.normalizedQuery)) {
    payload.normalizedQuery = input.normalizedQuery;
  }
  return payload;
}

export function llmFallbackEligibleReason(
  reasonCode: ResolverReviewReasonCode,
): reasonCode is LlmFallbackReasonCode {
  return reasonCode === 'ambiguous_match' || reasonCode === 'weak_match';
}
