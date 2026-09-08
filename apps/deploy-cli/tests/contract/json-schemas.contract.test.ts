import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { failureResult, result } from '../../src/cli.js';
import { validateProfile } from '../../src/config.js';
import { DeploymentFailure } from '../../src/types.js';
import { nativeProfile, onecliProfile } from '../support.js';

async function schema(name: string) {
  return JSON.parse(
    await readFile(
      new URL(
        `../../../../specs/005-onecli-cloudflare-credentials/contracts/${name}`,
        import.meta.url
      ),
      'utf8'
    )
  );
}

describe('versioned deployment JSON schemas', () => {
  it('accepts both validated provider profile shapes', async () => {
    const ajv = new Ajv2020({ strict: true });
    const validate = ajv.compile(await schema('deployment-profile.schema.json'));
    expect(validate(validateProfile(onecliProfile)), validate.errors?.map(String).join('\n')).toBe(
      true
    );
    expect(validate(validateProfile(nativeProfile)), validate.errors?.map(String).join('\n')).toBe(
      true
    );
  });

  it('accepts successful and failed emitted result shapes', async () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(await schema('deployment-result.schema.json'));
    const success = result('plan', {
      planId: 'a'.repeat(64),
      details: { mutations: ['d1.migrations.apply', 'worker.deploy'] }
    });
    expect(validate(success), JSON.stringify(validate.errors)).toBe(true);
    const failure = failureResult(
      'apply',
      new DeploymentFailure('approval_required', 'unsafe upstream text', 6, 'review')
    );
    expect(validate(failure), JSON.stringify(validate.errors)).toBe(true);
  });
});
