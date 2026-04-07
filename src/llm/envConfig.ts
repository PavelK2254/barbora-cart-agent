import { createGeminiJsonCompleter } from './geminiClient';
import { createOpenAiCompatibleJsonCompleter, type OpenAiCompatibleConfig } from './openAiCompatibleClient';
import type { LlmJsonComplete } from './llmTypes';
import { wrapLlmJsonCompleterWithMinInterval } from './minIntervalCompleter';

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 45_000;

/** Used when BARBORA_LLM_PROVIDER=gemini and BARBORA_LLM_BASE_URL is unset. */
const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Used when BARBORA_LLM_PROVIDER=gemini and BARBORA_LLM_MODEL is unset. */
const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash';

function truthyEnv(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  return t === '1' || t === 'true' || t === 'yes';
}

export interface LlmEnvConfig extends OpenAiCompatibleConfig {}

export interface LoadLlmCompleterFromEnvResult {
  completer: LlmJsonComplete | null;
  /**
   * When BARBORA_LLM_ENABLED requests LLM but no completer could be built (e.g. empty API key).
   */
  misconfigurationMessage?: string;
}

/**
 * Reads LLM config from env. Use {@link readLlmJsonCompleterFromEnv} when you only need the completer.
 * CLI scripts load a root `.env` first (see `scripts/loadDotenv.ts`); existing `process.env` wins.
 *
 * Env vars:
 * - BARBORA_LLM_ENABLED — enable LLM fallback when truthy
 * - BARBORA_LLM_API_KEY — required when enabled (OpenAI key or Gemini key per provider)
 * - BARBORA_LLM_PROVIDER — optional; `openai` (default) or `gemini`
 * - BARBORA_LLM_BASE_URL — OpenAI-compatible API base (openai) or Gemini REST base (gemini); provider-specific defaults apply when unset
 * - BARBORA_LLM_MODEL — model id; provider-specific defaults when unset
 * - BARBORA_LLM_TIMEOUT_MS — request timeout in ms
 * - BARBORA_LLM_MIN_INTERVAL_MS — optional; if >0, wait at least this many ms between consecutive
 *   LLM request starts (after each call completes). Use with low RPM limits (e.g. Gemini free tier ~10 RPM → 6000+).
 */
export function loadLlmCompleterFromEnv(): LoadLlmCompleterFromEnvResult {
  if (!truthyEnv(process.env.BARBORA_LLM_ENABLED)) {
    return { completer: null };
  }
  const apiKey = process.env.BARBORA_LLM_API_KEY?.trim();
  if (!apiKey) {
    return {
      completer: null,
      misconfigurationMessage:
        'BARBORA_LLM_ENABLED is true but BARBORA_LLM_API_KEY is missing or only whitespace — LLM fallback is off.',
    };
  }

  const timeoutRaw = process.env.BARBORA_LLM_TIMEOUT_MS?.trim();
  const timeoutMs =
    timeoutRaw != null && timeoutRaw !== ''
      ? Math.max(0, parseInt(timeoutRaw, 10) || DEFAULT_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

  const minIntervalRaw = process.env.BARBORA_LLM_MIN_INTERVAL_MS?.trim();
  const minIntervalMs =
    minIntervalRaw != null && minIntervalRaw !== ''
      ? Math.max(0, parseInt(minIntervalRaw, 10) || 0)
      : 0;

  const providerRaw = process.env.BARBORA_LLM_PROVIDER?.trim().toLowerCase() || 'openai';
  if (providerRaw !== 'openai' && providerRaw !== 'gemini') {
    return {
      completer: null,
      misconfigurationMessage:
        'BARBORA_LLM_PROVIDER must be "openai" or "gemini" — LLM fallback is off.',
    };
  }

  if (providerRaw === 'openai') {
    const baseUrl = (process.env.BARBORA_LLM_BASE_URL?.trim() || DEFAULT_BASE).trim();
    const model = (process.env.BARBORA_LLM_MODEL?.trim() || DEFAULT_MODEL).trim();
    const config: LlmEnvConfig = {
      apiKey,
      baseUrl,
      model,
      timeoutMs,
    };
    const base = createOpenAiCompatibleJsonCompleter(config);
    return { completer: wrapLlmJsonCompleterWithMinInterval(base, minIntervalMs) };
  }

  const baseUrl = (process.env.BARBORA_LLM_BASE_URL?.trim() || GEMINI_DEFAULT_BASE).trim();
  const model = (process.env.BARBORA_LLM_MODEL?.trim() || GEMINI_DEFAULT_MODEL).trim();
  const base = createGeminiJsonCompleter({
    apiKey,
    baseUrl,
    model,
    timeoutMs,
  });
  return {
    completer: wrapLlmJsonCompleterWithMinInterval(base, minIntervalMs),
  };
}

/**
 * When LLM fallback is disabled or misconfigured, returns null (caller skips LLM).
 */
export function readLlmJsonCompleterFromEnv(): LlmJsonComplete | null {
  return loadLlmCompleterFromEnv().completer;
}
