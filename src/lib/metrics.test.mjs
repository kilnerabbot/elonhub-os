// Run: node src/lib/metrics.test.mjs
// Plain Node asserts on purpose — no test framework in this project yet.
import assert from "node:assert/strict";
// Node >=22.18 strips TypeScript types natively, so this imports the real
// source rather than a copy that can rot.
import { bucketSum, num, pctDelta, ratePct } from "./metrics.ts";

/* ---- pctDelta ---- */
assert.equal(pctDelta(150, 100), 50, "growth is positive");
assert.equal(pctDelta(50, 100), -50, "decline is negative");
assert.equal(pctDelta(100, 100), 0, "flat is zero");
assert.equal(pctDelta(10, 0), null, "growth from zero is undefined, not Infinity");
assert.equal(pctDelta(0, 0), null, "no baseline, no delta");
assert.equal(pctDelta(0, 100), -100, "total collapse is -100%");

/* ---- ratePct ---- */
assert.equal(ratePct(50, 200), 25, "part over whole");
assert.equal(ratePct(0, 0), 0, "empty books do not divide by zero");
assert.equal(ratePct(3, 3), 100, "fully collected");

/* ---- bucketSum ---- */
const rows = [
  { d: "2026-09-01", v: 100 },
  { d: "2026-09-01", v: 50 },
  { d: "2026-09-03", v: 25 },
  { d: "2026-08-30", v: 999 }, // outside the requested buckets
];
const buckets = ["2026-09-01", "2026-09-02", "2026-09-03"];
const out = bucketSum(rows, buckets, (r) => r.d, (r) => r.v);

assert.deepEqual(out, [150, 0, 25], "sums per bucket, zero-fills gaps");
assert.equal(out.length, buckets.length, "always returns one value per bucket");
assert.ok(!out.includes(999), "rows outside the window are excluded, not folded in");
assert.deepEqual(bucketSum(null, buckets, (r) => r.d, (r) => r.v), [0, 0, 0], "null rows are safe");
assert.deepEqual(bucketSum([], [], () => "", () => 0), [], "no buckets, no output");

/* ---- num ---- */
assert.equal(num("12.50"), 12.5, "postgres numeric strings coerce");
assert.equal(num(null), 0, "null is zero");
assert.equal(num(undefined), 0, "undefined is zero");
assert.equal(num("abc"), 0, "garbage is zero, never NaN");
assert.equal(num(Infinity), 0, "non-finite is zero");

console.log("metrics: all assertions passed");
