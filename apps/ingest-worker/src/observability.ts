import type { SafeLogger } from '../../ingest-api/src/observability/index.js';

export const workerLogger: SafeLogger = {
  info: (message, context) => console.info(message, context ?? {}),
  warn: (message, context) => console.warn(message, context ?? {}),
  error: (message, context) => console.error(message, context ?? {})
};
