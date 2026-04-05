import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';
import type { SearchCandidate } from '../executor/searchCandidate';
import type { SearchCandidateWithUrl } from '../resolver/resolveShoppingLine';
import type { LlmParseResult, LlmStructuredResponse } from './llmTypes';

function stripMarkdownJsonFence(text: string): string {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence?.[1]) return fence[1]!.trim();
  return t;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Parse model output and map chosenIndex (0-based into llmCandidates) to a validated candidate.
 * Fail-closed with a specific reason for debug (never `empty_response` / `error` — those are provider-layer).
 */
export function parseLlmResolutionResponseDetailed(
  rawContent: string,
  llmCandidates: SearchCandidate[],
): LlmParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownJsonFence(rawContent));
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const decision = parsed.decision;
  if (decision !== 'choose' && decision !== 'review_needed') {
    return { ok: false, reason: 'invalid_shape' };
  }

  const body = parsed as unknown as LlmStructuredResponse;
  if (body.decision === 'review_needed') {
    return { ok: false, reason: 'model_review_needed' };
  }

  const n = llmCandidates.length;
  if (n === 0) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const idx = body.chosenIndex;
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= n) {
    return { ok: false, reason: 'invalid_index' };
  }

  const chosen = llmCandidates[idx]!;
  const urlRaw = chosen.productUrl?.trim();
  if (!urlRaw) {
    return { ok: false, reason: 'invalid_url' };
  }

  const urlResult = validateBarboraProductUrl(urlRaw);
  if (!urlResult.ok) {
    return { ok: false, reason: 'invalid_url' };
  }

  return {
    ok: true,
    candidate: {
      ...chosen,
      productUrl: urlResult.productUrl,
    },
  };
}

/**
 * Parse model output and map chosenIndex (0-based into llmCandidates) to a validated candidate.
 * Returns null on any failure (fail closed).
 */
export function parseLlmResolutionResponse(
  rawContent: string,
  llmCandidates: SearchCandidate[],
): SearchCandidateWithUrl | null {
  const r = parseLlmResolutionResponseDetailed(rawContent, llmCandidates);
  return r.ok ? r.candidate : null;
}
