const NAME = /^(\d{4})_[a-z][a-z0-9_]*\.sql$/;
const NON_ADDITIVE_MARKER = '-- vizoalica:non-additive';
const NON_ADDITIVE_STATEMENT = /\b(DROP|RENAME|DELETE|UPDATE)\b/i;

/** `deploy/cloudflare/migrations/*.sql`, in numbered order; every file after 0001 must be additive. */
export type MigrationFile = { name: string; number: number; sql: string };

export function parseMigrationName(name: string): number | undefined {
  const match = NAME.exec(name);
  return match ? Number(match[1]) : undefined;
}

/** The file names are contiguous, starting at 0001, with no gaps or repeats. */
export function checkNumbering(names: readonly string[]): string[] {
  const problems: string[] = [];
  const numbers: number[] = [];
  for (const name of names) {
    const number = parseMigrationName(name);
    if (number === undefined) problems.push(`${name}: must be named NNNN_description.sql`);
    else numbers.push(number);
  }
  numbers.sort((a, b) => a - b);
  numbers.forEach((number, index) => {
    if (number !== index + 1) problems.push(`expected migration ${index + 1}, found ${number}`);
  });
  return problems;
}

/**
 * Whether a migration only adds: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD COLUMN`, and
 * `INSERT OR IGNORE` are always allowed. Anything else (`DROP`, `RENAME`, `DELETE`, `UPDATE`) needs
 * the `-- vizoalica:non-additive` marker, so it is surfaced by the update plan and release notes.
 */
export function isAdditiveOnly(sql: string): boolean {
  if (sql.includes(NON_ADDITIVE_MARKER)) return true;
  const withoutComments = sql.replace(/--[^\n]*/g, '');
  return !NON_ADDITIVE_STATEMENT.test(withoutComments);
}

/** Every file after the first must be additive-only unless annotated. */
export function checkAdditivity(files: readonly MigrationFile[]): string[] {
  return files
    .filter((file) => file.number > 1 && !isAdditiveOnly(file.sql))
    .map(
      (file) =>
        `${file.name}: contains a non-additive statement with no "${NON_ADDITIVE_MARKER}" annotation`
    );
}
