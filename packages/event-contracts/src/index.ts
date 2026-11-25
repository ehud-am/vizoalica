import * as Ajv2020Module from 'ajv/dist/2020.js';
import * as addFormatsModule from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import cloudEventBatchSchema from '../schemas/cloudevent-batch.schema.json' with { type: 'json' };
import actionSchema from '../schemas/event-data-action.schema.json' with { type: 'json' };
import customEventSchema from '../schemas/event-data-custom-event.schema.json' with { type: 'json' };
import pageViewSchema from '../schemas/event-data-page-view.schema.json' with { type: 'json' };
import pageStructureSchema from '../schemas/event-data-page-structure.schema.json' with { type: 'json' };
import tokenClaimsSchema from '../schemas/token-claims.schema.json' with { type: 'json' };

export const eventTypes = [
  'com.vizoalica.page_view.v1',
  'com.vizoalica.custom_event.v1',
  'com.vizoalica.action.v1',
  'com.vizoalica.page_structure.v1'
] as const;
export type VizoalicaEventType = (typeof eventTypes)[number];
export type TrustLevel = 'signed-session' | 'origin-checked' | 'unsigned-demo' | 'pixel';
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
  /**
   * The cleaned UTM labels of the landing URL, sent on the first page view of a page load only.
   * Each value is 1 to 64 characters.
   */
  campaign?: { source?: string; medium?: string; campaign?: string };
}

export type ActionKind = 'button' | 'link' | 'other';

export interface ActionData {
  page: { url_origin: string; url_path: string };
  action: {
    /** 1 to 80 characters, already redacted. */
    name: string;
    kind: ActionKind;
    /** Links only; origin and page-key path, never a query. */
    destination?: { url_origin: string; url_path: string };
    /**
     * True on the extra event sent when a burst of rapid clicks hits one control. It is a signal
     * about the clicks already recorded, not another click.
     */
    rage?: true;
  };
  visitor: { anonymous_id: string };
  session: { id: string };
}

export interface CustomEventData {
  name: string;
  properties?: Record<string, string | number | boolean | null>;
  /** The page key the event was sent from; absent from older SDKs. */
  page?: { url_path: string };
  visitor: { anonymous_id: string };
  session: { id: string };
}

/**
 * The accessible structure of one page, sent only while a learning window is open. Labels and
 * headings are text the website already shows; there are no field values and no body text.
 */
export interface PageStructureData {
  page: { url_origin: string; url_path: string };
  structure: {
    lang?: string;
    title?: string;
    description?: string;
    headings?: Array<{ level: 1 | 2 | 3; text: string }>;
    landmarks?: Array<{ role: string; label?: string }>;
    /** A control without a `name` has no accessible name: a gap the operator is asked about. */
    controls?: Array<{ role: string; name?: string; landmark?: string }>;
    forms?: Array<{ name?: string; fields?: Array<{ type: string; label?: string }> }>;
    a11y?: { controls?: number; unlabeledControls?: number; imagesWithoutAlt?: number };
  };
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
  action: actionSchema,
  pageStructure: pageStructureSchema,
  tokenClaims: tokenClaimsSchema
} as const;

const Ajv = Ajv2020Module.default.default;
const addFormats = addFormatsModule.default.default;

export function createValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(pageViewSchema, './event-data-page-view.schema.json');
  ajv.addSchema(customEventSchema, './event-data-custom-event.schema.json');
  ajv.addSchema(actionSchema, './event-data-action.schema.json');
  ajv.addSchema(pageStructureSchema, './event-data-page-structure.schema.json');
  ajv.addSchema(tokenClaimsSchema, 'token-claims');
  return ajv;
}

export function compileBatchValidator(): ValidateFunction {
  return createValidator().compile(cloudEventBatchSchema);
}
