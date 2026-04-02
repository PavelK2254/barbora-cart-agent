import { expect, test } from '@playwright/test';

import type { SearchCandidate } from '../../src/executor/searchCandidate';
import {
  RESOLVER_REASON_ADD,
  RESOLVER_REASON_AMBIGUOUS,
  RESOLVER_REASON_NO_PRODUCT_URLS,
  RESOLVER_REASON_QUERY_EMPTY_AFTER_NORMALIZE,
  RESOLVER_REASON_WEAK,
  resolveShoppingLine,
} from '../../src/resolver/resolveShoppingLine';

function c(
  partial: Pick<SearchCandidate, 'index' | 'title' | 'productUrl'> &
    Partial<Omit<SearchCandidate, 'index' | 'title' | 'productUrl'>>,
): SearchCandidate {
  return {
    priceText: null,
    packSizeText: null,
    ...partial,
  };
}

test('resolveShoppingLine returns review_needed when query normalizes to empty', () => {
  const r = resolveShoppingLine({ query: '...', candidates: [] });
  expect(r.decision).toBe('review_needed');
  expect(r.reason).toBe(RESOLVER_REASON_QUERY_EMPTY_AFTER_NORMALIZE);
});

test('resolveShoppingLine returns review_needed when no candidate has productUrl', () => {
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [
      c({ index: 1, title: 'Piens 2%', productUrl: null }),
      c({ index: 2, title: 'Piens 3%', productUrl: '   ' }),
    ],
  });
  expect(r.decision).toBe('review_needed');
  expect(r.reason).toBe(RESOLVER_REASON_NO_PRODUCT_URLS);
});

test('resolveShoppingLine ignores candidates without URL when scoring others', () => {
  const r = resolveShoppingLine({
    query: 'maize',
    candidates: [
      c({ index: 1, title: 'Something else', productUrl: null }),
      c({ index: 2, title: 'Pilngraudu maize', productUrl: 'https://barbora.lv/produkti/x' }),
    ],
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.index).toBe(2);
    expect(r.reason).toBe(RESOLVER_REASON_ADD);
  }
});

test('resolveShoppingLine returns review_needed when best score is zero', () => {
  const r = resolveShoppingLine({
    query: 'xyzunknown',
    candidates: [c({ index: 1, title: 'Completely different product', productUrl: 'https://a.lv/p' })],
  });
  expect(r.decision).toBe('review_needed');
  expect(r.reason).toBe(RESOLVER_REASON_WEAK);
});

test('resolveShoppingLine returns review_needed on tie for top score', () => {
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [
      c({ index: 1, title: 'Piens 2%', productUrl: 'https://a.lv/1' }),
      c({ index: 2, title: 'Piens 3%', productUrl: 'https://a.lv/2' }),
    ],
  });
  expect(r.decision).toBe('review_needed');
  expect(r.reason).toBe(RESOLVER_REASON_AMBIGUOUS);
});

test('resolveShoppingLine picks unique best by token overlap', () => {
  const r = resolveShoppingLine({
    query: 'pilngraudu maize',
    candidates: [
      c({ index: 1, title: 'Balta maize', productUrl: 'https://a.lv/1' }),
      c({ index: 2, title: 'Pilngraudu maize 500g', productUrl: 'https://a.lv/2' }),
    ],
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.index).toBe(2);
  }
});

test('resolveShoppingLine prefers full-query substring over token-only lower score', () => {
  const r = resolveShoppingLine({
    query: 'tere piens',
    candidates: [
      c({ index: 1, title: 'Piens', productUrl: 'https://a.lv/1' }),
      c({ index: 2, title: 'Tere piens 2,5%', productUrl: 'https://a.lv/2' }),
    ],
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.index).toBe(2);
  }
});

test('resolveShoppingLine is deterministic for same input', () => {
  const input = {
    query: 'banāni',
    candidates: [c({ index: 1, title: 'Banāni, 1 kg', productUrl: 'https://a.lv/b' })],
  };
  const a = resolveShoppingLine(input);
  const b = resolveShoppingLine(input);
  expect(a).toEqual(b);
});
