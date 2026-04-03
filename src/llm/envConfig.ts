import { createOpenAiCompatibleJsonCompleter, type OpenAiCompatibleConfig } from './openAiCompatibleClient';
import type { LlmJsonComplete } from './llmTypes';

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 45_000;

function truthyEnv(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  return t === '1' || t === 'true' || t === 'yes';
}

export interface LlmEnvConfig extends OpenAiCompatibleConfig {}

/**
 * When LLM fallback is disabled or misconfigured, returns null (caller skips LLM).
 */
export function readLlmJsonCompleterFromEnv(): LlmJsonComplete | null {
  if (!truthyEnv(process.env.BARBORA_LLM_ENABLED)) {
    return null;
  }
  const apiKey = process.env.BARBORA_LLM_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const baseUrl = (process.env.BARBORA_LLM_BASE_URL?.trim() || DEFAULT_BASE).trim();
  const model = (process.env.BARBORA_LLM_MODEL?.trim() || DEFAULT_MODEL).trim();
  const timeoutRaw = process.env.BARBORA_LLM_TIMEOUT_MS?.trim();
  const timeoutMs =
    timeoutRaw != null && timeoutRaw !== ''
      ? Math.max(0, parseInt(timeoutRaw, 10) || DEFAULT_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

  const config: LlmEnvConfig = {
    apiKey,
    baseUrl,
    model,
    timeoutMs,
  };
  return createOpenAiCompatibleJsonCompleter(config);
}
