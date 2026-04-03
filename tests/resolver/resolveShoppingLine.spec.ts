import { expect, test } from '@playwright/test';

import type { SearchCandidate } from '../../src/executor/searchCandidate';
import {
  RESOLVER_REVIEW_DETAIL_AMBIGUOUS,
  RESOLVER_REVIEW_DETAIL_KNOWN_MAPPING_INVALID,
  RESOLVER_REVIEW_DETAIL_NO_CANDIDATES,
  RESOLVER_REVIEW_DETAIL_NO_USABLE_CANDIDATES,
  RESOLVER_REVIEW_DETAIL_PACK_CONFLICT,
  RESOLVER_REVIEW_DETAIL_QUERY_EMPTY,
  RESOLVER_REVIEW_DETAIL_WEAK,
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
  if (r.decision === 'review_needed') {
    expect(r.reasonCode).toBe('query_empty');
    expect(r.detail).toBe(RESOLVER_REVIEW_DETAIL_QUERY_EMPTY);
  }
});

test('resolveShoppingLine returns review_needed no_candidates when SERP list is empty', () => {
  const r = resolveShoppingLine({ query: 'piens', candidates: [] });
  expect(r.decision).toBe('review_needed');
  if (r.decision === 'review_needed') {
    expect(r.reasonCode).toBe('no_candidates');
    expect(r.detail).toBe(RESOLVER_REVIEW_DETAIL_NO_CANDIDATES);
  }
});

test('resolveShoppingLine returns review_needed no_usable_candidates when no candidate has productUrl', () => {
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [
      c({ index: 1, title: 'Piens 2%', productUrl: null }),
      c({ index: 2, title: 'Piens 3%', productUrl: '   ' }),
    ],
  });
  expect(r.decision).toBe('review_needed');
  if (r.decision === 'review_needed') {
    expect(r.reasonCode).toBe('no_usable_candidates');
    expect(r.detail).toBe(RESOLVER_REVIEW_DETAIL_NO_USABLE_CANDIDATES);
  }
});

test('resolveShoppingLine returns no_usable_candidates when links are not valid Barbora URLs', () => {
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [
      c({ index: 1, title: 'Piens 2%', productUrl: 'https://other-shop.example/produkti/1' }),
      c({ index: 2, title: 'Piens 3%', productUrl: 'https://other-shop.example/produkti/2' }),
    ],
  });
  expect(r.decision).toBe('review_needed');
  if (r.decision === 'review_needed') {
    expect(r.reasonCode).toBe('no_usable_candidates');
    expect(r.detail).toBe(RESOLVER_REVIEW_DETAIL_NO_USABLE_CANDIDATES);
  }
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
  }
});

test('resolveShoppingLine returns review_needed when best score is zero', () => {
  const r = resolveShoppingLine({
    query: 'xyzunknown',
    candidates: [
      c({
        index: 1,
        title: 'Completely different product',
        productUrl: 'https://www.barbora.lv/produkti/weak-only',
      }),
    ],
  });
  expect(r.decision).toBe('review_needed');
  if (r.decision === 'review_needed') {
    expect(r.reasonCode).toBe('weak_match');
    expect(r.detail).toBe(RESOLVER_REVIEW_DETAIL_WEAK);
  }
});

test('resolveShoppingLine returns review_needed on tie for top score', () => {
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [
      c({ index: 1, title: 'Piens 2%', productUrl: 'https://www.barbora.lv/produkti/p1' }),
      c({ index: 2, title: 'Piens 3%', productUrl: 'https://www.barbora.lv/produkti/p2' }),
    ],
  });
  expect(r.decision).toBe('review_needed');
  if (r.decision === 'review_needed') {
    expect(r.reasonCode).toBe('ambiguous_match');
    expect(r.detail).toBe(RESOLVER_REVIEW_DETAIL_AMBIGUOUS);
  }
});

test('resolveShoppingLine picks unique best by token overlap', () => {
  const r = resolveShoppingLine({
    query: 'pilngraudu maize',
    candidates: [
      c({ index: 1, title: 'Balta maize', productUrl: 'https://www.barbora.lv/produkti/m1' }),
      c({ index: 2, title: 'Pilngraudu maize 500g', productUrl: 'https://www.barbora.lv/produkti/m2' }),
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
      c({ index: 1, title: 'Piens', productUrl: 'https://www.barbora.lv/produkti/t1' }),
      c({ index: 2, title: 'Tere piens 2,5%', productUrl: 'https://www.barbora.lv/produkti/t2' }),
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
    candidates: [c({ index: 1, title: 'Banāni, 1 kg', productUrl: 'https://www.barbora.lv/produkti/b' })],
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
  }
});

test('resolveShoppingLine knownProduct invalid host yields review_needed', () => {
  const r = resolveShoppingLine({
    query: 'piens',
    candidates: [c({ index: 1, title: 'X', productUrl: 'https://www.barbora.lv/p' })],
    knownProduct: { productUrl: 'https://evil.com/p' },
  });
  expect(r.decision).toBe('review_needed');
  if (r.decision === 'review_needed') {
    expect(r.reasonCode).toBe('known_mapping_invalid');
    expect(r.detail).toBe(RESOLVER_REVIEW_DETAIL_KNOWN_MAPPING_INVALID);
  }
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
    candidates: [c({ index: 1, title: 'Bezpiens', productUrl: 'https://www.barbora.lv/produkti/bz' })],
  });
  expect(r.decision).toBe('review_needed');
  if (r.decision === 'review_needed') {
    expect(r.reasonCode).toBe('weak_match');
    expect(r.detail).toBe(RESOLVER_REVIEW_DETAIL_WEAK);
  }
});

test('resolveShoppingLine prefers title pack volume matching query', () => {
  const r = resolveShoppingLine({
    query: 'piens 2 l',
    candidates: [
      c({ index: 1, title: 'Piens 1 l', productUrl: 'https://www.barbora.lv/produkti/pk1' }),
      c({ index: 2, title: 'Piens 2 l', productUrl: 'https://www.barbora.lv/produkti/pk2' }),
    ],
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.index).toBe(2);
  }
});

test('resolveShoppingLine returns pack_conflict when every candidate contradicts query pack', () => {
  const r = resolveShoppingLine({
    query: 'piens 2 l',
    candidates: [
      c({ index: 1, title: 'Piens 1 l', productUrl: 'https://www.barbora.lv/produkti/pc1' }),
      c({ index: 2, title: 'Piens 1 l', productUrl: 'https://www.barbora.lv/produkti/pc2' }),
    ],
  });
  expect(r.decision).toBe('review_needed');
  if (r.decision === 'review_needed') {
    expect(r.reasonCode).toBe('pack_conflict');
    expect(r.detail).toBe(RESOLVER_REVIEW_DETAIL_PACK_CONFLICT);
  }
});

test('resolveShoppingLine ignores unit-price-like packSizeText', () => {
  const r = resolveShoppingLine({
    query: 'piens 2 l',
    candidates: [
      c({
        index: 1,
        title: 'Piens 2 l',
        productUrl: 'https://www.barbora.lv/produkti/unit1',
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
        productUrl: 'https://www.barbora.lv/produkti/g1',
        packSizeText: '2 l',
      }),
      c({ index: 2, title: 'Tere piens', productUrl: 'https://www.barbora.lv/produkti/g2' }),
    ],
  });
  expect(r.decision).toBe('add');
  if (r.decision === 'add') {
    expect(r.candidate.index).toBe(1);
  }
});
