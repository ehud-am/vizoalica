import type { DynamicConfigV1 } from '../../src/dynamic-config.js';

export const validDynamicConfig: DynamicConfigV1 = {
  version: 1,
  src: '/vizoalica.js',
  'data-endpoint': 'https://analytics.example/v1/events:batch',
  'data-source': 'public-key',
  'data-project': 'project-1',
  'data-token-url': '/vizoalica/ingest-token',
  'data-consent': 'analytics-granted'
};

export const malformedDynamicConfig = { ...validDynamicConfig, version: 2 };
export const mismatchedDynamicConfig = {
  ...validDynamicConfig,
  'data-token-url': 'https://other.example/vizoalica/ingest-token'
};
