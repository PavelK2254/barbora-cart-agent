import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';
import type { SearchCandidate } from '../executor/searchCandidate';
import type { SearchCandidateWithUrl } from '../resolver/resolveShoppingLine';
import type { LlmStructuredResponse } from './llmTypes';

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
 * Returns null on any failure (fail closed).
 */
export function parseLlmResolutionResponse(
  rawContent: string,
  llmCandidates: SearchCandidate[],
): SearchCandidateWithUrl | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownJsonFence(rawContent));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const decision = parsed.decision;
  if (decision !== 'choose' && decision !== 'review_needed') return null;

  const body = parsed as unknown as LlmStructuredResponse;
  if (body.decision === 'review_needed') return null;

  const n = llmCandidates.length;
  if (n === 0) return null;

  const idx = body.chosenIndex;
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= n) {
    return null;
  }

  const chosen = llmCandidates[idx]!;
  const urlRaw = chosen.productUrl?.trim();
  if (!urlRaw) return null;

  const urlResult = validateBarboraProductUrl(urlRaw);
  if (!urlResult.ok) return null;

  return {
    ...chosen,
    productUrl: urlResult.productUrl,
  };
}
