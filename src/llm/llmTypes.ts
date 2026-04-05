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

/** Provider/completion boundary only — no HTTP status, headers, or bodies. */
export type LlmJsonCompletionFailureReason =
  | 'empty_response'
  | 'rate_limited'
  | 'http_error'
  | 'error';

export type LlmJsonCompletionResult =
  | { ok: true; text: string }
  | { ok: false; reason: LlmJsonCompletionFailureReason };

export type LlmJsonComplete = (
  systemPrompt: string,
  userContent: string,
) => Promise<LlmJsonCompletionResult>;

/** Parse/validation failures only (provider empty / transport use other outcomes). */
export type LlmParseFailureReason =
  | 'model_review_needed'
  | 'invalid_json'
  | 'invalid_shape'
  | 'invalid_index'
  | 'invalid_url';

export type LlmParseResult =
  | { ok: true; candidate: SearchCandidateWithUrl }
  | { ok: false; reason: LlmParseFailureReason };

/** Outcomes after an LLM attempt (for debug); never `no_choice` (that is pre-attempt only). */
export type LlmPostAttemptOutcome = LlmParseFailureReason | LlmJsonCompletionFailureReason;

export type LlmResolveResult =
  | { status: 'chose'; candidate: SearchCandidateWithUrl }
  | { status: 'failed'; outcome: LlmPostAttemptOutcome };

export type LlmResolveFn = (input: LlmResolveInput) => Promise<LlmResolveResult>;
