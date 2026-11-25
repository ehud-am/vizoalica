import { describe, expect, it } from 'vitest';
import type { CloudEvent, PageStructureData } from '@vizoalica/event-contracts';
import { normalizePageStructure } from '../../src/ingestion/page-structure.js';

const event = (structure: Record<string, unknown>): CloudEvent<PageStructureData> =>
  ({
    specversion: '1.0',
    id: 'e1',
    type: 'com.vizoalica.page_structure.v1',
    source: 'https://shop.test',
    time: '2026-12-01T00:00:00Z',
    datacontenttype: 'application/json',
    data: {
      page: { url_origin: 'https://shop.test', url_path: '/orders/123456' },
      structure,
      visitor: { anonymous_id: 'v' },
      session: { id: 's' }
    }
  }) as unknown as CloudEvent<PageStructureData>;

describe('normalizePageStructure', () => {
  it('drops empty parts and keeps the rest, grouping the page key', () => {
    const out = normalizePageStructure(
      event({
        lang: 'en',
        title: 'Plans',
        description: 'About plans',
        headings: [
          { level: 1, text: 'Plans' },
          { level: 2, text: '' }
        ],
        landmarks: [{ role: 'main', label: 'Body' }, { role: '' }],
        controls: [
          { role: 'button', name: 'Buy', landmark: 'main' },
          { role: 'link' },
          { role: '' }
        ],
        forms: [{ name: 'Sign up', fields: [{ type: 'email', label: 'Work' }, { type: '' }] }, {}],
        a11y: { controls: 3, unlabeledControls: 1, imagesWithoutAlt: 0 }
      }),
      (key) => `grouped:${key}`
    )!;
    expect(out.data.page.url_path.startsWith('grouped:')).toBe(true);
    expect(out.data.structure.headings).toHaveLength(1);
    expect(out.data.structure.landmarks).toHaveLength(1);
    expect(out.data.structure.controls).toHaveLength(2);
    expect(out.data.structure.forms).toHaveLength(2);
    expect(out.data.structure.a11y).toBeDefined();
  });

  it('omits parts that are missing and refuses an oversized event', () => {
    const bare = normalizePageStructure(event({}), (key) => key)!;
    expect(bare.data.structure).toEqual({});
    const huge = event({
      controls: Array.from({ length: 100 }, (_, i) => ({
        role: 'button',
        name: `Button number ${i} long long label`
      }))
    });
    expect(normalizePageStructure(huge, (key) => key)).toBeUndefined();
  });
});
