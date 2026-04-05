import { buildLlmUserPayload } from './llmPayload';
import type { LlmJsonComplete, LlmResolveFn, LlmResolveInput, LlmResolveResult } from './llmTypes';
import { parseLlmResolutionResponseDetailed } from './parseLlmResolutionResponse';

const SYSTEM_PROMPT = `You help pick one grocery product from a fixed list for a Latvian e-shop search.
Respond with a single JSON object only (no markdown), shape:
{"decision":"choose"|"review_needed","chosenIndex":number|null,"explanation":string}
Rules:
- candidates[].index is 0-based position in the candidates array (0 .. length-1). chosenIndex MUST refer only to that list, never to any other numbering.
- If you cannot pick safely, set decision to "review_needed" and chosenIndex to null.
- Prefer products that clearly match the shopper's query; avoid unrelated items.
- explanation is optional; short if present.`;

/**
 * Fail closed: never throws; returns `failed` when the LLM cannot produce a validated choice.
 */
export function createLlmResolveFn(completeJson: LlmJsonComplete): LlmResolveFn {
  return async (input: LlmResolveInput): Promise<LlmResolveResult> => {
    try {
      if (input.candidates.length === 0) {
        return { status: 'failed', outcome: 'invalid_shape' };
      }

      const payload = buildLlmUserPayload(input);
      const userContent = JSON.stringify(payload);

      const completion = await completeJson(SYSTEM_PROMPT, userContent);
      if (!completion.ok) {
        return { status: 'failed', outcome: completion.reason };
      }
      const raw = completion.text.trim();
      if (raw === '') {
        return { status: 'failed', outcome: 'empty_response' };
      }

      const parsed = parseLlmResolutionResponseDetailed(raw, input.candidates);
      if (parsed.ok) {
        return { status: 'chose', candidate: parsed.candidate };
      }
      return { status: 'failed', outcome: parsed.reason };
    } catch {
      return { status: 'failed', outcome: 'error' };
    }
  };
}
