import { expect, test } from '@playwright/test';

import type { SearchCandidate } from '../../src/executor/searchCandidate';
import {
  buildLlmCandidateSlice,
  buildLlmUserPayload,
  llmFallbackEligibleReason,
  normalizedQueryAddsValue,
} from '../../src/llm';

function c(partial: Partial<SearchCandidate> & Pick<SearchCandidate, 'index' | 'title'>): SearchCandidate {
  return {
    productUrl: null,
    priceText: null,
    packSizeText: null,
    ...partial,
  };
}

test('normalizedQueryAddsValue is false when query matches rough normalization', () => {
  expect(normalizedQueryAddsValue('piens', 'piens')).toBe(false);
  expect(normalizedQueryAddsValue('  Piens  ', 'piens')).toBe(false);
});

test('normalizedQueryAddsValue is true when punctuation is stripped in normalize', () => {
  expect(normalizedQueryAddsValue('Olas, 6 gab', 'olas 6 gab')).toBe(true);
});

test('buildLlmCandidateSlice keeps valid Barbora URLs and caps length', () => {
  const list: SearchCandidate[] = [
    c({ index: 1, title: 'a', productUrl: null }),
    c({ index: 2, title: 'b', productUrl: 'https://www.barbora.lv/produkti/b' }),
    c({ index: 3, title: 'c', productUrl: 'https://www.barbora.lv/produkti/c' }),
    c({ index: 4, title: 'd', productUrl: 'http://evil.com/x' }),
    c({ index: 5, title: 'e', productUrl: 'https://www.barbora.lv/produkti/e' }),
    c({ index: 6, title: 'f', productUrl: 'https://www.barbora.lv/produkti/f' }),
    c({ index: 7, title: 'g', productUrl: 'https://www.barbora.lv/produkti/g' }),
  ];
  const slice = buildLlmCandidateSlice(list, 3);
  expect(slice.map((x) => x.title)).toEqual(['b', 'c', 'e']);
});

test('llmFallbackEligibleReason narrows resolver codes', () => {
  expect(llmFallbackEligibleReason('ambiguous_match')).toBe(true);
  expect(llmFallbackEligibleReason('weak_match')).toBe(true);
  expect(llmFallbackEligibleReason('no_candidates')).toBe(false);
  expect(llmFallbackEligibleReason('pack_conflict')).toBe(false);
});

test('buildLlmUserPayload omits normalizedQuery when redundant', () => {
  const candidates: SearchCandidate[] = [
    {
      index: 1,
      title: 'T',
      productUrl: 'https://www.barbora.lv/produkti/t',
      priceText: '1€',
      packSizeText: null,
    },
  ];
  const payload = buildLlmUserPayload({
    query: 'piens',
    normalizedQuery: 'piens',
    reasonCode: 'weak_match',
    candidates,
  });
  expect(payload.normalizedQuery).toBeUndefined();
  expect(payload.candidates[0]!.index).toBe(0);
});

test('buildLlmUserPayload includes normalizedQuery when it adds value', () => {
  const candidates: SearchCandidate[] = [
    {
      index: 1,
      title: 'T',
      productUrl: 'https://www.barbora.lv/produkti/t',
      priceText: null,
      packSizeText: null,
    },
  ];
  const payload = buildLlmUserPayload({
    query: 'Olas, 6 gab',
    normalizedQuery: 'olas 6 gab',
    reasonCode: 'ambiguous_match',
    candidates,
  });
  expect(payload.normalizedQuery).toBe('olas 6 gab');
});
