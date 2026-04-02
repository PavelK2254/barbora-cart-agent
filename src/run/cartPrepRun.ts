import type { Page } from '@playwright/test';

import { runBarboraAddToCartSpike } from '../executor/barboraAddToCartSpike';
import { runBarboraCheckoutHandoffSpike } from '../executor/barboraCheckoutHandoffSpike';
import { runBarboraSearchAndCollect } from '../executor/barboraSearchSpike';
import type { RunLineResult, RunResultSummary } from './runTypes';

export interface CartPrepInputLine {
  /** 1-based id as string, e.g. "1", "2" */
  lineId: string;
  /** Search query for this line */
  query: string;
}

export interface CartPrepRunOptions {
  /** 1-based index into collected search results (same semantics as spike scripts). */
  pick: number;
  /** Upper bound for how many result cards to read from the SERP. */
  topN: number;
  /** If true, run checkout handoff after all lines (still no payment). */
  attemptHandoff: boolean;
}

const SEARCH_ERR = '[barbora-search-spike]';

function makeRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)}`;
}

function outcomeFromSearchFailure(message: string): RunLineResult['outcome'] {
  return message.includes(SEARCH_ERR) ? 'review_needed' : 'skipped';
}

/**
 * Sequential cart prep: search → pick by index → add. Optional checkout handoff at the end.
 */
export async function runCartPrepRun(
  page: Page,
  inputLines: CartPrepInputLine[],
  options: CartPrepRunOptions,
): Promise<RunResultSummary> {
  const lineResults: RunLineResult[] = [];
  const topN = Math.max(1, options.topN, options.pick);

  for (const line of inputLines) {
    const q = line.query.trim();
    if (!q) {
      lineResults.push({
        lineId: line.lineId,
        outcome: 'skipped',
        userMessage: 'Empty search query for this line.',
      });
      continue;
    }

    try {
      const candidates = await runBarboraSearchAndCollect(page, { query: q, topN });
      // Naive rule (temporary): 1-based `--pick` matches spike scripts. Replace with resolver later.
      const rowAtPick = candidates.find((c) => c.index === options.pick);
      if (!rowAtPick) {
        lineResults.push({
          lineId: line.lineId,
          outcome: 'review_needed',
          userMessage: `Not enough search results for pick=${options.pick} (got ${candidates.length}). Try a different query or lower --pick.`,
        });
        continue;
      }
      if (!rowAtPick.productUrl) {
        lineResults.push({
          lineId: line.lineId,
          outcome: 'review_needed',
          userMessage: `Search result #${options.pick} has no product link ("${rowAtPick.title}"). Pick a product on Barbora or use a direct URL in a future flow.`,
        });
        continue;
      }

      const addResult = await runBarboraAddToCartSpike(page, { productUrl: rowAtPick.productUrl });
      lineResults.push({
        lineId: line.lineId,
        outcome: 'added',
        barboraLabel: rowAtPick.title,
        quantityAdded: 1,
        userMessage: addResult.message,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lineResults.push({
        lineId: line.lineId,
        outcome: outcomeFromSearchFailure(msg),
        userMessage: msg,
      });
    }
  }

  let checkoutHandoffReached = false;
  let handoffMessage: string | undefined;

  if (options.attemptHandoff) {
    try {
      const handoff = await runBarboraCheckoutHandoffSpike(page);
      checkoutHandoffReached = handoff.handoffReached;
      handoffMessage = handoff.message;
    } catch (e) {
      checkoutHandoffReached = false;
      handoffMessage = e instanceof Error ? e.message : String(e);
    }
  } else {
    checkoutHandoffReached = false;
    handoffMessage =
      'Checkout handoff was not requested. Pass --handoff to navigate to checkout after the run.';
  }

  return {
    runId: makeRunId(),
    lines: lineResults,
    checkoutHandoffReached,
    handoffMessage,
  };
}
