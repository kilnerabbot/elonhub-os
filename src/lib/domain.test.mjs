// Run: node src/lib/domain.test.mjs
// Covers reference allocation and the numeric/enum validators that guard money
// and pipeline columns.
import assert from "node:assert/strict";
import { Validator } from "./validate.ts";
import {
  LEAD_SOURCES,
  OPEN_STAGES,
  PIPELINE_STAGES,
  STAGE_PROBABILITY,
  nextReference,
} from "./domain.ts";

const fd = (obj) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
};

/* ---- nextReference ---- */
assert.equal(nextReference("LEAD", 2026, 0), "LEAD-2026-0001", "first of the year");
assert.equal(nextReference("LEAD", 2026, 6), "LEAD-2026-0007", "counts from existing rows");
assert.equal(nextReference("LEAD", 2026, 9999), "LEAD-2026-10000", "does not truncate past 4 digits");
assert.ok(
  nextReference("LEAD", 2026, 0) < nextReference("LEAD", 2026, 1),
  "references sort in creation order"
);

/* ---- stage metadata stays consistent ---- */
for (const stage of OPEN_STAGES) {
  assert.ok(PIPELINE_STAGES.includes(stage), `${stage} is a real pipeline stage`);
}
assert.ok(!OPEN_STAGES.includes("won"), "won is an outcome, not a board column");
assert.ok(!OPEN_STAGES.includes("lost"), "lost is an outcome, not a board column");
for (const stage of PIPELINE_STAGES) {
  const p = STAGE_PROBABILITY[stage];
  assert.ok(Number.isInteger(p) && p >= 0 && p <= 100, `${stage} has a sane probability`);
}
assert.equal(STAGE_PROBABILITY.won, 100, "won is certain");
assert.equal(STAGE_PROBABILITY.lost, 0, "lost is worthless");

/* ---- money ---- */
let v = new Validator(fd({ value: "1500.50" }));
assert.equal(v.money("value", "Value"), 1500.5, "decimals preserved");
assert.ok(v.ok);

v = new Validator(fd({ value: "1 250,00" }));
assert.equal(v.money("value", "Value"), 125000, "spaces and thousands separators stripped");

v = new Validator(fd({ value: "" }));
assert.equal(v.money("value", "Value"), 0, "blank is zero");
assert.ok(v.ok, "blank money is not an error");

v = new Validator(fd({ value: "-5" }));
v.money("value", "Value");
assert.ok(!v.ok, "negative rejected — it would corrupt pipeline sums");

v = new Validator(fd({ value: "abc" }));
v.money("value", "Value");
assert.ok(!v.ok, "non-numeric rejected");

v = new Validator(fd({ value: "1e99" }));
v.money("value", "Value");
assert.ok(!v.ok, "absurd magnitude rejected before it overflows numeric(12,2)");

v = new Validator(fd({ value: "10.999" }));
assert.equal(v.money("value", "Value"), 11, "rounded to cents, matching numeric(12,2)");

/* ---- integer ---- */
v = new Validator(fd({ score: "55" }));
assert.equal(v.integer("score", "Score", 0, 100, 0), 55);
assert.ok(v.ok);

v = new Validator(fd({ score: "101" }));
v.integer("score", "Score", 0, 100, 0);
assert.ok(!v.ok, "above max rejected — the column has a CHECK constraint");

v = new Validator(fd({ score: "-1" }));
v.integer("score", "Score", 0, 100, 0);
assert.ok(!v.ok, "below min rejected");

v = new Validator(fd({ score: "5.5" }));
v.integer("score", "Score", 0, 100, 0);
assert.ok(!v.ok, "fractional rejected for an int column");

v = new Validator(fd({}));
assert.equal(v.integer("score", "Score", 0, 100, 42), 42, "missing uses the fallback");
assert.ok(v.ok);

/* ---- choice ---- */
v = new Validator(fd({ source: "whatsapp" }));
assert.equal(v.choice("source", "Source", LEAD_SOURCES, "manual"), "whatsapp");
assert.ok(v.ok);

v = new Validator(fd({ source: "carrier_pigeon" }));
v.choice("source", "Source", LEAD_SOURCES, "manual");
assert.ok(!v.ok, "unknown enum value rejected before Postgres sees it");

v = new Validator(fd({}));
assert.equal(v.choice("source", "Source", LEAD_SOURCES, "manual"), "manual", "absent uses fallback");
assert.ok(v.ok, "absent enum is not an error");

/* ---- optionalDate ---- */
v = new Validator(fd({ d: "2026-09-30" }));
assert.equal(v.optionalDate("d", "Date"), "2026-09-30");
assert.ok(v.ok);

v = new Validator(fd({ d: "" }));
assert.equal(v.optionalDate("d", "Date"), null, "blank date allowed");
assert.ok(v.ok);

for (const bad of ["30/09/2026", "2026-13-01", "not-a-date"]) {
  v = new Validator(fd({ d: bad }));
  v.optionalDate("d", "Date");
  assert.ok(!v.ok, `rejects ${bad}`);
}

console.log("domain: all assertions passed");
