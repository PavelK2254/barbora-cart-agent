import { expect, test } from '@playwright/test';

import { createGeminiJsonCompleter } from '../../src/llm/geminiClient';

const config = {
  apiKey: 'test-key',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-2.0-flash',
  timeoutMs: 60_000,
};

test.describe('createGeminiJsonCompleter', () => {
  let originalFetch: typeof fetch;

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('POSTs to models/{model}:generateContent with x-goog-api-key', async () => {
    let seenUrl = '';
    let apiKeyHeader: string | null = null;
    globalThis.fetch = async (input, init) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      const h = new Headers(init?.headers as HeadersInit);
      apiKeyHeader = h.get('x-goog-api-key');
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{}' }] } }],
        }),
        { status: 200 },
      );
    };
    const c = createGeminiJsonCompleter(config);
    await c('system', 'user');
    expect(seenUrl).toContain('/models/gemini-2.0-flash:generateContent');
    expect(apiKeyHeader).toBe('test-key');
  });

  test('concatenates multiple string text parts', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"decision":"choose","chosenIndex":' }, { text: '0}' }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    const r = await c('s', 'u');
    expect(r).toBe('{"decision":"choose","chosenIndex":0}');
  });

  test('returns null when response is not ok', async () => {
    globalThis.fetch = async () => new Response('', { status: 500 });
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toBeNull();
  });

  test('returns null when candidates is empty', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toBeNull();
  });

  test('returns null when candidates is missing', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200 });
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toBeNull();
  });

  test('returns null when parts is not an array', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: null } }],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toBeNull();
  });

  test('returns null when a non-ignorable part lacks string text', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{' }, { inlineData: { mimeType: 'x', data: 'YQ==' } }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toBeNull();
  });

  test('skips thoughtSignature-only parts and keeps JSON text', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { thoughtSignature: 'sig' },
                  { text: '{"decision":"choose","chosenIndex":0}' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toBe('{"decision":"choose","chosenIndex":0}');
  });

  test('returns null when every part is ignorable metadata only', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ thoughtSignature: 'only' }] } }],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toBeNull();
  });

  test('returns null when concatenated text is only whitespace', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '  \n\t  ' }] } }],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toBeNull();
  });

  test('returns null on abort / timeout', async () => {
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
    const c = createGeminiJsonCompleter({
      ...config,
      timeoutMs: 1,
    });
    expect(await c('s', 'u')).toBeNull();
  });
});
