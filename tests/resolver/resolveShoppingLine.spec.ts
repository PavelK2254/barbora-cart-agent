import { expect, test } from '@playwright/test';

import type { SearchCandidate } from '../../src/executor/searchCandidate';
import {
  RESOLVER_REASON_ADD,
  RESOLVER_REASON_AMBIGUOUS,
  RESOLVER_REASON_KNOWN_MAPPING,
  RESOLVER_REASON_KNOWN_MAPPING_INVALID_URL,
  RESOLVER_REASON_NO_PRODUCT_URLS,
  RESOLVER_REASON_PACK_CONFLICT_ALL,
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

test('resolveShoppingLine uses knownProduct when URL is valid Barbora https', () => {
  const url = 'https://www.barbora.lv/produkti/some-slug';
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [],
    knownProduct: { productUrl: url, displayName: 'My piens' },
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.productUrl).toBe(url);
    expect(r.candidate.title).toBe('My piens');
    expect(r.reason).toBe(RESOLVER_REASON_KNOWN_MAPPING);
  }
});

test('resolveShoppingLine knownProduct invalid host yields review_needed', () => {
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [c({ index: 1, title: 'X', productUrl: 'https://www.barbora.lv/p' })],
    knownProduct: { productUrl: 'https://evil.com/p' },
  });
  expect(r.decision).toBe('review_needed');
  expect(r.reason).toBe(RESOLVER_REASON_KNOWN_MAPPING_INVALID_URL);
});

test('resolveShoppingLine knownProduct takes precedence over SERP candidates', () => {
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [c({ index: 1, title: 'Wrong', productUrl: 'https://www.barbora.lv/wrong' })],
    knownProduct: { productUrl: 'https://www.barbora.lv/right' },
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.productUrl).toBe('https://www.barbora.lv/right');
  }
});

test('resolveShoppingLine does not match piens inside bezpiens (word tokens)', () => {
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [c({ index: 1, title: 'Bezpiens', productUrl: 'https://a.lv/1' })],
  });
  expect(r.decision).toBe('review_needed');
  expect(r.reason).toBe(RESOLVER_REASON_WEAK);
});

test('resolveShoppingLine prefers title pack volume matching query', () => {
  const r = resolveShoppingLine({
    query: 'piens 2 l',
    candidates: [
      c({ index: 1, title: 'Piens 1 l', productUrl: 'https://a.lv/1' }),
      c({ index: 2, title: 'Piens 2 l', productUrl: 'https://a.lv/2' }),
    ],
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.index).toBe(2);
  }
});

test('resolveShoppingLine returns PACK_CONFLICT_ALL when every candidate contradicts query pack', () => {
  const r = resolveShoppingLine({
    query: 'piens 2 l',
    candidates: [
      c({ index: 1, title: 'Piens 1 l', productUrl: 'https://a.lv/1' }),
      c({ index: 2, title: 'Piens 1 l', productUrl: 'https://a.lv/2' }),
    ],
  });
  expect(r.decision).toBe('review_needed');
  expect(r.reason).toBe(RESOLVER_REASON_PACK_CONFLICT_ALL);
});

test('resolveShoppingLine ignores unit-price-like packSizeText', () => {
  const r = resolveShoppingLine({
    query: 'piens 2 l',
    candidates: [
      c({
        index: 1,
        title: 'Piens 2 l',
        productUrl: 'https://a.lv/1',
        packSizeText: '0,99€/l',
      }),
    ],
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.index).toBe(1);
  }
});

test('resolveShoppingLine applies gated packSizeText when it looks like pack size', () => {
  const r = resolveShoppingLine({
    query: 'tere piens 2 l',
    candidates: [
      c({
        index: 1,
        title: 'Tere piens',
        productUrl: 'https://a.lv/1',
        packSizeText: '2 l',
      }),
      c({ index: 2, title: 'Tere piens', productUrl: 'https://a.lv/2' }),
    ],
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.index).toBe(1);
  }
});
