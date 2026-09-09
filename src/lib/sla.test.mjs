// Run: node src/lib/sla.test.mjs
// A wrong SLA either hides a client waiting on you, or cries breach on a
// ticket that was answered. Both erode trust in the queue.
import assert from "node:assert/strict";
import { RESPONSE_TARGET_HOURS, evaluateSla, formatSlaRemaining } from "./sla.ts";

const NOW = new Date("2026-09-09T12:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/* ---- targets are ordered by urgency ---- */
assert.ok(
  RESPONSE_TARGET_HOURS.urgent < RESPONSE_TARGET_HOURS.high &&
    RESPONSE_TARGET_HOURS.high < RESPONSE_TARGET_HOURS.medium &&
    RESPONSE_TARGET_HOURS.medium < RESPONSE_TARGET_HOURS.low,
  "a more urgent ticket always has a tighter target"
);

/* ---- unanswered, still inside target ---- */
{
  const s = evaluateSla("urgent", "open", hoursAgo(1), null, NOW);
  assert.equal(s.targetHours, 2);
  assert.ok(!s.breached, "one hour into a two hour target is not a breach");
  assert.ok(Math.abs(s.hoursRemaining - 1) < 0.01, "an hour left");
  assert.ok(s.atRisk, "within the last hour counts as at risk");
}
{
  const s = evaluateSla("low", "open", hoursAgo(1), null, NOW);
  assert.ok(!s.breached);
  assert.ok(!s.atRisk, "23 hours left is not at risk");
}

/* ---- unanswered, past target ---- */
{
  const s = evaluateSla("urgent", "open", hoursAgo(5), null, NOW);
  assert.ok(s.breached, "five hours on a two hour target is a breach");
  assert.ok(s.hoursRemaining < 0, "remaining goes negative");
  assert.ok(!s.met);
}
{
  const s = evaluateSla("medium", "pending", hoursAgo(20), null, NOW);
  assert.ok(s.breached, "pending still counts — the client is still waiting");
}

/* ---- finished tickets are never breached ---- */
for (const status of ["resolved", "closed"]) {
  const s = evaluateSla("urgent", status, hoursAgo(500), null, NOW);
  assert.ok(!s.breached, `${status} is history, not a live breach`);
  assert.ok(!s.atRisk, `${status} is not at risk`);
}

/* ---- answered ---- */
{
  // Opened 5h ago, answered 1h after opening, target 2h -> met.
  const s = evaluateSla("urgent", "open", hoursAgo(5), hoursAgo(4), NOW);
  assert.ok(s.met, "answered inside target");
  assert.ok(!s.breached, "an answered ticket is never breached");
  assert.ok(!s.atRisk);
}
{
  // Opened 10h ago, answered 6h later, target 2h -> missed but not "breached",
  // because breach describes an outstanding obligation.
  const s = evaluateSla("urgent", "closed", hoursAgo(10), hoursAgo(4), NOW);
  assert.ok(!s.met, "answered outside target does not count as met");
  assert.ok(!s.breached, "already answered, so nothing is outstanding");
}

/* ---- unknown priority falls back rather than throwing ---- */
{
  const s = evaluateSla("nonsense", "open", hoursAgo(1), null, NOW);
  assert.equal(s.targetHours, RESPONSE_TARGET_HOURS.medium, "defaults to medium");
}

/* ---- boundaries ---- */
{
  const exactly = evaluateSla("urgent", "open", hoursAgo(2), null, NOW);
  assert.ok(!exactly.breached, "exactly at the target is not yet a breach");
  const just = evaluateSla("urgent", "open", hoursAgo(2.01), null, NOW);
  assert.ok(just.breached, "just past the target is");
}

/* ---- formatting ---- */
assert.equal(formatSlaRemaining(3), "3h left");
assert.equal(formatSlaRemaining(-2), "2h over");
assert.equal(formatSlaRemaining(0.5), "30m left");
assert.equal(formatSlaRemaining(-0.25), "15m over");

console.log("sla: all assertions passed");
