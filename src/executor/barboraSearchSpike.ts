/**
 * Barbora.lv search spike — DOM assumptions (fragile, verify after site updates):
 * - Desktop layout: visible search field is the last duplicate `#fti-search` (two nodes exist; first is hidden).
 * - Results: product tiles use `.product-card-next`; each has `a[href^="/produkti/"]` and an `img[alt]` title.
 * - Cookie banner: optional `#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll`.
 * Waits use URL + visible tiles, not networkidle.
 */

import type { Page } from '@playwright/test';

import type { SearchCandidate } from './searchCandidate';

const ERR = '[barbora-search-spike]';

const BARBORA_ORIGIN = 'https://www.barbora.lv';
const COOKIE_ALLOW = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';
/** Prefer last matching input — Barbora renders a hidden duplicate for mobile/other layout. */
const SEARCH_INPUT = '#fti-search';
const RESULT_CARD = '.product-card-next';
const NAV_TIMEOUT_MS = 45_000;
const RESULTS_TIMEOUT_MS = 45_000;

export interface RunBarboraSearchOptions {
  query: string;
  topN: number;
}

function toAbsoluteUrl(origin: string, href: string | null): string | null {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  const base = origin.replace(/\/$/, '');
  return href.startsWith('/') ? `${base}${href}` : `${base}/${href}`;
}

/** Pull €-bearing snippets from card text; shelf price usually has no "/"; unit price has €/kg, €/l, etc. */
function splitPriceHints(cardText: string): { priceText: string | null; packSizeText: string | null } {
  // Barbora splits digits and € across lines in innerText; strip whitespace before matching.
  const compact = cardText.replace(/\s+/g, '');
  // Unit after € is short letters (lv/ru), e.g. €/l or €/л; {1,4} avoids eating "Pievienot".
  const priceToken = /\d+[.,]\d+€(?:\/\p{L}{1,4})?/giu;
  const matches = [...compact.matchAll(priceToken)].map((m) => m[0]);
  if (matches.length === 0) return { priceText: null, packSizeText: null };
  const perUnit = matches.filter((m) => m.includes('/'));
  const shelf = matches.filter((m) => !m.includes('/'));
  const priceText = shelf[0] ?? matches[0] ?? null;
  const packSizeText = perUnit[0] ?? null;
  return { priceText, packSizeText };
}

export async function runBarboraSearchAndCollect(
  page: Page,
  options: RunBarboraSearchOptions,
): Promise<SearchCandidate[]> {
  const { query, topN } = options;
  if (!query.trim()) {
    throw new Error(`${ERR} search query is empty`);
  }

  await page.goto(`${BARBORA_ORIGIN}/`, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });

  const cookieBtn = page.locator(COOKIE_ALLOW);
  if (await cookieBtn.isVisible().catch(() => false)) {
    await cookieBtn.click();
    await page.locator(SEARCH_INPUT).last().waitFor({ state: 'visible', timeout: 10_000 });
  }

  const search = page.locator(SEARCH_INPUT).last();
  await search.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
    throw new Error(
      `${ERR} search field not visible (selector ${SEARCH_INPUT}). URL: ${page.url()}`,
    );
  });

  await search.fill(query);
  await search.press('Enter');

  await page.waitForURL(/meklet/i, { timeout: NAV_TIMEOUT_MS }).catch(() => {
    throw new Error(
      `${ERR} expected navigation to search URL (/meklet/) after submit. Current URL: ${page.url()}`,
    );
  });

  const origin = new URL(page.url()).origin;

  const cards = page.locator(RESULT_CARD);
  await cards
    .first()
    .waitFor({ state: 'visible', timeout: RESULTS_TIMEOUT_MS })
    .catch(() => {
      throw new Error(
        `${ERR} no visible product tiles (${RESULT_CARD}) after search. URL: ${page.url()}`,
      );
    });

  const count = await cards.count();
  const limit = Math.min(topN, count);
  const out: SearchCandidate[] = [];

  for (let i = 0; i < limit; i++) {
    const card = cards.nth(i);
    const link = card.locator('a[href^="/produkti/"]').first();
    const href = (await link.count()) > 0 ? await link.getAttribute('href') : null;
    const img = card.locator('img[alt]').first();
    const title =
      (await img.count()) > 0
        ? ((await img.getAttribute('alt')) ?? '').trim()
        : ((await link.innerText().catch(() => '')) ?? '').trim();

    const rawText = (await card.innerText()).replace(/\s+/g, ' ').trim();
    const { priceText, packSizeText } = splitPriceHints(rawText);

    out.push({
      index: i + 1,
      title: title || '(no title)',
      productUrl: toAbsoluteUrl(origin, href),
      priceText,
      packSizeText,
    });
  }

  return out;
}
