/**
 * Run result types for orchestrated cart-prep (MVP vertical slice).
 * Aligns with docs/specs/data-model.md §5 and docs/specs/run-summary.md.
 * This slice emits only added | skipped | review_needed (no substituted until real substitution exists).
 */

export type LineOutcome = 'added' | 'skipped' | 'review_needed';

export interface RunLineResult {
  lineId: string;
  outcome: LineOutcome;
  userMessage: string;
  barboraLabel?: string;
  quantityAdded?: number;
}

export interface RunResultSummary {
  runId?: string;
  lines: RunLineResult[];
  checkoutHandoffReached: boolean;
  handoffMessage?: string;
}
