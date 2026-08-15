import { describe, expect, it } from 'vitest';
import { ingestBatch } from '../../src/ingestion/pipeline.js';
import {
  createRepositories,
  pageViewEvent,
  project,
  quotaPolicy,
  secret,
  source,
  token,
  now
} from '../test-helpers.js';

describe('project isolation', () => {
  it('throttles one project without affecting another project', async () => {
    const projectTwo = { ...project, id: 'proj_2', name: 'Project 2' };
    const sourceTwo = {
      ...source,
      id: 'src_2',
      projectId: 'proj_2',
      publicSourceKey: 'public_src_2'
    };
    const strictPolicy = { ...quotaPolicy, id: 'quota_strict', maxEventsPerBatch: 1 };
    const repo = createRepositories({
      project: { ...project, quotaPolicyId: strictPolicy.id },
      quotaPolicy: strictPolicy
    });
    const repoTwo = createRepositories({ project: projectTwo, source: sourceTwo, quotaPolicy });

    const throttled = await ingestBatch(
      {
        body: JSON.stringify([pageViewEvent('evt_a_123456'), pageViewEvent('evt_b_123456')]),
        publicSourceKey: source.publicSourceKey,
        origin: 'https://example.com',
        authorization: `Bearer ${token({ max_events: 25 })}`,
        now
      },
      { repositories: repo, tokenSecret: secret }
    );
    const accepted = await ingestBatch(
      {
        body: JSON.stringify([pageViewEvent('evt_c_123456')]),
        publicSourceKey: sourceTwo.publicSourceKey,
        origin: 'https://example.com',
        authorization: `Bearer ${token({ project_id: 'proj_2', source_id: 'src_2' })}`,
        now
      },
      { repositories: repoTwo, tokenSecret: secret }
    );

    expect(throttled.status).toBe(429);
    expect(accepted.status).toBe(202);
    await expect(repo.listAcceptedEvents()).resolves.toHaveLength(0);
    await expect(repoTwo.listAcceptedEvents('proj_2')).resolves.toHaveLength(1);
  });
});
