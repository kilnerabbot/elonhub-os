// Run: node src/lib/money.test.mjs
// The money path. If these fail, quotes and invoices are wrong and clients
// will dispute them.
import assert from "node:assert/strict";
import {
  DEFAULT_VAT_RATE,
  lineNet,
  lineNetCents,
  quoteTotals,
  resolveVatRate,
  toCents,
} from "./money.ts";

const line = (o) => ({
  quantity: 1,
  unit_price: 0,
  discount_pct: 0,
  is_vatable: true,
  ...o,
});

const VAT = 15;

/* ---- floating point traps ---- */
assert.equal(toCents(2.675), 268, "2.675 rounds up despite its float representation being 2.67499…");
assert.equal(toCents(0.1 + 0.2), 30, "0.1 + 0.2 is still 30 cents");
assert.equal(toCents(1.005), 101, "1.005 rounds up, not down");
assert.equal(toCents(-2.675), -268, "negatives round away from zero, symmetrically");

/* ---- single line ---- */
assert.equal(lineNet(line({ quantity: 1, unit_price: 100 })), 100);
assert.equal(lineNet(line({ quantity: 3, unit_price: 250 })), 750);
assert.equal(lineNet(line({ quantity: 2.5, unit_price: 100 })), 250, "fractional quantity");
assert.equal(lineNet(line({ quantity: 1, unit_price: 100, discount_pct: 10 })), 90);
assert.equal(lineNet(line({ quantity: 1, unit_price: 100, discount_pct: 100 })), 0, "full discount");
assert.equal(lineNet(line({ quantity: 0, unit_price: 999 })), 0, "zero quantity");
assert.equal(
  lineNet(line({ quantity: 3, unit_price: 33.33, discount_pct: 12.5 })),
  87.49,
  "awkward rate, awkward discount"
);

/* ---- the invariant that matters: lines must add up to the total ---- */
{
  // Deliberately chosen to produce half-cent line values.
  const lines = [
    line({ quantity: 3, unit_price: 33.335 }),
    line({ quantity: 7, unit_price: 1.005 }),
    line({ quantity: 1.5, unit_price: 19.99, discount_pct: 7.5 }),
  ];
  const t = quoteTotals(lines, VAT);
  const sumOfPrintedLines = lines.reduce((a, l) => a + lineNet(l), 0);

  assert.equal(
    Math.round(sumOfPrintedLines * 100),
    Math.round(t.subtotal * 100),
    "the printed line values add up to the printed subtotal exactly"
  );
  assert.equal(
    Math.round((t.subtotal + t.vat_amount) * 100),
    Math.round(t.total * 100),
    "subtotal + VAT equals total exactly"
  );
}

/* ---- VAT ---- */
{
  const t = quoteTotals([line({ quantity: 1, unit_price: 1000 })], VAT);
  assert.equal(t.subtotal, 1000);
  assert.equal(t.vat_amount, 150, "15% of 1000");
  assert.equal(t.total, 1150);
}
{
  // Non-vatable lines count toward subtotal but attract no VAT.
  const t = quoteTotals(
    [
      line({ quantity: 1, unit_price: 1000, is_vatable: true }),
      line({ quantity: 1, unit_price: 500, is_vatable: false }),
    ],
    VAT
  );
  assert.equal(t.subtotal, 1500, "both lines in the subtotal");
  assert.equal(t.vat_amount, 150, "VAT only on the vatable line");
  assert.equal(t.total, 1650);
}
{
  // Discount must reduce the taxable amount, not be applied after tax.
  const t = quoteTotals([line({ quantity: 1, unit_price: 1000, discount_pct: 10 })], VAT);
  assert.equal(t.subtotal, 900);
  assert.equal(t.vat_amount, 135, "VAT on the discounted 900, not on 1000");
  assert.equal(t.total, 1035);
}
{
  const t = quoteTotals([], VAT);
  assert.deepEqual(t, { subtotal: 0, vat_amount: 0, total: 0 }, "empty quote is all zeros");
}
{
  const t = quoteTotals([line({ quantity: 1, unit_price: 100 })], 0);
  assert.equal(t.vat_amount, 0, "zero-rated org charges no VAT");
  assert.equal(t.total, 100);
}

/* ---- no float drift across many lines ---- */
{
  const many = Array.from({ length: 1000 }, () => line({ quantity: 1, unit_price: 0.1 }));
  const t = quoteTotals(many, VAT);
  assert.equal(t.subtotal, 100, "1000 x R0.10 is exactly R100, not 99.99999999999859");
  // Per-line VAT would round 1.5c up to 2c a thousand times and charge R20.
  // Charging on the vatable subtotal gives the correct R15.
  assert.equal(t.vat_amount, 15, "VAT is charged once on the subtotal, not per line");
  assert.equal(t.total, 115);
}

/* ---- realistic agency quote ---- */
{
  const t = quoteTotals(
    [
      line({ quantity: 1, unit_price: 18500 }), // website build
      line({ quantity: 12, unit_price: 2500 }), // monthly retainer
      line({ quantity: 1, unit_price: 4200, discount_pct: 15 }), // discounted setup
    ],
    VAT
  );
  assert.equal(t.subtotal, 52070);
  assert.equal(t.vat_amount, 7810.5);
  assert.equal(t.total, 59880.5);
  assert.ok(Number.isInteger(Math.round(t.total * 100)), "total lands on a whole cent");
}

/* ---- guards against silly inputs ---- */
assert.equal(lineNetCents(line({ quantity: 1, unit_price: 0 })), 0, "zero price is free, not NaN");

console.log("money: all assertions passed");

/* ---- which rate a document is calculated at ---- */
{
  // A document's own rate wins, so reprinting an old invoice after a rate
  // change shows what the client was actually billed.
  assert.equal(resolveVatRate(14, 15), 14, "the document's own rate wins");
  assert.equal(resolveVatRate(null, 15), 15, "a row written before 0010 falls back to the org");
  assert.equal(resolveVatRate(undefined, 15), 15, "an absent column is the same as null");
  assert.equal(resolveVatRate(null, null), DEFAULT_VAT_RATE, "last resort is the statutory rate");

  // The case a `||` coalesce gets wrong. Zero-rated supplies and exports are
  // charged at 0%, which is not the same as a non-vatable line — billing 15%
  // on an export is a real invoice someone has to reissue.
  assert.equal(resolveVatRate(0, 15), 0, "zero is a rate, not a missing value");
  assert.equal(resolveVatRate(null, 0), 0);

  // PostgREST can hand numeric back as a string.
  assert.equal(resolveVatRate("15.00", null), 15);
  assert.equal(resolveVatRate("0", 15), 0);

  // Nonsense falls through rather than producing a nonsense invoice.
  assert.equal(resolveVatRate("abc", 15), 15, "an unparseable rate is not a rate");
  assert.equal(resolveVatRate(-1, 15), 15, "a negative rate is not a rate");
  assert.equal(resolveVatRate(120, 15), 15, "120% is not a rate");
  assert.equal(resolveVatRate("", 15), 15);
  // Number(" ") is 0. A whitespace rate must not zero-rate every document.
  assert.equal(resolveVatRate(" ", 15), 15, "whitespace is not a zero rate");
  assert.equal(resolveVatRate("\t\n", 15), 15);
  assert.equal(resolveVatRate(" ", null), DEFAULT_VAT_RATE);

  // And the rate actually reaches the arithmetic.
  const lines = [{ quantity: 1, unit_price: 100, discount_pct: 0, is_vatable: true }];
  assert.equal(quoteTotals(lines, resolveVatRate(0, 15)).total, 100, "zero-rated bills no VAT");
  assert.equal(quoteTotals(lines, resolveVatRate(14, 15)).total, 114);
}

console.log("money: vat rate resolution passed");
