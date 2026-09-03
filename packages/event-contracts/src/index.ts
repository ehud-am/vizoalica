import * as Ajv2020Module from 'ajv/dist/2020.js';
import * as addFormatsModule from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import cloudEventBatchSchema from '../schemas/cloudevent-batch.schema.json' with { type: 'json' };
import customEventSchema from '../schemas/event-data-custom-event.schema.json' with { type: 'json' };
import pageViewSchema from '../schemas/event-data-page-view.schema.json' with { type: 'json' };
import tokenClaimsSchema from '../schemas/token-claims.schema.json' with { type: 'json' };

export const eventTypes = ['com.vizoalica.page_view.v1', 'com.vizoalica.custom_event.v1'] as const;
export type VizoalicaEventType = (typeof eventTypes)[number];
export type TrustLevel = 'signed-session' | 'unsigned-demo';
export type ConsentState = 'analytics-granted' | 'analytics-denied' | 'unknown';

export interface CloudEvent<TData = unknown> {
  specversion: '1.0';
  id: string;
  type: VizoalicaEventType;
  source: string;
  subject?: string;
  time: string;
  datacontenttype: 'application/json';
  vizoalicaproject?: string;
  vizoalicasource?: string;
  vizoalicaauth?: TrustLevel;
  vizoalicaconsent?: ConsentState;
  traceparent?: string;
  tracestate?: string;
  data: TData;
}

export interface PageViewData {
  page: {
    url_origin: string;
    url_path: string;
    url_query_redacted: boolean;
    title?: string | null;
  };
  visitor: { anonymous_id: string };
  session: { id: string };
  referrer?: { origin?: string };
}

export interface CustomEventData {
  name: string;
  properties?: Record<string, string | number | boolean | null>;
  visitor: { anonymous_id: string };
  session: { id: string };
}

export interface TokenClaims {
  iss: string;
  aud: 'vizoalica-ingest';
  sub: string;
  project_id: string;
  source_id: string;
  origin: string;
  scope: 'events:write';
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  visitor_id?: string;
  session_id?: string;
  consent_state?: ConsentState;
  max_events?: number;
}

export const schemas = {
  cloudEventBatch: cloudEventBatchSchema,
  pageView: pageViewSchema,
  customEvent: customEventSchema,
  tokenClaims: tokenClaimsSchema
} as const;

const Ajv = Ajv2020Module.default.default;
const addFormats = addFormatsModule.default.default;

export function createValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(pageViewSchema, './event-data-page-view.schema.json');
  ajv.addSchema(customEventSchema, './event-data-custom-event.schema.json');
  ajv.addSchema(tokenClaimsSchema, 'token-claims');
  return ajv;
}

export function compileBatchValidator(): ValidateFunction {
  return createValidator().compile(cloudEventBatchSchema);
}
