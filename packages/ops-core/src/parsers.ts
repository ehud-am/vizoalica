const clean = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '').trim();

export function readConfigNames(
  config: string
): { worker: string; database: string; bucket: string } | undefined {
  const value = (key: string): string | undefined =>
    config.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];
  const worker = value('name');
  const database = value('database_name');
  const bucket = value('bucket_name');
  return worker && database && bucket ? { worker, database, bucket } : undefined;
}

export function parseAccounts(output: string): Array<{ name: string; id: string }> {
  const accounts: Array<{ name: string; id: string }> = [];
  for (const match of clean(output).matchAll(/[│|]\s*([^│|\n]+?)\s*[│|]\s*([0-9a-f]{32})\s*[│|]/g))
    accounts.push({ name: match[1]!, id: match[2]! });
  return accounts;
}

export function parseDatabases(output: string): Array<{ name: string; uuid: string }> {
  try {
    const parsed = JSON.parse(output.slice(output.indexOf('['))) as Array<{
      name?: string;
      uuid?: string;
    }>;
    return parsed.flatMap((item) =>
      item.name && item.uuid ? [{ name: item.name, uuid: item.uuid }] : []
    );
  } catch {
    return [];
  }
}

export const parseBuckets = (output: string): string[] =>
  [...clean(output).matchAll(/^name:\s+(\S+)/gm)].map((match) => match[1]!);

export const parseWorkerUrl = (output: string): string | undefined =>
  clean(output).match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev/i)?.[0];

/** The highest `NNNN_` migration file `wrangler d1 migrations list` reports as pending. */
export function parsePendingMigrations(output: string): string[] {
  return [...clean(output).matchAll(/^\s*(\d{4}_[a-z0-9_]+\.sql)\s*$/gim)].map(
    (match) => match[1]!
  );
}
