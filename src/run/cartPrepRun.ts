import * as path from 'node:path';

import type { Page } from '@playwright/test';

import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';
import { runBarboraAddToCartSpike } from '../executor/barboraAddToCartSpike';
import { runBarboraCheckoutHandoffSpike } from '../executor/barboraCheckoutHandoffSpike';
import { runBarboraSearchAndCollect } from '../executor/barboraSearchSpike';
import { findMappingForNormalizedQuery, loadKnownMappingsFromFile } from '../mappings/knownMappings';
import { normalizeForMatch } from '../resolver/normalizeForMatch';
import { resolveShoppingLine } from '../resolver/resolveShoppingLine';
import {
  USER_MESSAGE_ADD_FROM_KNOWN_MAPPING,
  USER_MESSAGE_ADD_FROM_SEARCH,
  userMessageForResolverReviewReason,
} from './reviewReasonUserMessages';
import type { RunLineResult, RunResultSummary } from './runTypes';

export interface CartPrepInputLine {
  /** 1-based id as string, e.g. "1", "2" */
  lineId: string;
  /** Search query for this line */
  query: string;
}

export interface CartPrepRunOptions {
  /** Upper bound for how many result cards to read from the SERP. */
  topN: number;
  /** If true, run checkout handoff after all lines (still no payment). */
  attemptHandoff: boolean;
  /**
   * known-mappings.json path (relative to cwd unless absolute). Default: known-mappings.json in cwd.
   * Missing file loads as empty mappings.
   */
  knownMappingsPath?: string;
}

const SEARCH_ERR = '[barbora-search-spike]';

function makeRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)}`;
}

function outcomeFromSearchFailure(message: string): RunLineResult['outcome'] {
  return message.includes(SEARCH_ERR) ? 'review_needed' : 'skipped';
}

/**
 * Sequential cart prep: optional known-mapping lookup → search (if needed) → resolver → add.
 * Optional checkout handoff at the end.
 */
export async function runCartPrepRun(
  page: Page,
  inputLines: CartPrepInputLine[],
  options: CartPrepRunOptions,
): Promise<RunResultSummary> {
  const lineResults: RunLineResult[] = [];
  const topN = Math.max(1, options.topN);
  const mappingsFile = path.resolve(process.cwd(), options.knownMappingsPath ?? 'known-mappings.json');
  const mappingStore = loadKnownMappingsFromFile(mappingsFile);

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
      const normalizedQuery = normalizeForMatch(q);
      const mappingHit = findMappingForNormalizedQuery(mappingStore, normalizedQuery);

      let mappingFallbackNote: string | undefined;
      let resolvedFromKnownMapping = false;
      let resolved;

      if (mappingHit != null) {
        const urlCheck = validateBarboraProductUrl(mappingHit.barboraProductRef);
        if (urlCheck.ok) {
          resolvedFromKnownMapping = true;
          resolved = resolveShoppingLine({
            query: q,
            candidates: [],
            knownProduct: {
              productUrl: urlCheck.productUrl,
              displayName: mappingHit.displayName,
            },
          });
        } else {
          mappingFallbackNote = `Saved product link is invalid; used Barbora search instead. (${urlCheck.message})`;
          console.error(
            `[known-mappings] line ${line.lineId} (${q.slice(0, 80)}): ${mappingFallbackNote}`,
          );
          const candidates = await runBarboraSearchAndCollect(page, { query: q, topN });
          resolved = resolveShoppingLine({ query: q, candidates });
        }
      } else {
        const candidates = await runBarboraSearchAndCollect(page, { query: q, topN });
        resolved = resolveShoppingLine({ query: q, candidates });
      }

      if (resolved.decision === 'review_needed') {
        const reviewText = userMessageForResolverReviewReason(resolved.reasonCode);
        const userMessage = [mappingFallbackNote, reviewText].filter(Boolean).join(' ');
        lineResults.push({
          lineId: line.lineId,
          outcome: 'review_needed',
          userMessage,
          reviewReasonCode: resolved.reasonCode,
        });
        continue;
      }

      const addResult = await runBarboraAddToCartSpike(page, {
        productUrl: resolved.candidate.productUrl,
      });
      const addPrefix = resolvedFromKnownMapping
        ? USER_MESSAGE_ADD_FROM_KNOWN_MAPPING
        : USER_MESSAGE_ADD_FROM_SEARCH;
      const addMsg = `${addPrefix} ${addResult.message}`.trim();
      lineResults.push({
        lineId: line.lineId,
        outcome: 'added',
        barboraLabel: resolved.candidate.title,
        quantityAdded: 1,
        userMessage: mappingFallbackNote ? `${mappingFallbackNote} ${addMsg}` : addMsg,
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
