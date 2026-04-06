import { transliterateLatvianToAscii } from '../text/transliterateLatvianToAscii';

/**
 * Shared text normalization for resolver scoring and known-mapping key lookup.
 * Latvian diacritics are folded to ASCII first so list lines and Barbora titles match reliably.
 */
export function normalizeForMatch(text: string): string {
  return transliterateLatvianToAscii(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
