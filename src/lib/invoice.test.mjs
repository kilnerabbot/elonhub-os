// Run: node src/lib/invoice.test.mjs
// Invoice status must follow the payments table exactly. A wrong status here
// means chasing a client who has paid, or not chasing one who has not.
import assert from "node:assert/strict";
import { deriveStatus, isEditable, outstandingCents } from "./invoice.ts";

const TODAY = "2026-09-09";
const PAST = "2026-08-01";
const FUTURE = "2026-12-01";

/* ---- editability ---- */
assert.ok(isEditable("draft"), "drafts are editable");
for (const s of ["sent", "partially_paid", "paid", "overdue", "void"]) {
  assert.ok(!isEditable(s), `${s} is locked`);
}

/* ---- outstanding, in exact cents ---- */
assert.equal(outstandingCents(100, 0), 10000, "nothing paid");
assert.equal(outstandingCents(100, 100), 0, "paid in full");
assert.equal(outstandingCents(100, 40), 6000, "part paid");
assert.equal(outstandingCents(100, 120), -2000, "overpaid goes negative");
// 0.1 + 0.2 = 0.30000000000000004; in cents this must still be exactly zero.
assert.equal(outstandingCents(0.3, 0.1 + 0.2), 0, "float noise does not leave a residue");

/* ---- terminal states are never derived ---- */
assert.equal(deriveStatus("draft", 100, 0, PAST, TODAY), "draft", "a draft is not overdue");
assert.equal(deriveStatus("draft", 100, 100, PAST, TODAY), "draft", "a draft is never paid");
assert.equal(deriveStatus("void", 100, 0, PAST, TODAY), "void", "void stays void");

/* ---- the normal lifecycle ---- */
assert.equal(deriveStatus("sent", 1000, 0, FUTURE, TODAY), "sent", "issued, not yet due");
assert.equal(deriveStatus("sent", 1000, 0, PAST, TODAY), "overdue", "issued, past due, unpaid");
assert.equal(deriveStatus("sent", 1000, 400, FUTURE, TODAY), "partially_paid", "part payment");
assert.equal(
  deriveStatus("overdue", 1000, 400, PAST, TODAY),
  "partially_paid",
  "a part payment supersedes overdue"
);
assert.equal(deriveStatus("sent", 1000, 1000, FUTURE, TODAY), "paid", "settled in full");
assert.equal(deriveStatus("overdue", 1000, 1000, PAST, TODAY), "paid", "late but settled");
assert.equal(deriveStatus("partially_paid", 1000, 1000, PAST, TODAY), "paid", "topped up to full");

/* ---- edge cases ---- */
assert.equal(deriveStatus("sent", 1000, 1200, FUTURE, TODAY), "paid", "overpayment reads as paid");
assert.equal(
  deriveStatus("sent", 0, 0, FUTURE, TODAY),
  "paid",
  "a zero-total invoice is settled on issue, not stuck at sent forever"
);
assert.equal(deriveStatus("sent", 1000, 0, null, TODAY), "sent", "no due date means never overdue");
assert.equal(
  deriveStatus("sent", 1000, 0, TODAY, TODAY),
  "sent",
  "due today is not yet overdue"
);
assert.equal(
  deriveStatus("sent", 1000, 999.995, FUTURE, TODAY),
  "paid",
  "a half-cent short rounds to settled rather than lingering"
);

console.log("invoice: all assertions passed");
