export interface IngestApiConfig {
  port: number;
  demoMode: boolean;
  maxRequestBytes: number;
  storageRoot?: string;
  storageFormat: 'memory' | 'parquet' | 'jsonl-gzip';
  storageFlushIntervalMs: number;
  storageMaxEventsPerFile: number;
  storageMaxBufferedEvents: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): IngestApiConfig {
  const config: IngestApiConfig = {
    port: Number(env.VIZOALICA_PORT ?? 4318),
    demoMode: (env.VIZOALICA_DEMO_MODE ?? 'false') === 'true',
    maxRequestBytes: Number(env.VIZOALICA_MAX_REQUEST_BYTES ?? 131_072),
    storageFormat:
      (env.VIZOALICA_STORAGE_FORMAT as IngestApiConfig['storageFormat'] | undefined) ??
      (env.VIZOALICA_STORAGE_ROOT ? 'parquet' : 'memory'),
    storageFlushIntervalMs: Number(env.VIZOALICA_STORAGE_FLUSH_INTERVAL_MS ?? 60_000),
    storageMaxEventsPerFile: Number(env.VIZOALICA_STORAGE_MAX_EVENTS_PER_FILE ?? 25_000),
    storageMaxBufferedEvents: Number(env.VIZOALICA_STORAGE_MAX_BUFFERED_EVENTS ?? 100_000)
  };
  if (env.VIZOALICA_STORAGE_ROOT) config.storageRoot = env.VIZOALICA_STORAGE_ROOT;
  return config;
}
