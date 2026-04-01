/**
 * Plain search-result row for inspection and future resolver input.
 * Populated by Barbora executor automation only — keep free of Playwright types.
 */
export interface SearchCandidate {
  /** 1-based index in the extracted list */
  index: number;
  /** Product title as shown (often from image alt on listing cards) */
  title: string;
  /** Absolute HTTPS URL to the product page, if a /produkti/ link exists */
  productUrl: string | null;
  /** Primary shelf price text when detectable (e.g. "1.49€") */
  priceText: string | null;
  /** Unit price or pack hint when detectable (e.g. "0,99€/l"); optional */
  packSizeText: string | null;
}
