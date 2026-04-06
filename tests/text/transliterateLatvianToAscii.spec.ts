import { expect, test } from '@playwright/test';

import { normalizeForMatch } from '../../src/resolver/normalizeForMatch';
import { transliterateLatvianToAscii } from '../../src/text/transliterateLatvianToAscii';

test('transliterateLatvianToAscii maps Latvian letters to ASCII', () => {
  expect(transliterateLatvianToAscii('Āā Čč Ēē Ģģ Īī Ķķ Ļļ Ņņ Šš Ūū Žž')).toBe(
    'Aa Cc Ee Gg Ii Kk Ll Nn Ss Uu Zz',
  );
});

test('normalizeForMatch folds Latvian so equivalent intents match', () => {
  const a = normalizeForMatch('piens 2l');
  const b = normalizeForMatch('piēns 2l');
  expect(a).toBe(b);
});
