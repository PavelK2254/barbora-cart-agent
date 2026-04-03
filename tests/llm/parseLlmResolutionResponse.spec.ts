import { expect, test } from '@playwright/test';

import type { SearchCandidate } from '../../src/executor/searchCandidate';
import { parseLlmResolutionResponse } from '../../src/llm';

const goodUrl = 'https://www.barbora.lv/produkti/x';

function row(i: number, title: string): SearchCandidate {
  return {
    index: i,
    title,
    productUrl: goodUrl,
    priceText: null,
    packSizeText: null,
  };
}

const two = [row(1, 'A'), row(2, 'B')];

test('parseLlmResolutionResponse returns null on invalid JSON', () => {
  expect(parseLlmResolutionResponse('not json', two)).toBeNull();
});

test('parseLlmResolutionResponse accepts fenced markdown JSON', () => {
  const raw = '```json\n{"decision":"choose","chosenIndex":1}\n```';
  const r = parseLlmResolutionResponse(raw, two);
  expect(r?.title).toBe('B');
});

test('parseLlmResolutionResponse returns null for review_needed decision', () => {
  const raw = JSON.stringify({ decision: 'review_needed', chosenIndex: null });
  expect(parseLlmResolutionResponse(raw, two)).toBeNull();
});

test('parseLlmResolutionResponse returns null when chosenIndex out of range', () => {
  const raw = JSON.stringify({ decision: 'choose', chosenIndex: 2 });
  expect(parseLlmResolutionResponse(raw, two)).toBeNull();
});

test('parseLlmResolutionResponse returns null when chosenIndex is not integer', () => {
  const raw = JSON.stringify({ decision: 'choose', chosenIndex: 0.5 });
  expect(parseLlmResolutionResponse(raw, two)).toBeNull();
});

test('parseLlmResolutionResponse returns null when decision is invalid', () => {
  const raw = JSON.stringify({ decision: 'pick', chosenIndex: 0 });
  expect(parseLlmResolutionResponse(raw, two)).toBeNull();
});

test('parseLlmResolutionResponse returns null when URL is not valid Barbora', () => {
  const bad: SearchCandidate[] = [
    {
      index: 0,
      title: 'x',
      productUrl: 'https://evil.com/p',
      priceText: null,
      packSizeText: null,
    },
  ];
  const raw = JSON.stringify({ decision: 'choose', chosenIndex: 0 });
  expect(parseLlmResolutionResponse(raw, bad)).toBeNull();
});

test('parseLlmResolutionResponse maps 0-based index into llm list only', () => {
  const raw = JSON.stringify({ decision: 'choose', chosenIndex: 0 });
  const r = parseLlmResolutionResponse(raw, two);
  expect(r?.title).toBe('A');
});
