/**
 * Run result types for orchestrated cart-prep (MVP vertical slice).
 * Aligns with docs/specs/data-model.md §5 and docs/specs/run-summary.md.
 * This slice emits only added | skipped | review_needed (no substituted until real substitution exists).
 */

import type { ResolverReviewReasonCode } from '../resolver/resolveShoppingLine';

export type LineOutcome = 'added' | 'skipped' | 'review_needed';

export type ResolutionSource = 'known_mapping' | 'deterministic' | 'llm_fallback';

export interface RunLineResult {
  lineId: string;
  outcome: LineOutcome;
  userMessage: string;
  barboraLabel?: string;
  quantityAdded?: number;
  /** Set only when outcome is added; which path selected the product. */
  resolutionSource?: ResolutionSource;
  /** Set only when outcome is review_needed from the deterministic resolver (not search/executor errors). */
  reviewReasonCode?: ResolverReviewReasonCode;
}

export interface RunResultSummary {
  runId?: string;
  lines: RunLineResult[];
  checkoutHandoffReached: boolean;
  handoffMessage?: string;
}
