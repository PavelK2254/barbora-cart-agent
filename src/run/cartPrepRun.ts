import * as path from 'node:path';

import type { Page } from '@playwright/test';

import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';
import { runBarboraAddToCartSpike } from '../executor/barboraAddToCartSpike';
import { runBarboraCheckoutHandoffSpike } from '../executor/barboraCheckoutHandoffSpike';
import type { SearchCandidate } from '../executor/searchCandidate';
import { runBarboraSearchAndCollect } from '../executor/barboraSearchSpike';
import {
  buildLlmCandidateSlice,
  llmFallbackEligibleReason,
  type LlmResolveFn,
} from '../llm';
import { findMappingForNormalizedQuery, loadKnownMappingsFromFile } from '../mappings/knownMappings';
import { normalizeForMatch } from '../resolver/normalizeForMatch';
import { transliterateLatvianToAscii } from '../text/transliterateLatvianToAscii';
import type { ShoppingLineResolverDebug } from '../resolver/resolveShoppingLine';
import { resolveShoppingLine } from '../resolver/resolveShoppingLine';
import { llmDebugBeforeLlmCall } from './llmLineDebug';
import {
  USER_MESSAGE_ADD_FROM_KNOWN_MAPPING,
  USER_MESSAGE_ADD_FROM_LLM_FALLBACK,
  USER_MESSAGE_ADD_FROM_SEARCH,
  userMessageForResolverReviewReason,
} from './reviewReasonUserMessages';
import type { LineResolutionDebug, LlmDebugOutcome, RunLineResult, RunResultSummary } from './runTypes';

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
  /**
   * Optional LLM fallback after deterministic review_needed (ambiguous_match | weak_match) when
   * usable SERP candidates exist. Must be fail-closed (`failed` with a specific outcome).
   */
  llmResolve?: LlmResolveFn;
  /** When true, each line may include `lineDebug` (structured resolver/LLM path; no browser internals). */
  includeDebug?: boolean;
}

const SEARCH_ERR = '[barbora-search-spike]';

function makeRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)}`;
}

function outcomeFromSearchFailure(message: string): RunLineResult['outcome'] {
  return message.includes(SEARCH_ERR) ? 'review_needed' : 'skipped';
}

function countUsableSerpCandidates(candidates: SearchCandidate[]): number {
  let n = 0;
  for (const c of candidates) {
    const raw = c.productUrl?.trim();
    if (!raw) continue;
    if (validateBarboraProductUrl(raw).ok) n += 1;
  }
  return n;
}

function resolverDebugToLineFields(
  rd: ShoppingLineResolverDebug | undefined,
): Pick<LineResolutionDebug, 'deterministicReasonCode' | 'rankedCandidates'> {
  if (rd == null) return {};
  return {
    deterministicReasonCode: rd.reasonCode,
    rankedCandidates: rd.rankedCandidates,
  };
}

function lineDebugBase(includeDebug: boolean, partial: LineResolutionDebug): LineResolutionDebug | undefined {
  if (!includeDebug) return undefined;
  return partial;
}

/** ASCII-friendly strings for run JSON (search still uses the raw query). */
function summaryQuery(q: string): string {
  return transliterateLatvianToAscii(q);
}

function summaryLabel(title: string): string {
  return transliterateLatvianToAscii(title);
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
  const includeDebug = options.includeDebug === true;
  const resolveOpts = includeDebug ? { includeResolverDebug: true as const } : undefined;
  const mappingsFile = path.resolve(process.cwd(), options.knownMappingsPath ?? 'known-mappings.json');
  const mappingStore = loadKnownMappingsFromFile(mappingsFile);

  for (const line of inputLines) {
    const q = line.query.trim();
    if (!q) {
      lineResults.push({
        lineId: line.lineId,
        outcome: 'skipped',
        userMessage: 'Empty search query for this line.',
        lineDebug: lineDebugBase(includeDebug, {
          knownMappingHit: false,
          serpCandidateCount: 0,
          usableCandidateCount: 0,
          llmEligible: false,
          llmAttempted: false,
          llmOutcome: 'not_configured',
        }),
      });
      continue;
    }

    try {
      const normalizedQuery = normalizeForMatch(q);
      const mappingHit = findMappingForNormalizedQuery(mappingStore, normalizedQuery);

      let mappingFallbackNote: string | undefined;
      let resolvedFromKnownMapping = false;
      let resolved;
      let serpCandidates: SearchCandidate[] = [];
      const knownMappingHit = mappingHit != null;
      let knownMappingInvalidFallbackToSearch = false;

      if (mappingHit != null) {
        const urlCheck = validateBarboraProductUrl(mappingHit.barboraProductRef);
        if (urlCheck.ok) {
          resolvedFromKnownMapping = true;
          resolved = resolveShoppingLine(
            {
              query: q,
              candidates: [],
              knownProduct: {
                productUrl: urlCheck.productUrl,
                displayName: mappingHit.displayName,
              },
            },
            resolveOpts,
          );
        } else {
          knownMappingInvalidFallbackToSearch = true;
          mappingFallbackNote = `Saved product link is invalid; used Barbora search instead. (${urlCheck.message})`;
          console.error(
            `[known-mappings] line ${line.lineId} (${q.slice(0, 80)}): ${mappingFallbackNote}`,
          );
          serpCandidates = await runBarboraSearchAndCollect(page, { query: q, topN });
          resolved = resolveShoppingLine({ query: q, candidates: serpCandidates }, resolveOpts);
        }
      } else {
        serpCandidates = await runBarboraSearchAndCollect(page, { query: q, topN });
        resolved = resolveShoppingLine({ query: q, candidates: serpCandidates }, resolveOpts);
      }

      const serpCount = serpCandidates.length;
      const usableCount = countUsableSerpCandidates(serpCandidates);
      const rd = resolved.resolverDebug;

      if (resolved.decision === 'review_needed') {
        // Same breadth as SERP collection / resolver input (default script topN is 10; slice was 6 and could omit tied rows).
        const llmSlice = buildLlmCandidateSlice(serpCandidates, topN);
        const reviewReason = resolved.reasonCode;

        let { llmEligible, llmAttempted, llmOutcome } = llmDebugBeforeLlmCall({
          llmResolvePresent: options.llmResolve != null,
          reviewReason,
          llmSliceLength: llmSlice.length,
        });

        if (
          options.llmResolve != null &&
          llmFallbackEligibleReason(reviewReason) &&
          llmSlice.length > 0
        ) {
          try {
            const llmResult = await options.llmResolve({
              query: q,
              normalizedQuery,
              reasonCode: reviewReason,
              candidates: llmSlice,
            });
            if (llmResult.status === 'chose') {
              llmOutcome = 'chose';
              const picked = llmResult.candidate;
              const addResult = await runBarboraAddToCartSpike(page, {
                productUrl: picked.productUrl,
              });
              const addMsg = `${USER_MESSAGE_ADD_FROM_LLM_FALLBACK} ${addResult.message}`.trim();
              const llmUrlCheck = validateBarboraProductUrl(picked.productUrl);
              lineResults.push({
                lineId: line.lineId,
                query: summaryQuery(q),
                outcome: 'added',
                resolutionSource: 'llm_fallback',
                barboraLabel: summaryLabel(picked.title),
                quantityAdded: 1,
                ...(llmUrlCheck.ok ? { barboraProductRef: llmUrlCheck.productUrl } : {}),
                userMessage: mappingFallbackNote ? `${mappingFallbackNote} ${addMsg}` : addMsg,
                lineDebug: lineDebugBase(includeDebug, {
                  knownMappingHit,
                  ...(knownMappingInvalidFallbackToSearch
                    ? { knownMappingInvalidFallbackToSearch: true }
                    : {}),
                  serpCandidateCount: serpCount,
                  usableCandidateCount: usableCount,
                  ...resolverDebugToLineFields(rd),
                  llmEligible,
                  llmAttempted,
                  llmOutcome,
                }),
              });
              continue;
            }
            llmOutcome = llmResult.outcome;
          } catch {
            llmOutcome = 'error';
          }
        }

        const reviewText = userMessageForResolverReviewReason(resolved.reasonCode);
        const userMessage = [mappingFallbackNote, reviewText].filter(Boolean).join(' ');
        lineResults.push({
          lineId: line.lineId,
          query: summaryQuery(q),
          outcome: 'review_needed',
          userMessage,
          reviewReasonCode: resolved.reasonCode,
          lineDebug: lineDebugBase(includeDebug, {
            knownMappingHit,
            ...(knownMappingInvalidFallbackToSearch ? { knownMappingInvalidFallbackToSearch: true } : {}),
            serpCandidateCount: serpCount,
            usableCandidateCount: usableCount,
            ...resolverDebugToLineFields(rd),
            llmEligible,
            llmAttempted,
            llmOutcome,
          }),
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

      const llmOutcomeForAdd: LlmDebugOutcome =
        options.llmResolve == null ? 'not_configured' : 'skipped_ineligible';

      const addUrlCheck = validateBarboraProductUrl(resolved.candidate.productUrl);

      lineResults.push({
        lineId: line.lineId,
        query: summaryQuery(q),
        outcome: 'added',
        resolutionSource: resolvedFromKnownMapping ? 'known_mapping' : 'deterministic',
        barboraLabel: summaryLabel(resolved.candidate.title),
        quantityAdded: 1,
        ...(addUrlCheck.ok ? { barboraProductRef: addUrlCheck.productUrl } : {}),
        userMessage: mappingFallbackNote ? `${mappingFallbackNote} ${addMsg}` : addMsg,
        lineDebug: lineDebugBase(includeDebug, {
          knownMappingHit,
          ...(knownMappingInvalidFallbackToSearch ? { knownMappingInvalidFallbackToSearch: true } : {}),
          serpCandidateCount: serpCount,
          usableCandidateCount: usableCount,
          ...resolverDebugToLineFields(rd),
          llmEligible: false,
          llmAttempted: false,
          llmOutcome: llmOutcomeForAdd,
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lineResults.push({
        lineId: line.lineId,
        query: summaryQuery(q),
        outcome: outcomeFromSearchFailure(msg),
        userMessage: msg,
        lineDebug: lineDebugBase(includeDebug, {
          knownMappingHit: false,
          serpCandidateCount: 0,
          usableCandidateCount: 0,
          llmEligible: false,
          llmAttempted: false,
          llmOutcome: 'not_configured',
        }),
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
