/**
 * Barbora-only product URL rules (no Playwright). Shared by add-to-cart, known mappings, resolver.
 */

export type ValidateBarboraProductUrlResult =
  | { ok: true; productUrl: string }
  | { ok: false; message: string };

export function validateBarboraProductUrl(raw: string): ValidateBarboraProductUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      message:
        'missing product URL. Pass a full https URL to a Barbora product page (path under /produkti/ or equivalent), e.g. https://www.barbora.lv/produkti/....',
    };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message: `invalid product URL (not a valid URL string): ${raw.slice(0, 200)}`,
    };
  }
  if (u.protocol !== 'https:') {
    return {
      ok: false,
      message: `invalid Barbora product URL: only https is supported. Got ${u.protocol}//${u.host}. Use https://www.barbora.lv/... or https://barbora.lv/....`,
    };
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'barbora.lv' && host !== 'www.barbora.lv') {
    return {
      ok: false,
      message: `invalid Barbora product URL: hostname must be barbora.lv or www.barbora.lv. Got: ${u.hostname}`,
    };
  }
  return { ok: true, productUrl: trimmed };
}
