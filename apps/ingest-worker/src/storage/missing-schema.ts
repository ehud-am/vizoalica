/**
 * D1 (SQLite) reports a table or column that a migration has not created yet as `no such table`,
 * `no such column`, or, for an insert, `table X has no column named Y`.
 */
export function isMissingSchema(error: unknown): boolean {
  return /no such (table|column)|has no column named/i.test(
    error instanceof Error ? error.message : String(error)
  );
}
