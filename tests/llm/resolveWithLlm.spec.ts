import { expect, test } from '@playwright/test';

import type { SearchCandidate } from '../../src/executor/searchCandidate';
import { createLlmResolveFn } from '../../src/llm';

const url = 'https://www.barbora.lv/produkti/p';

test('createLlmResolveFn returns null when completeJson returns null', async () => {
  const fn = createLlmResolveFn(async () => null);
  const candidates: SearchCandidate[] = [
    { index: 5, title: 't', productUrl: url, priceText: null, packSizeText: null },
  ];
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(r).toBeNull();
});

test('createLlmResolveFn returns validated candidate on good JSON', async () => {
  const payload = JSON.stringify({ decision: 'choose', chosenIndex: 0 });
  const fn = createLlmResolveFn(async () => payload);
  const candidates: SearchCandidate[] = [
    { index: 99, title: 'Egg', productUrl: url, priceText: '1€', packSizeText: null },
  ];
  const r = await fn({
    query: 'olas',
    normalizedQuery: 'olas',
    reasonCode: 'ambiguous_match',
    candidates,
  });
  expect(r?.title).toBe('Egg');
  expect(r?.productUrl).toBe(url);
});

test('createLlmResolveFn does not throw when completeJson throws', async () => {
  const fn = createLlmResolveFn(async () => {
    throw new Error('network');
  });
  const candidates: SearchCandidate[] = [
    { index: 1, title: 't', productUrl: url, priceText: null, packSizeText: null },
  ];
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(r).toBeNull();
});

test('createLlmResolveFn returns null for empty candidates', async () => {
  const fn = createLlmResolveFn(async () => '{"decision":"choose","chosenIndex":0}');
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates: [],
  });
  expect(r).toBeNull();
});
