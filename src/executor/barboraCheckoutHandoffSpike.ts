/**
 * Barbora.lv checkout handoff spike — DOM assumptions (fragile, verify after site updates):
 *
 * Handoff boundary (verified manually 2026-04): first pre-payment screen after the cart is the
 * checkout order summary at `https://www.barbora.lv/checkout` (also `barbora.lv/checkout` after redirect).
 * Visible signal: main page heading `h1` (e.g. LV "Tavs pasūtījums", RU "Твой заказ" / "Ваш заказ").
 * The cart page is `/grozs` with primary CTA `#fti-checkout-continue` (label e.g. "Продолжить" / Turpināt).
 * A MUI modal may appear on `/grozs` with close `aria-label` "Закрыть" / "Aizvērt" — dismiss before the CTA.
 * If the Continue control does not navigate under automation (observed), the spike falls back to
 * `page.goto(/checkout)` — same destination as a successful Continue from cart.
 *
 * Cookie banner: same as add-to-cart spike (`#CybotCookiebotDialog`, etc.) — duplicated here on purpose.
 *
 * Payment is never automated: this module stops on the checkout summary URL and does not interact with
 * payment or order confirmation.
 */

import type { Page } from '@playwright/test';

const ERR = '[barbora-checkout-handoff-spike]';

const NAV_TIMEOUT_MS = 60_000;
const BARBORA_ORIGIN = 'https://www.barbora.lv';
const COOKIE_DIALOG = '#CybotCookiebotDialog';
const COOKIE_OPTIN_ALLOW = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';

/** Cart page path (opens “cart” UI). */
const PATH_CART = '/grozs';
/** First safe handoff path after cart (pre-payment order summary). */
const PATH_CHECKOUT = '/checkout';

/**
 * Short denylist for accessible names — we use `#fti-checkout-continue`, but this guards mistaken use
 * of a payment-looking control if the DOM changes.
 */
const PAYMENT_LIKE_NAME_RE =
  /^(apmaksāt|maksāt|maksāj|pay|оплат|payer|confirm\s+order|apstiprināt\s+pasūtījumu|pabeigt\s+pasūtījumu)/i;

/** Checkout summary heading (locale-dependent). */
const HANDOFF_H1_RE =
  /Tavs pasūtījums|Jūsu pasūtījums|Ваш заказ|Твой заказ|Your order|Ihre Bestellung/i;

const LOGIN_PATH_RE = /\/(login|ielogoties|signin)(\/|$|\?)/i;

export interface RunBarboraCheckoutHandoffOptions {
  /** Reserved for future spike options; keep empty for now. */
}

export type HandoffDetectedVia =
  | { kind: 'url'; pattern: string; matchedUrl: string }
  | { kind: 'heading'; matcher: string; text: string }
  | {
      kind: 'combined';
      checks: Array<{ label: string; ok: boolean; detail?: string }>;
      towardCheckout: { method: 'cart_continue_click' | 'navigate_fallback'; note?: string };
    };

export interface CheckoutHandoffSpikeResult {
  handoffReached: boolean;
  finalUrl: string;
  stepsAttempted: string[];
  message: string;
  cartSignalBefore?: string;
  handoffDetectedVia?: HandoffDetectedVia;
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

function appearsCartEmptyFromHeaderSignal(cartSignal: string): boolean {
  const t = normalizeSignalText(cartSignal);
  if (/\b0[,.]00\s*€/i.test(t)) return true;
  const amt = parseFirstEuroAmount(t);
  return amt !== null && amt === 0;
}

/** Header cart total: `.last()` prefers the visible duplicate when Barbora renders hidden + visible header controls. */
function cartHeaderLocator(page: Page) {
  return page.locator('button.b-cart-in-header--btn').filter({ hasText: /\d+[.,]\d+/ }).last();
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
      `${ERR} cookie banner still visible after accept attempt. URL: ${page.url()}`,
    );
  });
}

async function dismissCartModalIfPresent(page: Page): Promise<void> {
  const modal = page.locator('#fti-pop-up-modal');
  const visible = await modal.isVisible().catch(() => false);
  if (!visible) return;

  const close = modal.locator(
    '[aria-label="Закрыть"], [aria-label="Aizvērt"], [aria-label="Close"], button.close, .modal-header button',
  );
  const n = await close.count();
  for (let i = 0; i < n; i++) {
    const btn = close.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 5000 }).catch(() => {});
      break;
    }
  }
  await page.locator('.MuiBackdrop-root').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
}

function checkoutHandoffUrlRegex(): RegExp {
  return /barbora\.lv\/checkout(\/|$|\?)/i;
}

async function assertNotLoginPage(page: Page): Promise<void> {
  const u = page.url();
  if (LOGIN_PATH_RE.test(u)) {
    throw new Error(
      `${ERR} landed on login URL (checkout requires a signed-in session). URL: ${u}. Run: npm run session:bootstrap`,
    );
  }
}

export async function runBarboraCheckoutHandoffSpike(
  page: Page,
  _options: RunBarboraCheckoutHandoffOptions = {},
): Promise<CheckoutHandoffSpikeResult> {
  const stepsAttempted: string[] = [];

  await page.goto(BARBORA_ORIGIN + '/', {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });
  stepsAttempted.push('navigate_home');

  await page.waitForTimeout(1200);
  await dismissCookieBannerIfPresent(page);
  await page.waitForTimeout(600);
  await dismissCookieBannerIfPresent(page);
  stepsAttempted.push('dismiss_cookie_if_present');

  const cartLoc = cartHeaderLocator(page);
  await cartLoc.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {
    throw new Error(
      `${ERR} cart signal not found: no visible button.b-cart-in-header--btn with a price-like label. URL: ${page.url()}`,
    );
  });
  stepsAttempted.push('wait_header_cart_signal');

  const cartSignalBefore = normalizeSignalText(await cartLoc.innerText());
  if (appearsCartEmptyFromHeaderSignal(cartSignalBefore)) {
    throw new Error(
      `${ERR} cart appears empty (header shows zero total). Primary path expects a cart-bearing session with at least one item. Optional: run add-to-cart first, or use --bootstrap on the checkout-handoff spike script. URL: ${page.url()}`,
    );
  }
  stepsAttempted.push('verify_cart_nonempty_header');

  await page.goto(BARBORA_ORIGIN + PATH_CART, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });
  stepsAttempted.push('open_cart_grozs');
  await page.waitForTimeout(1200);
  await assertNotLoginPage(page);

  await dismissCartModalIfPresent(page);
  stepsAttempted.push('dismiss_cart_modal_if_present');

  const continueBtn = page.locator('#fti-checkout-continue');
  await continueBtn.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {
    throw new Error(
      `${ERR} cart continue control #fti-checkout-continue not visible. Is /grozs the cart page? URL: ${page.url()}`,
    );
  });

  const continueText = normalizeSignalText(await continueBtn.innerText());
  if (PAYMENT_LIKE_NAME_RE.test(continueText)) {
    throw new Error(
      `${ERR} refuse to click cart CTA: label looks payment-like ("${continueText.slice(0, 120)}"). URL: ${page.url()}`,
    );
  }

  let towardMethod: 'cart_continue_click' | 'navigate_fallback' = 'cart_continue_click';
  let fallbackNote: string | undefined;

  try {
    await continueBtn.click({ force: true, timeout: 15_000 });
  } catch {
    fallbackNote = 'cart_continue_click_failed';
  }
  stepsAttempted.push('click_cart_checkout_continue');
  await page.waitForTimeout(3500);

  let url = page.url();
  if (!checkoutHandoffUrlRegex().test(url)) {
    towardMethod = 'navigate_fallback';
    fallbackNote =
      (fallbackNote ? fallbackNote + '; ' : '') +
      'navigated_to_checkout_fallback (cart CTA did not reach /checkout under automation)';
    await page.goto(BARBORA_ORIGIN + PATH_CHECKOUT, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT_MS,
    });
    stepsAttempted.push('navigate_checkout_fallback');
    url = page.url();
  }

  await assertNotLoginPage(page);

  if (!checkoutHandoffUrlRegex().test(url)) {
    throw new Error(
      `${ERR} expected checkout handoff URL matching /checkout on barbora.lv. Got: ${url}`,
    );
  }

  const h1 = page.locator('h1').first();
  await h1.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
    throw new Error(`${ERR} no visible h1 on checkout page. URL: ${url}`);
  });
  const headingText = normalizeSignalText(await h1.innerText());
  if (!HANDOFF_H1_RE.test(headingText)) {
    throw new Error(
      `${ERR} checkout h1 does not match expected handoff heading. Got: "${headingText.slice(0, 200)}". URL: ${url}`,
    );
  }

  const handoffDetectedVia: HandoffDetectedVia = {
    kind: 'combined',
    checks: [
      {
        label: 'url_matches_checkout_path',
        ok: true,
        detail: `${checkoutHandoffUrlRegex()} → ${url}`,
      },
      {
        label: 'h1_matches_handoff',
        ok: true,
        detail: `${HANDOFF_H1_RE} → "${headingText}"`,
      },
    ],
    towardCheckout: {
      method: towardMethod,
      note: fallbackNote,
    },
  };

  return {
    handoffReached: true,
    finalUrl: url,
    stepsAttempted,
    message:
      towardMethod === 'navigate_fallback'
        ? 'Checkout handoff reached via /checkout navigation (cart Continue did not change URL under automation).'
        : 'Checkout handoff reached after cart Continue.',
    cartSignalBefore,
    handoffDetectedVia,
  };
}
