import type { PageStructureData } from '@vizoalica/event-contracts';
import { redactLabel } from '@vizoalica/privacy';
import { accessibleName, ELIGIBLE, roleOf } from './actions.js';

type Structure = PageStructureData['structure'];

/**
 * The accessible structure of the current page: landmarks, headings, and the labels of controls and
 * form fields, as a screen reader would announce them. It never reads a field's value, a
 * placeholder, typed text, or body text, and skips anything inside `data-vizoalica-ignore`.
 * Every text is redacted like an action name. Sent only while a learning window is open.
 */
const IGNORED = '[data-vizoalica-ignore]';
const LANDMARK_BY_TAG: Record<string, string> = {
  nav: 'navigation',
  main: 'main',
  aside: 'complementary',
  header: 'banner',
  footer: 'contentinfo'
};
const LANDMARK_ROLES = new Set([
  'banner',
  'navigation',
  'main',
  'complementary',
  'contentinfo',
  'search',
  'form',
  'region'
]);
const LANDMARK_SELECTOR = [
  'nav',
  'main',
  'aside',
  'header',
  'footer',
  '[role]',
  'form[aria-label]',
  'section[aria-label]'
].join(',');
const MAX_HEADINGS = 9;
const MAX_LANDMARKS = 12;
const MAX_CONTROLS = 25;
const MAX_FORMS = 4;
const MAX_FIELDS = 8;
// Never described, even by label: they hold secrets or payment data.
const SENSITIVE_FIELD = /password|passwd|cc-|card|cvc|cvv|otp|one-time/i;

const clean = (value: unknown): string | undefined => redactLabel(value) || undefined;

function landmarkRole(element: Element): string | undefined {
  const explicit = element.getAttribute('role')?.toLowerCase();
  if (explicit) return LANDMARK_ROLES.has(explicit) ? explicit : undefined;
  const tag = element.tagName.toLowerCase();
  if (tag === 'form' || tag === 'section')
    return element.getAttribute('aria-label') ? (tag === 'form' ? 'form' : 'region') : undefined;
  // header and footer are landmarks only outside article, section, main, aside and nav.
  if ((tag === 'header' || tag === 'footer') && element.closest('article,section,main,aside,nav'))
    return undefined;
  return LANDMARK_BY_TAG[tag];
}

function labelOf(element: Element, doc: Document): string | undefined {
  const direct = clean(element.getAttribute('aria-label'));
  if (direct) return direct;
  const by = element.getAttribute('aria-labelledby');
  if (by) {
    const text = by
      .split(/\s+/)
      .slice(0, 3)
      .map((id) => doc.getElementById(id)?.textContent ?? '')
      .join(' ');
    return clean(text);
  }
  return undefined;
}

function fieldLabel(field: Element, doc: Document): string | undefined {
  const aria = labelOf(field, doc);
  if (aria) return aria;
  const id = field.getAttribute('id');
  if (id) {
    const label = Array.from(doc.querySelectorAll('label')).find(
      (item) => item.getAttribute('for') === id
    );
    if (label) return clean(label.textContent);
  }
  const wrapping = field.closest('label');
  return wrapping ? clean(wrapping.textContent) : undefined;
}

export function collectStructure(doc: Document): Structure {
  const structure: Structure = {};
  const lang = clean(doc.documentElement?.getAttribute('lang'));
  if (lang) structure.lang = lang.slice(0, 8);
  const title = clean(doc.title);
  if (title) structure.title = title;
  const description = clean(doc.querySelector('meta[name="description"]')?.getAttribute('content'));
  if (description) structure.description = description;

  const headings: NonNullable<Structure['headings']> = [];
  for (const element of Array.from(doc.querySelectorAll('h1,h2,h3'))) {
    if (headings.length >= MAX_HEADINGS) break;
    if (element.closest(IGNORED)) continue;
    const text = clean(element.textContent);
    if (text) headings.push({ level: Number(element.tagName[1]) as 1 | 2 | 3, text });
  }
  if (headings.length) structure.headings = headings;

  const landmarks: NonNullable<Structure['landmarks']> = [];
  for (const element of Array.from(doc.querySelectorAll(LANDMARK_SELECTOR))) {
    if (landmarks.length >= MAX_LANDMARKS) break;
    if (element.closest(IGNORED)) continue;
    const role = landmarkRole(element);
    if (!role) continue;
    const label = labelOf(element, doc);
    landmarks.push({ role, ...(label ? { label: label.slice(0, 60) } : {}) });
  }
  if (landmarks.length) structure.landmarks = landmarks;

  let total = 0;
  let unlabeled = 0;
  const controls: NonNullable<Structure['controls']> = [];
  for (const element of Array.from(doc.querySelectorAll(ELIGIBLE))) {
    if (element.closest(IGNORED)) continue;
    total += 1;
    const name = accessibleName(element);
    if (!name) unlabeled += 1;
    if (controls.length >= MAX_CONTROLS) continue;
    const container = element.parentElement?.closest(LANDMARK_SELECTOR);
    const landmark = container ? landmarkRole(container) : undefined;
    controls.push({
      role: roleOf(element),
      ...(name ? { name } : {}),
      ...(landmark ? { landmark } : {})
    });
  }
  if (controls.length) structure.controls = controls;

  const forms: NonNullable<Structure['forms']> = [];
  for (const form of Array.from(doc.querySelectorAll('form'))) {
    if (forms.length >= MAX_FORMS) break;
    if (form.closest(IGNORED)) continue;
    const fields: Array<{ type: string; label?: string }> = [];
    for (const field of Array.from(form.querySelectorAll('input,select,textarea'))) {
      if (fields.length >= MAX_FIELDS) break;
      if (field.closest(IGNORED)) continue;
      const tag = field.tagName.toLowerCase();
      const type = tag === 'input' ? (field.getAttribute('type') ?? 'text').toLowerCase() : tag;
      if (type === 'hidden' || type === 'submit' || type === 'button') continue;
      const autocomplete = field.getAttribute('autocomplete') ?? '';
      if (SENSITIVE_FIELD.test(type) || SENSITIVE_FIELD.test(autocomplete)) {
        fields.push({ type: type.slice(0, 24) });
        continue;
      }
      const label = fieldLabel(field, doc);
      fields.push({ type: type.slice(0, 24), ...(label ? { label: label.slice(0, 60) } : {}) });
    }
    const name = labelOf(form, doc);
    forms.push({
      ...(name ? { name: name.slice(0, 60) } : {}),
      ...(fields.length ? { fields } : {})
    });
  }
  if (forms.length) structure.forms = forms;

  structure.a11y = {
    controls: total,
    unlabeledControls: unlabeled,
    imagesWithoutAlt: Array.from(doc.querySelectorAll('img:not([alt])')).filter(
      (img) => !img.closest(IGNORED)
    ).length
  };
  return structure;
}

export interface LearnWindowConfig {
  start: string;
  end: string;
}

/** Whether the Worker-provided window covers `now`. Anything unreadable means closed. */
export function learnWindowOpen(
  now: number,
  config: unknown = (globalThis as { __vizoalicaLearn?: unknown }).__vizoalicaLearn
): boolean {
  const window = config as Partial<LearnWindowConfig> | undefined;
  if (!window || typeof window.start !== 'string' || typeof window.end !== 'string') return false;
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end;
}

/** One page load in this share of cases describes its pages; low on purpose. */
export const STRUCTURE_SAMPLE_RATE = 0.1;
export const MAX_STRUCTURE_PER_MINUTE = 20;
