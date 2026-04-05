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
    const out = await c('system', 'user');
    expect(out).toEqual({ ok: true, text: '{}' });
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
    expect(r).toEqual({ ok: true, text: '{"decision":"choose","chosenIndex":0}' });
  });

  test('returns http_error when response is not ok and not 429', async () => {
    globalThis.fetch = async () => new Response('', { status: 500 });
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'http_error' });
  });

  test('returns rate_limited when response status is 429', async () => {
    globalThis.fetch = async () => new Response('', { status: 429 });
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'rate_limited' });
  });

  test('returns empty_response when candidates is empty', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'empty_response' });
  });

  test('returns empty_response when candidates is missing', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200 });
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'empty_response' });
  });

  test('returns empty_response when parts is not an array', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: null } }],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'empty_response' });
  });

  test('extracts string text when mixed with non-text parts (e.g. inlineData)', async () => {
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
    expect(await c('s', 'u')).toEqual({ ok: true, text: '{' });
  });

  test('returns empty_response when no part has string text', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/png', data: 'YQ==' } }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'empty_response' });
  });

  test('concatenates only string text parts when interleaved with non-text parts', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { thoughtSignature: 'meta' },
                  { text: '{"decision":"choose","chosenIndex":' },
                  { inlineData: { mimeType: 'x', data: 'YQ==' } },
                  { text: '0}' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: true, text: '{"decision":"choose","chosenIndex":0}' });
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
    expect(await c('s', 'u')).toEqual({ ok: true, text: '{"decision":"choose","chosenIndex":0}' });
  });

  test('returns empty_response when every part lacks string text (metadata only)', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ thoughtSignature: 'only' }] } }],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'empty_response' });
  });

  test('returns empty_response when concatenated text is only whitespace', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '  \n\t  ' }] } }],
        }),
        { status: 200 },
      );
    const c = createGeminiJsonCompleter(config);
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
    const c = createGeminiJsonCompleter({
      ...config,
      timeoutMs: 1,
    });
    expect(await c('s', 'u')).toEqual({ ok: false, reason: 'error' });
  });

  test('BARBORA_LLM_DEBUG_SHAPE logs a safe one-line shape summary', async () => {
    const prev = process.env.BARBORA_LLM_DEBUG_SHAPE;
    process.env.BARBORA_LLM_DEBUG_SHAPE = 'true';
    const logs: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  role: 'model',
                  parts: [{ inlineData: { mimeType: 'image/png', data: 'c2VjcmV0' } }],
                },
              },
            ],
          }),
          { status: 200 },
        );
      const c = createGeminiJsonCompleter(config);
      expect(await c('s', 'u')).toEqual({ ok: false, reason: 'empty_response' });
      expect(logs).toHaveLength(1);
      const line = logs[0]!;
      expect(line.startsWith('[barbora-llm] gemini response shape ')).toBeTruthy();
      const jsonPart = line.slice('[barbora-llm] gemini response shape '.length);
      const parsed = JSON.parse(jsonPart) as Record<string, unknown>;
      expect(parsed.firstCandidatePartsCount).toBe(1);
      expect(parsed.firstCandidateTextPartCount).toBe(0);
      expect(parsed.firstCandidateFinishReason).toBe('STOP');
      expect(parsed.firstCandidateContentKeys).toEqual(['parts', 'role']);
      expect(line).not.toContain('c2VjcmV0');
    } finally {
      console.error = origErr;
      if (prev === undefined) {
        delete process.env.BARBORA_LLM_DEBUG_SHAPE;
      } else {
        process.env.BARBORA_LLM_DEBUG_SHAPE = prev;
      }
    }
  });

  test('BARBORA_LLM_DEBUG_SHAPE logs http status only when response is not ok', async () => {
    const prev = process.env.BARBORA_LLM_DEBUG_SHAPE;
    process.env.BARBORA_LLM_DEBUG_SHAPE = 'true';
    const logs: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
    try {
      globalThis.fetch = async () =>
        new Response('{"error":{"message":"do not leak"}}', { status: 429 });
      const c = createGeminiJsonCompleter(config);
      expect(await c('s', 'u')).toEqual({ ok: false, reason: 'rate_limited' });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toBe('[barbora-llm] gemini http error {"httpStatus":429}');
      expect(logs[0]).not.toContain('leak');
    } finally {
      console.error = origErr;
      if (prev === undefined) {
        delete process.env.BARBORA_LLM_DEBUG_SHAPE;
      } else {
        process.env.BARBORA_LLM_DEBUG_SHAPE = prev;
      }
    }
  });
});
