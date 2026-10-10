export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch?(
    statements: D1Statement[]
  ): Promise<Array<{ results?: unknown[]; meta?: { changes?: number } }>>;
}

export interface R2Bucket {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
  ): Promise<unknown>;
  list(options: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
  delete(keys: string | string[]): Promise<void>;
}

/** Cloudflare Workers Rate Limiting binding; see docs/operations/cloudflare.md. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  VIZOALICA_DB: D1Database;
  VIZOALICA_EVENTS: R2Bucket;
  VIZOALICA_TOKEN_SECRET: string;
  VIZOALICA_ADMIN_SECRET: string;
  VIZOALICA_ANALYTICS_DIGEST_SECRET: string;
  VIZOALICA_DEMO_MODE?: string;
  VIZOALICA_MAX_REQUEST_BYTES?: string;
  VIZOALICA_INGEST_LIMITER?: RateLimiter;
  /** The release this Worker was deployed from; unset on an older or hand-run deployment. */
  VIZOALICA_WORKER_VERSION?: string;
}
