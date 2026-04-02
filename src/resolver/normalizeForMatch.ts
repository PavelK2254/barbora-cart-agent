/**
 * Shared text normalization for resolver scoring and known-mapping key lookup.
 */
export function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
