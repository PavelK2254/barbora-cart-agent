/**
 * Barbora.lv add-to-cart spike — DOM assumptions (fragile, verify after site updates):
 * - Cookie banner: `#CybotCookiebotDialog` with either `#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll`
 *   or role button name matching /Atļaut visus sīkfailus/i.
 * - Cart verification signal: `button.b-cart-in-header--btn` with a price-like label; Barbora may render two nodes (e.g. mobile/desktop) — use **.last()** so the visible header instance is used.
 * - Add to cart: primary `button` in `main` with accessible name matching Latvian / Russian / English
 *   add phrases (e.g. "В корзину", "Pievienot grozam").
 * Success rule (explicit, not strict +1): header cart text changed, or empty/zero-total → non-zero-total,
 * or parsed € amount increased. Uses before/after reads; avoids networkidle.
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const ERR = '[barbora-add-to-cart-spike]';

const NAV_TIMEOUT_MS = 60_000;
const COOKIE_DIALOG = '#CybotCookiebotDialog';
const COOKIE_OPTIN_ALLOW = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';
/** Locales observed on barbora.lv PDPs */
const ADD_TO_CART_NAME_RE =
  /Pievienot(\s+grozam)?|В корзину|Добавить в корзину|Add to cart/i;

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
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error(
      `${ERR} missing product URL. Pass a full https URL to a Barbora product page (path under /produkti/ or equivalent), e.g. https://www.barbora.lv/produkti/....`,
    );
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error(`${ERR} invalid product URL (not a valid URL string): ${url.slice(0, 200)}`);
  }
  if (u.protocol !== 'https:') {
    throw new Error(
      `${ERR} invalid Barbora product URL: only https is supported. Got ${u.protocol}//${u.host}. Use https://www.barbora.lv/... or https://barbora.lv/....`,
    );
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'barbora.lv' && host !== 'www.barbora.lv') {
    throw new Error(
      `${ERR} invalid Barbora product URL: hostname must be barbora.lv or www.barbora.lv. Got: ${u.hostname}`,
    );
  }
}

async function dismissCookieBannerIfPresent(page: Page): Promise<void> {
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

/** Header cart total: `.last()` prefers the visible duplicate when Barbora renders hidden + visible header controls. */
function cartHeaderLocator(page: Page) {
  return page.locator('button.b-cart-in-header--btn').filter({ hasText: /\d+[.,]\d+/ }).last();
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
  await dismissCookieBannerIfPresent(page);
  await page.waitForTimeout(800);
  await dismissCookieBannerIfPresent(page);

  const cartLoc = cartHeaderLocator(page);
  await cartLoc.waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => {
      throw new Error(
        `${ERR} cart signal not found: no visible button.b-cart-in-header--btn with a price-like label (e.g. 0,00 €). Cannot verify cart changes. URL: ${page.url()}`,
      );
    });

  const beforeSignal = normalizeSignalText(await cartLoc.innerText());

  const inMain = page.locator('main').getByRole('button', { name: ADD_TO_CART_NAME_RE }).first();
  await inMain.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  const addBtn = (await inMain.isVisible().catch(() => false))
    ? inMain
    : page.getByRole('button', { name: ADD_TO_CART_NAME_RE }).first();

  await addBtn.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
    throw new Error(
      `${ERR} add-to-cart button not found. Tried: main.getByRole('button', { name: /Pievienot|В корзину|Add to cart/i }) then the same globally. Update ADD_TO_CART_NAME_RE or DOM scope if the site changed. URL: ${page.url()}`,
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
