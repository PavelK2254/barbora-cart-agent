import { expect, test } from '@playwright/test';

import type { ResolverReviewReasonCode } from '../../src/resolver/resolveShoppingLine';
import { userMessageForResolverReviewReason } from '../../src/run/reviewReasonUserMessages';

const ALL_CODES: ResolverReviewReasonCode[] = [
  'query_empty',
  'known_mapping_invalid',
  'no_candidates',
  'no_usable_candidates',
  'pack_conflict',
  'weak_match',
  'ambiguous_match',
];

test('userMessageForResolverReviewReason returns non-empty string for every code', () => {
  for (const code of ALL_CODES) {
    const msg = userMessageForResolverReviewReason(code);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toContain(code);
  }
});
