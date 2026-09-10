export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch?(statements: D1Statement[]): Promise<Array<{ meta?: { changes?: number } }>>;
}

export interface R2Bucket {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
  ): Promise<unknown>;
}

export interface Env {
  VIZOALICA_DB: D1Database;
  VIZOALICA_EVENTS: R2Bucket;
  VIZOALICA_TOKEN_SECRET: string;
  VIZOALICA_ADMIN_SECRET: string;
  VIZOALICA_ANALYTICS_DIGEST_SECRET: string;
  VIZOALICA_DEMO_MODE?: string;
  VIZOALICA_MAX_REQUEST_BYTES?: string;
}
