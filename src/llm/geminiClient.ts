import type { LlmJsonComplete, LlmJsonCompletionResult } from './llmTypes';

export interface GeminiJsonConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Milliseconds; 0 = no timeout signal (not recommended). */
  timeoutMs: number;
}

const DEBUG_SHAPE_KEY_CAP = 8;

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

function truthyDebugShapeEnv(): boolean {
  const t = process.env.BARBORA_LLM_DEBUG_SHAPE?.trim().toLowerCase();
  return t === '1' || t === 'true' || t === 'yes';
}

/** Sorted, capped property names only — never values. */
function sortedKeySample(obj: Record<string, unknown>, cap: number): string[] {
  return Object.keys(obj)
    .sort()
    .slice(0, cap);
}

function summarizeGeminiGenerateContentShape(data: unknown): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    rootKeysSample: [] as string[],
    hasCandidates: false,
    candidateCount: 0,
    firstCandidateIsObject: false,
    firstCandidateFinishReason: undefined as string | undefined,
    firstCandidateHasContent: false,
    firstCandidateContentKeys: [] as string[],
    firstCandidatePartsCount: 0,
    firstCandidateTextPartCount: 0,
    firstCandidateNonObjectParts: 0,
    concatenatedTextLen: 0,
  };

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return summary;
  }
  const root = data as Record<string, unknown>;
  summary.rootKeysSample = sortedKeySample(root, DEBUG_SHAPE_KEY_CAP);

  const candidates = root.candidates;
  if (!Array.isArray(candidates)) {
    return summary;
  }
  summary.hasCandidates = true;
  summary.candidateCount = candidates.length;
  if (candidates.length === 0) {
    return summary;
  }

  const first = candidates[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    return summary;
  }
  summary.firstCandidateIsObject = true;
  const fc = first as Record<string, unknown>;
  const fr = fc.finishReason;
  if (typeof fr === 'string') {
    summary.firstCandidateFinishReason = fr;
  }

  const content = fc.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return summary;
  }
  summary.firstCandidateHasContent = true;
  summary.firstCandidateContentKeys = sortedKeySample(
    content as Record<string, unknown>,
    DEBUG_SHAPE_KEY_CAP,
  );

  const parts = (content as Record<string, unknown>).parts;
  if (!Array.isArray(parts)) {
    return summary;
  }
  summary.firstCandidatePartsCount = parts.length;
  let textPartCount = 0;
  let nonObjectParts = 0;
  let concat = '';
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      nonObjectParts += 1;
      continue;
    }
    const rec = part as Record<string, unknown>;
    if (typeof rec.text === 'string') {
      textPartCount += 1;
      concat += rec.text;
    }
  }
  summary.firstCandidateTextPartCount = textPartCount;
  summary.firstCandidateNonObjectParts = nonObjectParts;
  summary.concatenatedTextLen = concat.length;
  return summary;
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
    }
  }
  const trimmed = out.trim();
  if (trimmed === '') return null;
  return trimmed;
}

/**
 * Gemini generateContent (REST). Returns concatenated text parts or a failure reason.
 */
export function createGeminiJsonCompleter(config: GeminiJsonConfig): LlmJsonComplete {
  const base = trimTrailingSlashes(config.baseUrl);
  const url = `${base}/models/${encodeURIComponent(config.model)}:generateContent`;

  return async (systemPrompt: string, userContent: string): Promise<LlmJsonCompletionResult> => {
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
        if (truthyDebugShapeEnv()) {
          console.error(`[barbora-llm] gemini http error ${JSON.stringify({ httpStatus: res.status })}`);
        }
        return {
          ok: false,
          reason: res.status === 429 ? 'rate_limited' : 'http_error',
        };
      }

      const data: unknown = await res.json();
      if (truthyDebugShapeEnv()) {
        const shape = summarizeGeminiGenerateContentShape(data);
        console.error(`[barbora-llm] gemini response shape ${JSON.stringify(shape)}`);
      }
      const text = extractFirstCandidateText(data);
      if (text == null) {
        return { ok: false, reason: 'empty_response' };
      }
      return { ok: true, text };
    } catch {
      return { ok: false, reason: 'error' };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
}
