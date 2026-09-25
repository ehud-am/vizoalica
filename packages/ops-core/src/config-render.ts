import { OpsCoreError } from './names.js';

const line = (key: string): RegExp => new RegExp(`^${key}\\s*=\\s*"[^"]*"`, 'm');

/** Fills the checked-in example, so nobody hand-edits a TOML file. */
export function renderProductionConfig(
  example: string,
  values: {
    worker: string;
    database: string;
    databaseId: string;
    bucket: string;
    /** Only for the packaged template (research R27): the absolute path to the packaged schema. */
    migrationsDir?: string;
    /** Only for the console's deploy and update engines: this console's own version. */
    workerVersion?: string;
  }
): string {
  let result = example;
  const replacements: Array<[string, string]> = [
    ['name', values.worker],
    ['database_name', values.database],
    ['database_id', values.databaseId],
    ['bucket_name', values.bucket],
    ...(values.migrationsDir ? [['migrations_dir', values.migrationsDir] as [string, string]] : []),
    ...(values.workerVersion
      ? [['VIZOALICA_WORKER_VERSION', values.workerVersion] as [string, string]]
      : [])
  ];
  for (const [key, value] of replacements) {
    if (!line(key).test(result))
      throw new OpsCoreError(`The wrangler example has no "${key}" line to fill in.`);
    result = result.replace(line(key), `${key} = "${value}"`);
  }
  return result;
}
