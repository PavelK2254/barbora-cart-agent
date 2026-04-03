import type { LlmJsonComplete } from './llmTypes';

export interface GeminiJsonConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Milliseconds; 0 = no timeout signal (not recommended). */
  timeoutMs: number;
}

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

function isIgnorableGeminiPart(rec: Record<string, unknown>): boolean {
  const keys = Object.keys(rec).filter((k) => rec[k] !== undefined);
  if (keys.length === 0) return true;
  return keys.every((k) => k === 'thought' || k === 'thoughtSignature');
}

function extractFirstCandidateText(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const root = data as Record<string, unknown>;
  const candidates = root.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first = candidates[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return null;
  const content = (first as Record<string, unknown>).content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const parts = (content as Record<string, unknown>).parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  let out = '';
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) return null;
    const rec = part as Record<string, unknown>;
    if (typeof rec.text === 'string') {
      out += rec.text;
      continue;
    }
    if (!isIgnorableGeminiPart(rec)) return null;
  }
  if (out.trim() === '') return null;
  return out;
}

/**
 * Gemini generateContent (REST). Returns concatenated text parts or null on any failure.
 */
export function createGeminiJsonCompleter(config: GeminiJsonConfig): LlmJsonComplete {
  const base = trimTrailingSlashes(config.baseUrl);
  const url = `${base}/models/${encodeURIComponent(config.model)}:generateContent`;

  return async (systemPrompt: string, userContent: string): Promise<string | null> => {
    const controller = new AbortController();
    const timeout =
      config.timeoutMs > 0 ? setTimeout(() => controller.abort(), config.timeoutMs) : undefined;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userContent }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return null;
      }

      const data: unknown = await res.json();
      return extractFirstCandidateText(data);
    } catch {
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
}
