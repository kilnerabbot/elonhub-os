// Run: node src/lib/search.test.mjs
// Guards the untrusted-input boundary. If these fail, search is injectable.
import assert from "node:assert/strict";
import { MAX_QUERY_LENGTH, likePattern, sanitizeQuery } from "./search.ts";

/* ---- rejects unusable input ---- */
assert.equal(sanitizeQuery(null), null, "null is rejected");
assert.equal(sanitizeQuery(undefined), null, "undefined is rejected");
assert.equal(sanitizeQuery(123), null, "non-string is rejected");
assert.equal(sanitizeQuery(""), null, "empty is rejected");
assert.equal(sanitizeQuery("   "), null, "whitespace only is rejected");
assert.equal(sanitizeQuery("a"), null, "single character is too broad");
assert.equal(sanitizeQuery("  a  "), null, "trims before measuring length");

/* ---- accepts ordinary queries unchanged ---- */
assert.equal(sanitizeQuery("Acme"), "Acme", "plain word survives");
assert.equal(sanitizeQuery("  Acme  "), "Acme", "outer whitespace trimmed");
assert.equal(sanitizeQuery("hello@elonhub.co.za"), "hello@elonhub.co.za", "emails survive");
assert.equal(sanitizeQuery("Craddock Square"), "Craddock Square", "spaces survive");
assert.equal(sanitizeQuery("O'Brien & Sons"), "O'Brien & Sons", "apostrophe and ampersand survive");
assert.equal(sanitizeQuery("INV-2026-001"), "INV-2026-001", "invoice numbers survive");

/* ---- strips PostgREST filter grammar ---- */
// Without this, the value escapes `ilike.<value>` and rewrites the filter.
assert.equal(sanitizeQuery("ab,role.eq.super_admin"), "abrole.eq.super_admin", "comma stripped");
assert.equal(sanitizeQuery("ab(or(x))"), "aborx", "parentheses stripped");
assert.equal(sanitizeQuery('ab"quoted"'), "abquoted", "double quotes stripped");
assert.equal(sanitizeQuery("ab\\x"), "abx", "backslash stripped");
assert.equal(sanitizeQuery("ab*"), "ab", "postgrest star wildcard stripped");
assert.ok(!sanitizeQuery("ab,()\"\\*cd").match(/[,()"\\*]/), "no reserved char survives");

/* ---- strips control characters ---- */
assert.equal(sanitizeQuery("ab\u0000cd"), "abcd", "null byte stripped");
assert.equal(sanitizeQuery("ab\ncd"), "abcd", "newline stripped");
assert.equal(sanitizeQuery("ab\r\ncd"), "abcd", "CRLF stripped");

/* ---- bounds length ---- */
const long = sanitizeQuery("x".repeat(500));
assert.equal(long.length, MAX_QUERY_LENGTH, "truncated to the cap");

/* ---- likePattern escapes LIKE wildcards ---- */
assert.equal(likePattern("Acme"), "%Acme%", "wraps for containment match");
assert.equal(likePattern("50%"), "%50\\%%", "percent escaped, not treated as wildcard");
assert.equal(likePattern("a_b"), "%a\\_b%", "underscore escaped, not single-char wildcard");

// A bare % must not become a match-everything pattern.
assert.notEqual(likePattern(sanitizeQuery("%%") ?? ""), "%%%", "wildcard-only query cannot scan all");

console.log("search: all assertions passed");
