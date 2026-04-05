import { expect, test } from '@playwright/test';

import { createOpenAiCompatibleJsonCompleter } from '../../src/llm/openAiCompatibleClient';

const config = {
  apiKey: 'test-key',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  timeoutMs: 60_000,
};

function chatCompletionsResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content } }],
    }),
    { status },
  );
}

test.describe('createOpenAiCompatibleJsonCompleter', () => {
  let originalFetch: typeof fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('POSTs to {base}/chat/completions with Bearer token', async () => {
    let seenUrl = '';
    let authHeader: string | null = null;
    globalThis.fetch = async (input, init) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      const h = new Headers(init?.headers as HeadersInit);
      authHeader = h.get('Authorization');
      return chatCompletionsResponse('{}');
    };
    const c = createOpenAiCompatibleJsonCompleter(config);
    const out = await c('system', 'user');
    expect(out).toEqual({ ok: true, text: '{}' });
    expect(seenUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(authHeader).toBe('Bearer test-key');
  });

  test('returns ok text from assistant message', async () => {
    globalThis.fetch = async () =>
      chatCompletionsResponse('{"decision":"choose","chosenIndex":0}');
    const c = createOpenAiCompatibleJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({
      ok: true,
      text: '{"decision":"choose","chosenIndex":0}',
    });
  });

  test('returns http_error when response is not ok and not 429', async () => {
    globalThis.fetch = async () => chatCompletionsResponse('', 503);
    const c = createOpenAiCompatibleJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'http_error' });
  });

  test('returns rate_limited when response status is 429', async () => {
    globalThis.fetch = async () => chatCompletionsResponse('', 429);
    const c = createOpenAiCompatibleJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'rate_limited' });
  });

  test('returns empty_response when choices is empty', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 });
    const c = createOpenAiCompatibleJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'empty_response' });
  });

  test('returns empty_response when message content is blank', async () => {
    globalThis.fetch = async () => chatCompletionsResponse('   \n  ');
    const c = createOpenAiCompatibleJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'empty_response' });
  });

  test('returns error on abort / timeout', async () => {
    globalThis.fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal;
        if (!sig) {
          reject(new Error('expected AbortSignal'));
          return;
        }
        if (sig.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        sig.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    const c = createOpenAiCompatibleJsonCompleter({
      ...config,
      timeoutMs: 1,
    });
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'error' });
  });
});
