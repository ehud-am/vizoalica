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
  /** Reads one object; null when it does not exist. */
  get?(key: string): Promise<{ text(): Promise<string> } | null>;
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
  /** Distinct page paths the no-JavaScript pixel counts per website (default 100). */
  VIZOALICA_PIXEL_MAX_PATHS?: string;
  /** Learning window: first day (UTC, YYYY-MM-DD) page structure may be sent. Unset means off. */
  VIZOALICA_LEARN_START?: string;
  /** Learning window length in days (default 14, at most 90). */
  VIZOALICA_LEARN_DAYS?: string;
  /** Share of page loads (1 to 100, default 10) that describe their pages during the window. */
  VIZOALICA_LEARN_SAMPLE?: string;
  VIZOALICA_INGEST_LIMITER?: RateLimiter;
  /** The release this Worker was deployed from; unset on an older or hand-run deployment. */
  VIZOALICA_WORKER_VERSION?: string;
}
