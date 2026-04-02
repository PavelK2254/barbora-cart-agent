/**
 * Deterministic pack / size hints for resolver ranking (l, ml, kg, g only).
 * Uses the same normalization as resolver matching.
 */

import { normalizeForMatch } from './normalizeForMatch';

export type PackHint = Readonly<{ amount: number; unit: 'l' | 'ml' | 'kg' | 'g' }>;

const PACK_REGEX =
  /(?<![\p{L}\p{N}])(\d+)(?:[.,](\d+))?\s*(ml|kg|g|l)(?![\p{L}\p{N}])/giu;

/** Relative tolerance for numeric equality (e.g. 1 vs 1,0). */
const AMOUNT_EPS = 0.02;

function parseAmount(intPart: string, frac: string | undefined): number {
  if (frac === undefined || frac.length === 0) {
    return parseInt(intPart, 10);
  }
  return parseFloat(`${intPart}.${frac}`);
}

/**
 * Normalized "2 5 l" (from "2,5 l") → single decimal amount + unit.
 * Only used when the main pattern did not match.
 */
const SPLIT_DECIMAL_PACK =
  /(?<![\p{L}\p{N}])(\d+)\s+(\d{1,2})\s*(ml|kg|g|l)(?![\p{L}\p{N}])/giu;

/**
 * Extracts at most one primary pack hint from normalized text (first match).
 */
export function parsePrimaryPackHint(normalizedText: string): PackHint | null {
  PACK_REGEX.lastIndex = 0;
  const m = PACK_REGEX.exec(normalizedText);
  if (m != null) {
    const amount = parseAmount(m[1]!, m[2]);
    const u = m[3]!.toLowerCase() as PackHint['unit'];
    return { amount, unit: u };
  }
  SPLIT_DECIMAL_PACK.lastIndex = 0;
  const m2 = SPLIT_DECIMAL_PACK.exec(normalizedText);
  if (m2 == null) return null;
  const whole = m2[1]!;
  const tenths = m2[2]!;
  const amount = parseFloat(`${whole}.${tenths}`);
  const u = m2[3]!.toLowerCase() as PackHint['unit'];
  return { amount, unit: u };
}

function toMl(h: PackHint): number {
  return h.unit === 'l' ? h.amount * 1000 : h.unit === 'ml' ? h.amount : NaN;
}

function toG(h: PackHint): number {
  return h.unit === 'kg' ? h.amount * 1000 : h.unit === 'g' ? h.amount : NaN;
}

export function packHintsEqual(a: PackHint, b: PackHint): boolean {
  const mlA = toMl(a);
  const mlB = toMl(b);
  if (!Number.isNaN(mlA) && !Number.isNaN(mlB)) {
    return Math.abs(mlA - mlB) <= AMOUNT_EPS;
  }
  const gA = toG(a);
  const gB = toG(b);
  if (!Number.isNaN(gA) && !Number.isNaN(gB)) {
    return Math.abs(gA - gB) <= AMOUNT_EPS;
  }
  return false;
}

/** True when both are non-null, same dimension (volume vs mass), and amounts differ beyond epsilon. */
export function packHintsConflict(query: PackHint, candidate: PackHint): boolean {
  const mlQ = toMl(query);
  const mlC = toMl(candidate);
  if (!Number.isNaN(mlQ) && !Number.isNaN(mlC)) {
    return Math.abs(mlQ - mlC) > AMOUNT_EPS;
  }
  const gQ = toG(query);
  const gC = toG(candidate);
  if (!Number.isNaN(gQ) && !Number.isNaN(gC)) {
    return Math.abs(gQ - gC) > AMOUNT_EPS;
  }
  return true;
}

/**
 * Conservative gate: use executor `packSizeText` only when it plausibly describes pack size,
 * not unit-price lines like "0,99€/l".
 */
export function isPackSizeLikePackSizeText(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const s = raw.trim();
  if (s.length === 0) return false;
  if (s.includes('€')) return false;
  if (s.includes('/')) return false;
  return parsePrimaryPackHint(normalizeForMatch(s)) != null;
}
