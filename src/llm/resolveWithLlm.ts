import type { SearchCandidateWithUrl } from '../resolver/resolveShoppingLine';
import { buildLlmUserPayload } from './llmPayload';
import type { LlmJsonComplete, LlmResolveFn, LlmResolveInput } from './llmTypes';
import { parseLlmResolutionResponse } from './parseLlmResolutionResponse';

const SYSTEM_PROMPT = `You help pick one grocery product from a fixed list for a Latvian e-shop search.
Respond with a single JSON object only (no markdown), shape:
{"decision":"choose"|"review_needed","chosenIndex":number|null,"explanation":string}
Rules:
- candidates[].index is 0-based position in the candidates array (0 .. length-1). chosenIndex MUST refer only to that list, never to any other numbering.
- If you cannot pick safely, set decision to "review_needed" and chosenIndex to null.
- Prefer products that clearly match the shopper's query; avoid unrelated items.
- explanation is optional; short if present.`;

/**
 * Fail closed: never throws; returns null when the LLM cannot produce a validated choice.
 */
export function createLlmResolveFn(completeJson: LlmJsonComplete): LlmResolveFn {
  return async (input: LlmResolveInput): Promise<SearchCandidateWithUrl | null> => {
    try {
      if (input.candidates.length === 0) return null;

      const payload = buildLlmUserPayload(input);
      const userContent = JSON.stringify(payload);

      const raw = await completeJson(SYSTEM_PROMPT, userContent);
      if (raw == null) return null;

      return parseLlmResolutionResponse(raw, input.candidates);
    } catch {
      return null;
    }
  };
}
