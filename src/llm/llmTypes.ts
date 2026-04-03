import type { SearchCandidate } from '../executor/searchCandidate';
import type { SearchCandidateWithUrl } from '../resolver/resolveShoppingLine';

export type LlmFallbackReasonCode = 'ambiguous_match' | 'weak_match';

export interface LlmResolveInput {
  query: string;
  normalizedQuery: string;
  reasonCode: LlmFallbackReasonCode;
  /**
   * Usable SERP rows (non-empty productUrl), capped; order defines 0-based indices for the model.
   */
  candidates: SearchCandidate[];
}

/** JSON sent inside the user message (no product URLs). */
export interface LlmUserPayload {
  query: string;
  normalizedQuery?: string;
  reasonCode: LlmFallbackReasonCode;
  candidates: Array<{
    index: number;
    title: string;
    priceText: string | null;
    packSizeText: string | null;
  }>;
}

export interface LlmStructuredResponse {
  decision: 'choose' | 'review_needed';
  chosenIndex: number | null;
  explanation?: string;
}

export type LlmJsonComplete = (systemPrompt: string, userContent: string) => Promise<string | null>;

export type LlmResolveFn = (input: LlmResolveInput) => Promise<SearchCandidateWithUrl | null>;
