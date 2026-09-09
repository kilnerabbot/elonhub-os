/**
 * Query sanitising for global search.
 *
 * Search input is untrusted and flows into PostgREST filter expressions. The
 * threat here is not SQL injection (there is no raw SQL) but PostgREST filter
 * injection: characters like `,` `(` `)` `"` are grammar in a filter string,
 * so an unescaped value can break out of `ilike.<value>` and rewrite the
 * filter. Callers must also use one `.ilike()` per column rather than `.or()`
 * with an interpolated string.
 *
 * Secondary concern: `%` and `_` are LIKE wildcards. Left raw, a user typing
 * `%` matches every row, turning search into a full table scan.
 */

/** Longest accepted query. Anything beyond this is noise or an attack. */
export const MAX_QUERY_LENGTH = 64;

/** Shortest useful query. One character matches most of the table. */
export const MIN_QUERY_LENGTH = 2;

/** Characters that are grammar inside a PostgREST filter value. */
const POSTGREST_RESERVED = /[,()"\\*]/g;

/** Control characters, including the newlines that could split a header. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Normalise raw user input into a value safe to pass to `.ilike()`.
 *
 * Returns null when the query is unusable, so callers render an empty state
 * instead of running a query that scans everything.
 */
export function sanitizeQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const cleaned = raw
    .replace(CONTROL_CHARS, "")
    .replace(POSTGREST_RESERVED, "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);

  if (cleaned.length < MIN_QUERY_LENGTH) return null;
  return cleaned;
}

/**
 * Wrap a sanitised query as a LIKE containment pattern.
 *
 * `%` and `_` are escaped so they match literally rather than acting as
 * wildcards. Backslash is already stripped by sanitizeQuery, so the escape
 * character cannot itself be injected.
 */
export function likePattern(sanitized: string): string {
  const escaped = sanitized.replace(/[%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}
