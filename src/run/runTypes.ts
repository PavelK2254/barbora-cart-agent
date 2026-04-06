/**
 * Run result types for orchestrated cart-prep (MVP vertical slice).
 * Aligns with docs/specs/data-model.md §5 and docs/specs/run-summary.md.
 * This slice emits only added | skipped | review_needed (no substituted until real substitution exists).
 */

import type { LlmPostAttemptOutcome } from '../llm/llmTypes';
import type { ResolverDebugRankedRow, ResolverReviewReasonCode } from '../resolver/resolveShoppingLine';

export type LineOutcome = 'added' | 'skipped' | 'review_needed';

export type ResolutionSource = 'known_mapping' | 'deterministic' | 'llm_fallback';

/**
 * LLM path for optional per-line debug (TASK-019+).
 * `no_choice` is only a pre-attempt placeholder; after a real LLM call, use `LlmPostAttemptOutcome` values.
 */
export type LlmDebugOutcome =
  | 'not_configured'
  | 'skipped_ineligible'
  | 'skipped_no_candidates'
  | 'no_choice'
  | 'chose'
  | LlmPostAttemptOutcome;

/**
 * Optional structured decision debug for developers; omitted unless cart-prep runs with debug enabled.
 * No Playwright/browser internals.
 */
export interface LineResolutionDebug {
  knownMappingHit: boolean;
  knownMappingInvalidFallbackToSearch?: boolean;
  serpCandidateCount: number;
  usableCandidateCount: number;
  /** From deterministic resolver when review_needed or when SERP scoring ran. */
  deterministicReasonCode?: ResolverReviewReasonCode;
  /** Top candidates by score after SERP scoring (max 5); absent when known-mapping shortcut or no scoring. */
  rankedCandidates?: ResolverDebugRankedRow[];
  llmEligible: boolean;
  llmAttempted: boolean;
  llmOutcome: LlmDebugOutcome;
}

export interface RunLineResult {
  lineId: string;
  outcome: LineOutcome;
  userMessage: string;
  /** Shopping-line search text (trimmed); ASCII transliteration of Latvian letters for stable JSON. */
  query?: string;
  barboraLabel?: string;
  quantityAdded?: number;
  /** Canonical Barbora product URL when outcome is added and URL was validated for add-to-cart. */
  barboraProductRef?: string;
  /** Set only when outcome is added; which path selected the product. */
  resolutionSource?: ResolutionSource;
  /** Set only when outcome is review_needed from the deterministic resolver (not search/executor errors). */
  reviewReasonCode?: ResolverReviewReasonCode;
  /** Present only when cart-prep `includeDebug` is true. */
  lineDebug?: LineResolutionDebug;
}

export interface RunResultSummary {
  runId?: string;
  lines: RunLineResult[];
  checkoutHandoffReached: boolean;
  handoffMessage?: string;
}
