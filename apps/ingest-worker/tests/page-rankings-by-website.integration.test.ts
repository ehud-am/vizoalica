import { describe, expect, it } from 'vitest';
import { D1Repositories } from '../src/storage/d1-repositories.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/** Page paths across all websites are ranked per website, on the real schema. */
function database() {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Shop','demo',7,'q1','active');
    INSERT INTO sources VALUES ('s1','p1','Storefront','k1','["https://shop.test"]','active','q1','t','t');
    INSERT INTO sources VALUES ('s2','p1','Blog','k2','["https://blog.test"]','active','q1','t','t');
    INSERT INTO sources VALUES ('s3','p1','Old site','k3','["https://old.test"]','deleted','q1','t','t');
    INSERT INTO dashboard_minute_dimensions (project_id, source_id, minute_utc, dimension_kind, dimension_value, event_count) VALUES
      ('p1','s1','2026-01-01T12:00:00.000Z','page_path','/',5),
      ('p1','s1','2026-01-01T12:01:00.000Z','page_path','/',2),
      ('p1','s2','2026-01-01T12:00:00.000Z','page_path','/',3),
      ('p1','s2','2026-01-01T12:00:00.000Z','page_path','/about',1),
      ('p1','s3','2026-01-01T12:00:00.000Z','page_path','/',9),
      ('p1','s1','2026-01-01T12:00:00.000Z','country','FR',4),
      ('p1','s2','2026-01-01T12:00:00.000Z','country','FR',3);
  `);
  return new D1Repositories(d1(sqlite));
}

const range = ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'] as const;

describe('page rankings by website', () => {
  it('keeps the same path on two websites apart and names each website', async () => {
    const overview = await database().getAnalyticsOverview('p1', undefined, ...range);
    expect(overview?.rankings.pagePaths).toEqual({
      items: [
        { label: '/', count: 7, website: 'Storefront' },
        { label: '/', count: 3, website: 'Blog' },
        { label: '/about', count: 1, website: 'Blog' }
      ],
      otherCount: 0,
      total: 11
    });
    // Other rankings still merge across websites.
    expect(overview?.rankings.countries.items).toEqual([{ label: 'FR', count: 7 }]);
  });

  it('leaves page paths unlabelled within one website', async () => {
    const overview = await database().getAnalyticsOverview('p1', 's2', ...range);
    expect(overview?.rankings.pagePaths.items).toEqual([
      { label: '/', count: 3 },
      { label: '/about', count: 1 }
    ]);
  });
});
