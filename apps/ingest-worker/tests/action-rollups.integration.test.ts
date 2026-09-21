import { describe, expect, it } from 'vitest';
import {
  actionEvent,
  context,
  count,
  pageViewEvent,
  rows,
  seededRepositories
} from './support/fixtures.js';

describe('action rollups on the real schema', () => {
  it('writes one count row and one visitor row for a new action', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups([actionEvent('e1')], context);
    expect(rows(sqlite, 'SELECT * FROM dashboard_minute_actions')).toEqual([
      {
        project_id: 'p1',
        source_id: 's1',
        minute_utc: '2026-01-01T12:34:00.000Z',
        page_path: '/pricing',
        action_name: 'Go',
        action_kind: 'button',
        destination: '',
        event_count: 1
      }
    ]);
    const [visitor] = rows(sqlite, 'SELECT * FROM dashboard_minute_action_visitors');
    expect(visitor).toMatchObject({
      project_id: 'p1',
      source_id: 's1',
      identity_kind: 'source-local'
    });
    // A keyed digest, never the raw anonymous id.
    expect(String(visitor!.visitor_digest)).toMatch(/^[0-9a-f]{64}$/);
    expect(
      JSON.stringify(rows(sqlite, 'SELECT * FROM dashboard_minute_action_visitors'))
    ).not.toContain('anon-1');
  });

  it('increments the count for the same action in the same minute, with one row per visitor', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [actionEvent('e1'), actionEvent('e2'), actionEvent('e3', { visitor: 'anon-2' })],
      context
    );
    expect(rows(sqlite, 'SELECT event_count FROM dashboard_minute_actions')).toEqual([
      { event_count: 3 }
    ]);
    expect(count(sqlite, 'dashboard_minute_action_visitors')).toBe(2);
  });

  it('keeps separate rows per page, name, kind, destination, and minute', async () => {
    const { sqlite, repositories } = seededRepositories();
    const dest = { url_origin: 'https://app.example.com', url_path: '/signup' };
    await repositories.recordDashboardRollups(
      [
        actionEvent('e1'),
        actionEvent('e2', { page: '/#/plans' }),
        actionEvent('e3', { name: 'Other' }),
        actionEvent('e4', { kind: 'link', destination: dest }),
        actionEvent('e5', { at: '2026-01-01T12:35:00.000Z' })
      ],
      context
    );
    expect(count(sqlite, 'dashboard_minute_actions')).toBe(5);
    expect(
      rows(sqlite, "SELECT destination FROM dashboard_minute_actions WHERE action_kind = 'link'")
    ).toEqual([{ destination: 'https://app.example.com/signup' }]);
  });

  it('counts a replayed or retried event once', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups([actionEvent('e1')], context);
    await repositories.recordDashboardRollups([actionEvent('e1')], context);
    await repositories.recordDashboardRollups([actionEvent('e1'), actionEvent('e2')], context);
    expect(rows(sqlite, 'SELECT event_count FROM dashboard_minute_actions')).toEqual([
      { event_count: 2 }
    ]);
    expect(count(sqlite, 'dashboard_seen_events')).toBe(2);
  });

  it('counts a visitor once across minutes in a range while keeping a row per minute', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [actionEvent('e1'), actionEvent('e2', { at: '2026-01-01T13:00:00.000Z' })],
      context
    );
    expect(count(sqlite, 'dashboard_minute_action_visitors')).toBe(2);
    const report = await repositories.getActionsReport(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(report!.rows[0]).toMatchObject({ count: 2, visitors: 1 });
    expect(report!.totals).toEqual({ actions: 2, uniqueUsers: 1 });
  });

  it('uses the project-supplied identity when the token carries one', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups([actionEvent('e1')], {
      ...context,
      projectVisitorId: 'crm-42'
    });
    expect(rows(sqlite, 'SELECT identity_kind FROM dashboard_minute_action_visitors')).toEqual([
      { identity_kind: 'project-supplied' }
    ]);
  });

  it('isolates projects that have identical pages and names', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [actionEvent('e1'), actionEvent('e2', { project: 'p2', source: 'x1' })],
      context
    );
    expect(
      rows(sqlite, 'SELECT project_id FROM dashboard_minute_actions ORDER BY project_id')
    ).toEqual([{ project_id: 'p1' }, { project_id: 'p2' }]);
    const one = await repositories.getActionsReport(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    const two = await repositories.getActionsReport(
      'p2',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(one!.totals.actions).toBe(1);
    expect(two!.totals.actions).toBe(1);
  });

  it('writes nothing to the page-view or legacy tables for actions', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups([actionEvent('e1')], context);
    for (const table of [
      'dashboard_minute_totals',
      'dashboard_minute_dimensions',
      'dashboard_minute_visitors',
      'dashboard_rollups',
      'dashboard_hourly_page_views',
      'dashboard_hourly_visitors'
    ])
      expect(count(sqlite, table), table).toBe(0);
    // The watermark still advances, so the report can say when its data was last complete.
    expect(count(sqlite, 'dashboard_aggregate_watermarks')).toBe(1);
  });

  it('records page views and actions from one batch, each in its own tables', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [pageViewEvent('p-1', { page: '/#/pricing' }), actionEvent('a-1', { page: '/#/pricing' })],
      context
    );
    expect(rows(sqlite, 'SELECT page_view_count FROM dashboard_minute_totals')).toEqual([
      { page_view_count: 1 }
    ]);
    expect(
      rows(
        sqlite,
        "SELECT dimension_value, event_count FROM dashboard_minute_dimensions WHERE dimension_kind = 'page_path'"
      )
    ).toEqual([{ dimension_value: '/#/pricing', event_count: 1 }]);
    expect(rows(sqlite, 'SELECT event_count FROM dashboard_minute_actions')).toEqual([
      { event_count: 1 }
    ]);
  });

  it('skips malformed actions, and the schema rejects an unknown kind', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [
        actionEvent('bad-1', { name: '' }),
        actionEvent('bad-2', { kind: 'menu' }),
        {
          ...actionEvent('bad-3'),
          event: { id: '', type: 'com.vizoalica.action.v1', data: {} }
        } as never
      ],
      context
    );
    expect(count(sqlite, 'dashboard_minute_actions')).toBe(0);
    expect(() =>
      sqlite.exec("INSERT INTO dashboard_minute_actions VALUES ('p1','s1','m','/','x','menu','',1)")
    ).toThrow(/CHECK/i);
    expect(() =>
      sqlite.exec(
        "INSERT INTO dashboard_minute_actions VALUES ('p1','s1','m','/','x','button','',-1)"
      )
    ).toThrow(/CHECK/i);
  });

  it('does nothing for an empty batch', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups([], context);
    expect(count(sqlite, 'dashboard_seen_events')).toBe(0);
  });
});

describe('action retention', () => {
  it('deletes rows older than the boundary in both tables and keeps newer ones', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [
        actionEvent('old', { at: '2025-11-01T10:00:00.000Z' }),
        actionEvent('new', { at: '2026-01-01T10:00:00.000Z' })
      ],
      context
    );
    await repositories.deleteExpiredDashboardData('2025-12-01T00:00:00.000Z');
    expect(rows(sqlite, 'SELECT minute_utc FROM dashboard_minute_actions')).toEqual([
      { minute_utc: '2026-01-01T10:00:00.000Z' }
    ]);
    expect(rows(sqlite, 'SELECT minute_utc FROM dashboard_minute_action_visitors')).toEqual([
      { minute_utc: '2026-01-01T10:00:00.000Z' }
    ]);
  });
});
