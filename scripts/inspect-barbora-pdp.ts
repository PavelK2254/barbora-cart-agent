/**
 * Local dev: dump PDP controls after loading saved Barbora session (same as cart spikes).
 * Barbora often hides the real product chrome until cookies are accepted and/or you are signed in.
 *
 *   npm run session:bootstrap   # if .auth/barbora-storage-state.json is missing or stale
 *   npx tsx scripts/inspect-barbora-pdp.ts --url "https://www.barbora.lv/produkti/tomati-kg"
 */
import './loadDotenv';

import { chromium } from '@playwright/test';

import { dismissBarboraCookieBannerIfPresent } from '../src/executor/barboraAddToCartSpike';
import { validateBarboraProductUrl } from '../src/barbora/validateBarboraProductUrl';
import { assertHasStorageState, storageStateContextOptions } from '../src/session/storageState';

function parseArgs(argv: string[]): { url: string; headed: boolean } {
  let url = '';
  let headed = false;
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift()!;
    if (a === '--help' || a === '-h') {
      console.log(`Usage: npx tsx scripts/inspect-barbora-pdp.ts --url <https://...> [--headed]

Requires a saved session (see npm run session:bootstrap).`);
      process.exit(0);
    }
    if (a === '--url' || a === '-u') {
      url = (rest.shift() ?? '').trim();
      continue;
    }
    if (a === '--headed') {
      headed = true;
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(1);
  }
  return { url, headed };
}

async function main(): Promise<void> {
  const { url, headed } = parseArgs(process.argv.slice(2));
  if (!url) {
    console.error('[inspect-barbora-pdp] missing --url <https://www.barbora.lv/produkti/...>');
    process.exitCode = 1;
    return;
  }
  const v = validateBarboraProductUrl(url);
  if (!v.ok) {
    console.error(`[inspect-barbora-pdp] ${v.message}`);
    process.exitCode = 1;
    return;
  }

  assertHasStorageState();

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    ...storageStateContextOptions(),
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);
    await dismissBarboraCookieBannerIfPresent(page);
    await page.waitForTimeout(800);
    await dismissBarboraCookieBannerIfPresent(page);
    await page.waitForTimeout(3000);

    const report = await page.evaluate(() => {
      const main = document.querySelector('main');
      const mainHtmlLen = main ? main.innerHTML.length : 0;
      const mainButtons = Array.from(main?.querySelectorAll('button, [role="button"]') ?? []);
      const mainPick = mainButtons.map((el) => ({
        tag: el.tagName,
        id: el.id || '',
        role: el.getAttribute('role') || '',
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        aria: el.getAttribute('aria-label') || '',
        dataTestId: el.getAttribute('data-testid') || '',
      }));

      const idHits = Array.from(
        document.querySelectorAll(
          '[id*="add" i][id*="cart" i], [id^="fti-"][id*="product" i], [id^="fti-"][id*="cart" i]',
        ),
      ).map((el) => ({
        tag: el.tagName,
        id: el.id,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      }));

      const textHits = Array.from(document.querySelectorAll('button, [role="button"], a')).filter(
        (el) => /pievienot|корзин|cart/i.test(el.textContent || ''),
      );
      const textPick = textHits.slice(0, 15).map((el) => {
        let p: Element | null = el.parentElement;
        const chain: string[] = [];
        for (let i = 0; i < 6 && p; i++) {
          const id = p.id ? `#${p.id}` : '';
          const cls =
            p.className && typeof p.className === 'string'
              ? '.' + p.className.trim().split(/\s+/).slice(0, 3).join('.')
              : '';
          chain.push(`${p.tagName.toLowerCase()}${id}${cls.slice(0, 80)}`);
          p = p.parentElement;
        }
        return {
          tag: el.tagName,
          id: el.id || '',
          role: el.getAttribute('role') || '',
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
          aria: el.getAttribute('aria-label') || '',
          ancestor6: chain,
        };
      });

      const ftiProductButtons = Array.from(document.querySelectorAll('[id^="fti-"]')).filter(
        (el) =>
          el.tagName === 'BUTTON' &&
          (/cart|add|grozs|korzin/i.test(el.id) || /pievienot|корзин/i.test(el.textContent || '')),
      );
      const ftiBtnPick = ftiProductButtons.map((el) => ({
        tag: el.tagName,
        id: el.id,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        aria: el.getAttribute('aria-label') || '',
      }));

      return {
        title: document.title,
        url: location.href,
        hasMain: !!main,
        mainHtmlLen,
        mainCount: mainButtons.length,
        mainButtons: mainPick,
        idHits,
        textMatchSample: textPick,
        ftiButtonsMatchingCartAdd: ftiBtnPick,
      };
    });

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
