import { expect, test } from '@playwright/test';

import type { SearchCandidate } from '../../src/executor/searchCandidate';
import { createLlmResolveFn } from '../../src/llm';

const url = 'https://www.barbora.lv/produkti/p';

test('createLlmResolveFn returns failed empty_response when completeJson returns empty_response', async () => {
  const fn = createLlmResolveFn(async () => ({ ok: false, reason: 'empty_response' }));
  const candidates: SearchCandidate[] = [
    { index: 5, title: 't', productUrl: url, priceText: null, packSizeText: null },
  ];
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(r).toEqual({ status: 'failed', outcome: 'empty_response' });
});

test('createLlmResolveFn returns failed rate_limited when completeJson returns rate_limited', async () => {
  const fn = createLlmResolveFn(async () => ({ ok: false, reason: 'rate_limited' }));
  const candidates: SearchCandidate[] = [
    { index: 0, title: 't', productUrl: url, priceText: null, packSizeText: null },
  ];
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(r).toEqual({ status: 'failed', outcome: 'rate_limited' });
});

test('createLlmResolveFn returns failed http_error when completeJson returns http_error', async () => {
  const fn = createLlmResolveFn(async () => ({ ok: false, reason: 'http_error' }));
  const candidates: SearchCandidate[] = [
    { index: 0, title: 't', productUrl: url, priceText: null, packSizeText: null },
  ];
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(r).toEqual({ status: 'failed', outcome: 'http_error' });
});

test('createLlmResolveFn returns failed empty_response for blank provider string', async () => {
  const fn = createLlmResolveFn(async () => ({ ok: true, text: '   \n' }));
  const candidates: SearchCandidate[] = [
    { index: 0, title: 't', productUrl: url, priceText: null, packSizeText: null },
  ];
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(r).toEqual({ status: 'failed', outcome: 'empty_response' });
});

test('createLlmResolveFn returns chose with validated candidate on good JSON', async () => {
  const payload = JSON.stringify({ decision: 'choose', chosenIndex: 0 });
  const fn = createLlmResolveFn(async () => ({ ok: true, text: payload }));
  const candidates: SearchCandidate[] = [
    { index: 99, title: 'Egg', productUrl: url, priceText: '1€', packSizeText: null },
  ];
  const r = await fn({
    query: 'olas',
    normalizedQuery: 'olas',
    reasonCode: 'ambiguous_match',
    candidates,
  });
  expect(r.status).toBe('chose');
  if (r.status === 'chose') {
    expect(r.candidate.title).toBe('Egg');
    expect(r.candidate.productUrl).toBe(url);
  }
});

test('createLlmResolveFn returns failed error when completeJson throws', async () => {
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
  expect(r).toEqual({ status: 'failed', outcome: 'error' });
});

test('createLlmResolveFn returns failed error when completeJson returns error reason', async () => {
  const fn = createLlmResolveFn(async () => ({ ok: false, reason: 'error' }));
  const candidates: SearchCandidate[] = [
    { index: 0, title: 't', productUrl: url, priceText: null, packSizeText: null },
  ];
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(r).toEqual({ status: 'failed', outcome: 'error' });
});

test('createLlmResolveFn returns failed invalid_shape for empty candidates', async () => {
  const fn = createLlmResolveFn(async () => ({
    ok: true,
    text: '{"decision":"choose","chosenIndex":0}',
  }));
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates: [],
  });
  expect(r).toEqual({ status: 'failed', outcome: 'invalid_shape' });
});

test('createLlmResolveFn returns failed with parse reason on bad JSON', async () => {
  const fn = createLlmResolveFn(async () => ({ ok: true, text: 'not json' }));
  const candidates: SearchCandidate[] = [
    { index: 0, title: 't', productUrl: url, priceText: null, packSizeText: null },
  ];
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(r).toEqual({ status: 'failed', outcome: 'invalid_json' });
});

test('createLlmResolveFn returns failed model_review_needed when model defers', async () => {
  const fn = createLlmResolveFn(async () => ({
    ok: true,
    text: JSON.stringify({ decision: 'review_needed', chosenIndex: null }),
  }));
  const candidates: SearchCandidate[] = [
    { index: 0, title: 't', productUrl: url, priceText: null, packSizeText: null },
  ];
  const r = await fn({
    query: 'q',
    normalizedQuery: 'q',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(r).toEqual({ status: 'failed', outcome: 'model_review_needed' });
});
