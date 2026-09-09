// Run: node src/lib/quoteToInvoice.test.mjs
// The invariant under test: an invoice raised from a quote must total exactly
// the same as the quote. Anything else means the client is billed a different
// figure to the one they accepted.
import assert from "node:assert/strict";
import { quoteTotals } from "./money.ts";
import { toInvoiceLines } from "./quoteToInvoice.ts";

const VAT = 15;

const item = (o) => ({
  description: "Service",
  quantity: 1,
  unit_price: 0,
  discount_pct: 0,
  is_vatable: true,
  sort_order: 0,
  ...o,
});

/** Totals for a set of quote lines. */
const quoteTotal = (items) =>
  quoteTotals(
    items.map((i) => ({
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount_pct: i.discount_pct,
      is_vatable: i.is_vatable,
    })),
    VAT
  );

/** Totals for the mapped invoice lines, which have no discount concept. */
const invoiceTotal = (items) =>
  quoteTotals(
    toInvoiceLines(items).map((i) => ({
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount_pct: 0,
      is_vatable: i.is_vatable,
    })),
    VAT
  );

/* ---- undiscounted lines copy across untouched ---- */
{
  const items = [item({ quantity: 3, unit_price: 250 }), item({ quantity: 1, unit_price: 18500 })];
  const mapped = toInvoiceLines(items);
  assert.equal(mapped[0].quantity, 3, "quantity preserved");
  assert.equal(mapped[0].unit_price, 250, "unit price preserved");
  assert.equal(mapped[0].description, "Service", "description untouched");
  assert.deepEqual(invoiceTotal(items), quoteTotal(items), "totals identical");
}

/* ---- discounted lines fold to a single unit at the exact net ---- */
{
  const items = [item({ quantity: 1, unit_price: 4200, discount_pct: 15 })];
  const mapped = toInvoiceLines(items);
  assert.equal(mapped[0].quantity, 1, "collapses to one unit");
  assert.equal(mapped[0].unit_price, 3570, "priced at the discounted net");
  assert.match(mapped[0].description, /less 15%/, "discount stated on the document");
  assert.match(mapped[0].description, /1 × 4200\.00/, "original terms stated");
  assert.deepEqual(invoiceTotal(items), quoteTotal(items), "totals identical");
}

/* ---- the awkward cases: totals must still reconcile exactly ---- */
for (const [name, items] of [
  ["fractional quantity with discount", [item({ quantity: 2.5, unit_price: 33.33, discount_pct: 7.5 })]],
  ["half-cent net", [item({ quantity: 3, unit_price: 33.335, discount_pct: 12.5 })]],
  ["100% discount", [item({ quantity: 4, unit_price: 999.99, discount_pct: 100 })]],
  ["tiny amounts", [item({ quantity: 7, unit_price: 0.05, discount_pct: 33.33 })]],
  [
    "mixed bag",
    [
      item({ quantity: 1, unit_price: 18500 }),
      item({ quantity: 12, unit_price: 2500, discount_pct: 10 }),
      item({ quantity: 1, unit_price: 4200, discount_pct: 15 }),
      item({ quantity: 2, unit_price: 750, is_vatable: false }),
    ],
  ],
]) {
  assert.deepEqual(invoiceTotal(items), quoteTotal(items), `${name}: totals reconcile`);
}

/* ---- VAT flags and ordering survive the mapping ---- */
{
  const items = [
    item({ description: "A", is_vatable: false, unit_price: 100, sort_order: 2 }),
    item({ description: "B", is_vatable: true, unit_price: 100, sort_order: 1 }),
  ];
  const mapped = toInvoiceLines(items);
  assert.equal(mapped[0].is_vatable, false, "non-vatable stays non-vatable");
  assert.equal(mapped[1].is_vatable, true, "vatable stays vatable");
  assert.equal(mapped[0].sort_order, 2, "sort order preserved");
  assert.equal(mapped[1].sort_order, 1, "sort order preserved");
}

/* ---- degenerate input ---- */
assert.deepEqual(toInvoiceLines([]), [], "an empty quote maps to no lines");

console.log("quoteToInvoice: all assertions passed");
