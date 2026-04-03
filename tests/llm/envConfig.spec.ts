import { expect, test } from '@playwright/test';

import { loadLlmCompleterFromEnv } from '../../src/llm/envConfig';

const ENV_KEYS = [
  'BARBORA_LLM_ENABLED',
  'BARBORA_LLM_API_KEY',
  'BARBORA_LLM_PROVIDER',
  'BARBORA_LLM_BASE_URL',
  'BARBORA_LLM_MODEL',
  'BARBORA_LLM_TIMEOUT_MS',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const o: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    o[k] = process.env[k];
  }
  return o;
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

test.describe('loadLlmCompleterFromEnv', () => {
  let originalFetch: typeof fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('default provider uses OpenAI-compatible chat/completions URL', async () => {
    const snap = snapshotEnv();
    try {
      process.env.BARBORA_LLM_ENABLED = 'true';
      process.env.BARBORA_LLM_API_KEY = 'sk-test';
      delete process.env.BARBORA_LLM_PROVIDER;

      let url = '';
      globalThis.fetch = async (input) => {
        url = typeof input === 'string' ? input : input.toString();
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{}' } }] }),
          { status: 200 },
        );
      };

      const { completer } = loadLlmCompleterFromEnv();
      expect(completer).not.toBeNull();
      await completer!('sys', 'user');
      expect(url).toContain('api.openai.com');
      expect(url).toContain('/chat/completions');
    } finally {
      restoreEnv(snap);
    }
  });

  test('BARBORA_LLM_PROVIDER=openai uses chat/completions', async () => {
    const snap = snapshotEnv();
    try {
      process.env.BARBORA_LLM_ENABLED = 'true';
      process.env.BARBORA_LLM_API_KEY = 'sk-test';
      process.env.BARBORA_LLM_PROVIDER = 'openai';

      let url = '';
      globalThis.fetch = async (input) => {
        url = typeof input === 'string' ? input : input.toString();
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{}' } }] }),
          { status: 200 },
        );
      };

      const { completer } = loadLlmCompleterFromEnv();
      expect(completer).not.toBeNull();
      await completer!('sys', 'user');
      expect(url).toContain('/chat/completions');
    } finally {
      restoreEnv(snap);
    }
  });

  test('BARBORA_LLM_PROVIDER=gemini uses generateContent and API key header', async () => {
    const snap = snapshotEnv();
    try {
      process.env.BARBORA_LLM_ENABLED = 'true';
      process.env.BARBORA_LLM_API_KEY = 'gemini-key';
      process.env.BARBORA_LLM_PROVIDER = 'gemini';
      delete process.env.BARBORA_LLM_BASE_URL;

      let url = '';
      let apiKeyHeader: string | null = null;
      globalThis.fetch = async (input, init) => {
        url = typeof input === 'string' ? input : input.toString();
        apiKeyHeader = new Headers(init?.headers as HeadersInit).get('x-goog-api-key');
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{}' }] } }],
          }),
          { status: 200 },
        );
      };

      const { completer } = loadLlmCompleterFromEnv();
      expect(completer).not.toBeNull();
      await completer!('sys', 'user');
      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).toContain(':generateContent');
      expect(apiKeyHeader).toBe('gemini-key');
    } finally {
      restoreEnv(snap);
    }
  });

  test('unknown BARBORA_LLM_PROVIDER yields null completer and message', () => {
    const snap = snapshotEnv();
    try {
      process.env.BARBORA_LLM_ENABLED = 'true';
      process.env.BARBORA_LLM_API_KEY = 'k';
      process.env.BARBORA_LLM_PROVIDER = 'azure';

      const r = loadLlmCompleterFromEnv();
      expect(r.completer).toBeNull();
      expect(r.misconfigurationMessage).toMatch(/BARBORA_LLM_PROVIDER/);
    } finally {
      restoreEnv(snap);
    }
  });
});
