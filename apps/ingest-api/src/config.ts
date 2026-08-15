export interface IngestApiConfig {
  port: number;
  demoMode: boolean;
  maxRequestBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): IngestApiConfig {
  return {
    port: Number(env.VIZOALICA_PORT ?? 4318),
    demoMode: (env.VIZOALICA_DEMO_MODE ?? 'false') === 'true',
    maxRequestBytes: Number(env.VIZOALICA_MAX_REQUEST_BYTES ?? 131_072)
  };
}
