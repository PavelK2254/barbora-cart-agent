import type { ResolverReviewReasonCode } from '../resolver/resolveShoppingLine';

const REVIEW_USER_MESSAGES: Record<ResolverReviewReasonCode, string> = {
  query_empty: 'Search text was empty after cleanup; try a clearer product name.',
  known_mapping_invalid: 'Saved product link is not valid; pick a product on Barbora.',
  no_candidates: 'No search results; try different wording or search on Barbora.',
  no_usable_candidates: 'No product links in results; pick a product on Barbora.',
  pack_conflict: 'Pack size does not match your search; pick the right product on Barbora.',
  weak_match: 'No strong match; refine your search or choose on Barbora.',
  ambiguous_match: 'Several similar matches; pick one on Barbora.',
};

export function userMessageForResolverReviewReason(code: ResolverReviewReasonCode): string {
  return REVIEW_USER_MESSAGES[code];
}

/** Shown with add-to-cart result when the line resolved from known-mappings.json. */
export const USER_MESSAGE_ADD_FROM_KNOWN_MAPPING =
  'Using saved Barbora product link for this list line (known-mappings.json).';

/** Shown with add-to-cart result when the line resolved from SERP scoring. */
export const USER_MESSAGE_ADD_FROM_SEARCH = 'Best match from your search; added to cart.';
