import type { LlmJsonComplete, LlmJsonCompletionResult } from './llmTypes';

export interface OpenAiCompatibleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Milliseconds; 0 = no timeout signal (not recommended). */
  timeoutMs: number;
}

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

/**
 * OpenAI-compatible POST /v1/chat/completions. Returns assistant message content or a failure reason.
 */
export function createOpenAiCompatibleJsonCompleter(config: OpenAiCompatibleConfig): LlmJsonComplete {
  const url = `${trimTrailingSlashes(config.baseUrl)}/chat/completions`;

  return async (systemPrompt: string, userContent: string): Promise<LlmJsonCompletionResult> => {
    const controller = new AbortController();
    const timeout =
      config.timeoutMs > 0 ? setTimeout(() => controller.abort(), config.timeoutMs) : undefined;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return {
          ok: false,
          reason: res.status === 429 ? 'rate_limited' : 'http_error',
        };
      }

      const data: unknown = await res.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, reason: 'empty_response' };
      }
      const rec = data as Record<string, unknown>;
      const choices = rec.choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        return { ok: false, reason: 'empty_response' };
      }
      const first = choices[0];
      if (!first || typeof first !== 'object' || Array.isArray(first)) {
        return { ok: false, reason: 'empty_response' };
      }
      const message = (first as Record<string, unknown>).message;
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        return { ok: false, reason: 'empty_response' };
      }
      const content = (message as Record<string, unknown>).content;
      if (typeof content !== 'string' || content.trim() === '') {
        return { ok: false, reason: 'empty_response' };
      }
      return { ok: true, text: content };
    } catch {
      return { ok: false, reason: 'error' };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
}
