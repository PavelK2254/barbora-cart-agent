/**
 * Barbora.lv add-to-cart spike — DOM assumptions (fragile, verify after site updates):
 * - Cookie banner: `#CybotCookiebotDialog` with either `#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll`
 *   or role button name matching /Atļaut visus sīkfailus/i.
 * - Cart verification signal: `#fti-cart-delivery` (2026 header, duplicate nodes — use **.first()** for the visible chip),
 *   legacy `button.b-cart-in-header--btn`, or `header` `a`/`button` with a € amount.
 * - Add to cart (2026-05): Barbora dropped `<main>` on PDPs and no longer exposes a stable `id` on the CTA; scope the
 *   same accessible-name match to `.b-product-info--price-and-quantity` or `.b-product-info-wrap .b-product-page--quantity-control`
 *   so we do not click “В корзину” on unrelated product tiles. Re-verify with logged-in session: `npx tsx scripts/inspect-barbora-pdp.ts --url …`.
 * Success rule (explicit, not strict +1): header cart text changed, or empty/zero-total → non-zero-total,
 * or parsed € amount increased. Uses before/after reads; avoids networkidle.
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { validateBarboraProductUrl } from '../barbora/validateBarboraProductUrl';

const ERR = '[barbora-add-to-cart-spike]';

const NAV_TIMEOUT_MS = 60_000;
const COOKIE_DIALOG = '#CybotCookiebotDialog';
const COOKIE_OPTIN_ALLOW = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';
/** Locales observed on barbora.lv PDPs */
const ADD_TO_CART_NAME_RE =
  /Pievienot(\s+grozam)?|В корзину|Добавить в корзину|Add to cart/i;

/** PDP hero add-to-cart (2026 layout — no `<main>`, unstable button `id`). */
const PDP_ADD_IN_PRICE_COL = '.b-product-info--price-and-quantity';
const PDP_ADD_IN_PAGE_CONTROL = '.b-product-info-wrap .b-product-page--quantity-control';

function primaryAddToCartLocator(page: Page) {
  const inPriceCol = page
    .locator(PDP_ADD_IN_PRICE_COL)
    .getByRole('button', { name: ADD_TO_CART_NAME_RE })
    .first();
  const inPageControl = page
    .locator(PDP_ADD_IN_PAGE_CONTROL)
    .getByRole('button', { name: ADD_TO_CART_NAME_RE })
    .first();
  const globalFallback = page.getByRole('button', { name: ADD_TO_CART_NAME_RE }).first();
  return { inPriceCol, inPageControl, globalFallback };
}

export interface RunBarboraAddToCartOptions {
  productUrl: string;
}

export interface AddToCartSpikeResult {
  productUrl: string;
  beforeSignal: string;
  afterSignal: string;
  message: string;
}

function assertValidBarboraProductUrl(url: string): void {
  const r = validateBarboraProductUrl(url);
  if (!r.ok) {
    throw new Error(`${ERR} ${r.message}`);
  }
}

/** Shared with local PDP inspect spike — Barbora mounts Cookiebot shortly after load. */
export async function dismissBarboraCookieBannerIfPresent(page: Page): Promise<void> {
  const dialog = page.locator(COOKIE_DIALOG);
  const optin = page.locator(COOKIE_OPTIN_ALLOW);
  const lvAllow = page.getByRole('button', { name: /Atļaut visus sīkfailus/i });

  const dialogShown = await dialog.isVisible().catch(() => false);
  const optinShown = await optin.isVisible().catch(() => false);
  const lvShown = await lvAllow.isVisible().catch(() => false);
  if (!dialogShown && !optinShown && !lvShown) {
    return;
  }

  if (optinShown) {
    await optin.click();
  } else if (lvShown) {
    await lvAllow.click();
  } else {
    await optin.click({ timeout: 5000 }).catch(async () => {
      await lvAllow.click({ timeout: 5000 });
    });
  }

  await dialog.waitFor({ state: 'hidden', timeout: 25_000 }).catch(() => {
    throw new Error(
      `${ERR} cookie banner still visible after accept attempt. Dismiss selectors: ${COOKIE_OPTIN_ALLOW} or role button /Atļaut visus sīkfailus/i. URL: ${page.url()}`,
    );
  });
}

/** Header cart total: `#fti-cart-delivery` is duplicated (mobile/desktop); `.first()` matches the visible instance in current Barbora DOM order. */
function cartHeaderLocator(page: Page) {
  const euro = /\d+[.,]\d+\s*€|\d+[.,]\d+€/;
  const fti = page.locator('#fti-cart-delivery').first();
  const legacy = page.locator('button.b-cart-in-header--btn').filter({ hasText: /\d+[.,]\d+/ }).last();
  const headerMoney = page.locator('header a, header button').filter({ hasText: euro }).last();
  return fti.or(legacy).or(headerMoney).first();
}

function normalizeSignalText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** First amount like 1,49€ or 0,00 € in the string; null if none. */
function parseFirstEuroAmount(text: string): number | null {
  const m = normalizeSignalText(text).match(/(\d+)[.,](\d+)\s*€/i);
  if (!m) return null;
  return parseFloat(`${m[1]}.${m[2]}`);
}

/**
 * Practical success: signal changed, or went from zero-total to non-zero display, or € amount increased.
 * Not limited to “count +1”.
 */
function cartAddAppearsSuccessful(before: string, after: string): boolean {
  const b = normalizeSignalText(before);
  const a = normalizeSignalText(after);
  if (b === a) {
    const nb = parseFirstEuroAmount(b);
    const na = parseFirstEuroAmount(a);
    if (nb !== null && na !== null && na > nb) return true;
    return false;
  }
  const zeroish = /^0[,.]00\s*€\s*$/i;
  if (zeroish.test(b) && a.length > 0 && !zeroish.test(a)) return true;
  return true;
}

export async function runBarboraAddToCartSpike(
  page: Page,
  options: RunBarboraAddToCartOptions,
): Promise<AddToCartSpikeResult> {
  const productUrl = options.productUrl.trim();
  assertValidBarboraProductUrl(productUrl);

  await page.goto(productUrl, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });

  // Cookie dialog often mounts shortly after domcontentloaded; wait briefly then dismiss (retry once if it appears late).
  await page.waitForTimeout(1500);
  await dismissBarboraCookieBannerIfPresent(page);
  await page.waitForTimeout(1200);

  const cartLoc = cartHeaderLocator(page);
  await cartLoc.waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => {
      throw new Error(
        `${ERR} cart signal not found: no visible header cart total (#fti-cart-delivery, legacy .b-cart-in-header--btn, or header link/button with a € amount). If you see a delivery “connect” prompt, finish that in the browser, then re-run session:bootstrap. URL: ${page.url()}`,
      );
    });

  const beforeSignal = normalizeSignalText(await cartLoc.innerText());

  const { inPriceCol, inPageControl, globalFallback } = primaryAddToCartLocator(page);
  await inPriceCol.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  await inPageControl.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});

  let addBtn = inPriceCol;
  if (!(await inPriceCol.isVisible().catch(() => false))) {
    addBtn = (await inPageControl.isVisible().catch(() => false)) ? inPageControl : globalFallback;
  }

  await addBtn.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
    throw new Error(
      `${ERR} add-to-cart button not found. Tried: ${PDP_ADD_IN_PRICE_COL} and ${PDP_ADD_IN_PAGE_CONTROL} (role button, name /Pievienot|В корзину|Add to cart/i), then global fallback. Update selectors if Barbora changed again. URL: ${page.url()}`,
    );
  });

  await addBtn.click();

  try {
    await expect
      .poll(
        async () => {
          const t = normalizeSignalText(await cartLoc.innerText());
          return cartAddAppearsSuccessful(beforeSignal, t);
        },
        {
          timeout: 25_000,
          intervals: [150, 300, 500],
        },
      )
      .toBe(true);
  } catch {
    const afterFail = normalizeSignalText(await cartLoc.innerText().catch(() => ''));
    throw new Error(
      `${ERR} cart state unchanged after add (success rule: signal text changed, zero-total → non-zero, or € amount increased). before="${beforeSignal}" after="${afterFail}". URL: ${page.url()}`,
    );
  }

  const afterSignal = normalizeSignalText(await cartLoc.innerText());

  if (!cartAddAppearsSuccessful(beforeSignal, afterSignal)) {
    throw new Error(
      `${ERR} cart state unchanged after add (final check). before="${beforeSignal}" after="${afterSignal}". URL: ${page.url()}`,
    );
  }

  return {
    productUrl,
    beforeSignal,
    afterSignal,
    message: 'Add-to-cart succeeded per header cart signal rule.',
  };
}
