import type { CloudEvent, PageStructureData } from '@vizoalica/event-contracts';
import { normalizePagePath, redactLabel } from '@vizoalica/privacy';

export const PAGE_STRUCTURE_EVENT_TYPE = 'com.vizoalica.page_structure.v1';
export const MAX_STRUCTURE_BYTES = 4096;

const clean = (value: unknown, max: number): string | undefined => {
  const text = redactLabel(value, max).trim();
  return text || undefined;
};

/**
 * Cleans a page structure event again on the server, whatever the sender did: every text goes
 * through the same redaction as action names, empty texts are dropped, and the page key is
 * normalized. An event still over the size cap is refused (undefined).
 */
export function normalizePageStructure(
  event: CloudEvent<PageStructureData>,
  group: (pageKey: string) => string
): CloudEvent<PageStructureData> | undefined {
  const source = event.data.structure;
  const structure: PageStructureData['structure'] = {};
  const lang = clean(source.lang, 8);
  if (lang) structure.lang = lang;
  const title = clean(source.title, 256);
  if (title) structure.title = title;
  const description = clean(source.description, 160);
  if (description) structure.description = description;
  const headings = (source.headings ?? []).flatMap((heading) => {
    const text = clean(heading.text, 80);
    return text ? [{ level: heading.level, text }] : [];
  });
  if (headings.length) structure.headings = headings;
  const landmarks = (source.landmarks ?? []).flatMap((landmark) => {
    const role = clean(landmark.role, 24);
    const label = clean(landmark.label, 60);
    return role ? [{ role, ...(label ? { label } : {}) }] : [];
  });
  if (landmarks.length) structure.landmarks = landmarks;
  const controls = (source.controls ?? []).flatMap((control) => {
    const role = clean(control.role, 24);
    const name = clean(control.name, 80);
    const landmark = clean(control.landmark, 24);
    return role ? [{ role, ...(name ? { name } : {}), ...(landmark ? { landmark } : {}) }] : [];
  });
  if (controls.length) structure.controls = controls;
  const forms = (source.forms ?? []).map((form) => {
    const name = clean(form.name, 60);
    const fields = (form.fields ?? []).flatMap((field) => {
      const type = clean(field.type, 24);
      const label = clean(field.label, 60);
      return type ? [{ type, ...(label ? { label } : {}) }] : [];
    });
    return { ...(name ? { name } : {}), ...(fields.length ? { fields } : {}) };
  });
  if (forms.length) structure.forms = forms;
  if (source.a11y) structure.a11y = source.a11y;
  const data: PageStructureData = {
    page: {
      url_origin: event.data.page.url_origin,
      url_path: group(normalizePagePath(event.data.page.url_path))
    },
    structure,
    visitor: event.data.visitor,
    session: event.data.session
  };
  if (JSON.stringify(data).length > MAX_STRUCTURE_BYTES) return undefined;
  return { ...event, data };
}
