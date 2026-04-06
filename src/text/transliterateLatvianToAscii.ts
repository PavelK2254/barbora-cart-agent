/**
 * Maps Latvian letters (and common Latvian-style Latin diacritics) to similar ASCII letters.
 * Used so JSON files and normalized match keys avoid mojibake-prone UTF-8 in constrained tooling,
 * while keeping resolver / known-mapping lookup consistent.
 *
 * Latvian alphabet: A Ā B C Č D E Ē F G Ģ H I Ī J K Ķ L Ļ M N Ņ O P R S Š T U Ū V Z Ž
 */

const LATVIAN_TO_ASCII: Readonly<Record<string, string>> = {
  Ā: 'A',
  ā: 'a',
  Č: 'C',
  č: 'c',
  Ē: 'E',
  ē: 'e',
  Ģ: 'G',
  ģ: 'g',
  Ī: 'I',
  ī: 'i',
  Ķ: 'K',
  ķ: 'k',
  Ļ: 'L',
  ļ: 'l',
  Ņ: 'N',
  ņ: 'n',
  Š: 'S',
  š: 's',
  Ū: 'U',
  ū: 'u',
  Ž: 'Z',
  ž: 'z',
};

/**
 * Replaces Latvian-specific letters with ASCII lookalikes; leaves other code points unchanged.
 */
export function transliterateLatvianToAscii(text: string): string {
  let out = '';
  for (const ch of text) {
    out += LATVIAN_TO_ASCII[ch] ?? ch;
  }
  return out;
}
