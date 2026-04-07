import type { LlmJsonComplete, LlmJsonCompletionResult } from './llmTypes';

/**
 * Serializes calls and ensures at least `minIntervalMs` between consecutive **request starts**
 * (spacing is applied after the previous call finishes). Helps stay under provider RPM caps when
 * each shopping line triggers a separate LLM fallback.
 */
export function wrapLlmJsonCompleterWithMinInterval(
  inner: LlmJsonComplete,
  minIntervalMs: number,
): LlmJsonComplete {
  if (minIntervalMs <= 0) return inner;

  let lastRequestStart = 0;
  let tail: Promise<unknown> = Promise.resolve();

  return async (systemPrompt: string, userContent: string): Promise<LlmJsonCompletionResult> => {
    const next: Promise<LlmJsonCompletionResult> = tail.then(async () => {
      const now = Date.now();
      const wait =
        lastRequestStart > 0 ? Math.max(0, minIntervalMs - (now - lastRequestStart)) : 0;
      if (wait > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
      }
      lastRequestStart = Date.now();
      return inner(systemPrompt, userContent);
    });
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
