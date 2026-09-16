/**
 * Quote and invoice arithmetic.
 *
 * Three rules drive everything here:
 *
 * 1. Never do money arithmetic in floating point. `0.1 + 0.2 !== 0.3`, and
 *    `1.005 * 100` is 100.49999999999999 — so the obvious
 *    `Math.round(rand * 100)` silently loses a cent on exactly the values
 *    accountants notice. Conversion to cents goes through the decimal string
 *    representation, and all subsequent arithmetic is BigInt.
 *
 * 2. Round each line, then sum — never sum then round. Each line is printed
 *    with its own rand figure, so the printed lines must add up to the printed
 *    subtotal exactly, or the client disputes the document.
 *
 * 3. Charge VAT on the vatable subtotal, not per line. Per-line VAT rounding
 *    compounds: a thousand 10c lines each attract 1.5c of VAT, which rounds to
 *    2c a line and overcharges by a third. One rounding at the end is both
 *    correct and what SARS expects.
 */

// BigInt literals such as 100n require an ES2020 target; BigInt() calls do not,
// which keeps this module independent of the tsconfig target.
const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);
const B100 = BigInt(100);
const B10_000 = BigInt(10000);
const B1_000_000 = BigInt(1000000);

export type QuoteLine = {
  quantity: number;
  unit_price: number;
  discount_pct: number;
  is_vatable: boolean;
};

export type Totals = {
  subtotal: number;
  vat_amount: number;
  total: number;
};

/**
 * Scale a decimal number by 10^decimals to an exact integer.
 *
 * Goes via the string form because JavaScript prints the shortest round-trip
 * decimal: 1.005 stringifies as "1.005", so "1.005e2" parses as exactly 100.5,
 * whereas `1.005 * 100` is 100.49999999999999. Ties round away from zero.
 */
function scaled(value: number, decimals: number): bigint {
  if (!Number.isFinite(value)) return B0;
  const sign = value < 0 ? -B1 : B1;
  const shifted = Number(`${Math.abs(value)}e${decimals}`);
  return sign * BigInt(Math.round(shifted));
}

/** Integer division rounding halves away from zero. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < B0 !== denominator < B0;
  const n = numerator < B0 ? -numerator : numerator;
  const d = denominator < B0 ? -denominator : denominator;
  if (d === B0) return B0;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * B2 >= d ? quotient + B1 : quotient;
  return negative ? -rounded : rounded;
}

/** Rand to integer cents. */
export function toCents(rand: number): number {
  return Number(scaled(rand, 2));
}

/** Integer cents back to rand. */
export function toRand(cents: number): number {
  return cents / 100;
}

/**
 * Net value of one line, in cents, after its discount.
 *
 * quantity carries 2 decimals and discount_pct carries 2, so the product is
 * scaled by 10^2 x 10^2 x 10^4 and divided back down in a single rounding
 * step. BigInt throughout: the intermediate product exceeds 2^53 for large
 * quantities, which would silently lose precision as a Number.
 */
export function lineNetCents(line: QuoteLine): number {
  const quantity = scaled(line.quantity, 2); // hundredths of a unit
  const unit = scaled(line.unit_price, 2); // cents
  const discount = scaled(line.discount_pct, 2); // basis points of a percent

  const numerator = quantity * unit * (B1_000_000 - discount * B100);
  return Number(divRound(numerator, B100 * B1_000_000));
}

/** Net value of one line in rand, for display beside the line. */
export function lineNet(line: QuoteLine): number {
  return toRand(lineNetCents(line));
}

/**
 * Subtotal, VAT and total for a set of lines.
 *
 * VAT applies only to lines flagged vatable, and is computed on the discounted
 * net — a discount reduces the taxable amount rather than being applied after
 * tax.
 */
export function quoteTotals(lines: QuoteLine[], vatRatePct: number): Totals {
  let subtotalCents = B0;
  let vatableCents = B0;

  for (const line of lines) {
    const net = BigInt(lineNetCents(line));
    subtotalCents += net;
    if (line.is_vatable) vatableCents += net;
  }

  // rate is hundredths of a percent (15% -> 1500), so 15% of x is
  // x * 1500 / 10000.
  const rate = scaled(vatRatePct, 2);
  const vatCents = divRound(vatableCents * rate, B10_000);

  return {
    subtotal: toRand(Number(subtotalCents)),
    vat_amount: toRand(Number(vatCents)),
    total: toRand(Number(subtotalCents + vatCents)),
  };
}

/** South Africa's standard rate. The last resort, not the usual answer. */
export const DEFAULT_VAT_RATE = 15;

/**
 * The VAT rate a document should be calculated at.
 *
 * Quotes and invoices carry the rate they were raised at (migration 0010).
 * Before that column existed everything read the organisation's current rate
 * live, which meant a rate change restated documents that had already been
 * issued and sent — including rewriting their stored totals, because the
 * reconcile paths recompute and save on every line-item and payment write.
 *
 * Order: the document's own rate, then the organisation's, then the statutory
 * default. The last two are fallbacks for a row written before 0010 was
 * applied, not the normal path.
 *
 * Note `== null` rather than `||`: a zero rate is legitimate. Zero-rated
 * supplies and exports are charged at 0%, which is not the same thing as a
 * line being non-vatable, and `0 || 15` would silently bill VAT on an export.
 */
export function resolveVatRate(
  documentRate: number | string | null | undefined,
  orgRate: number | string | null | undefined
): number {
  for (const candidate of [documentRate, orgRate]) {
    // Trimmed before the blank test, not just compared to "". Number(" ") is
    // 0, so a whitespace-only value would otherwise resolve to a 0% rate —
    // the precise failure the `== null` check above was written to avoid,
    // arriving by the other door.
    if (candidate == null || String(candidate).trim() === "") continue;
    // PostgREST can hand a numeric column back as a string.
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0 && value <= 100) return value;
  }
  return DEFAULT_VAT_RATE;
}
