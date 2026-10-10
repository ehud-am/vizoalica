#!/usr/bin/env node
// Regenerates the base64-embedded Pages Functions/loader block inside
// .github/workflows/deploy-vizoalica-pages.yml from their real source files.
//
// The reusable deploy workflow cannot `actions/checkout` this repository from
// a customer's workflow run: GITHUB_TOKEN never carries cross-repo access to
// a private repository, even one owned by the same account that granted the
// reusable-workflow "access_level: user" permission (that setting only
// governs which repos may *resolve* the workflow_call, not what
// actions/checkout can read). So the three small files this workflow needs
// are embedded directly in the workflow YAML instead, and this script keeps
// that embedded copy byte-identical to the real source.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = join(root, '.github/workflows/deploy-vizoalica-pages.yml');

const sources = {
  CONFIG_JSON_TS_B64: 'examples/cloudflare-pages/functions/vizoalica/config.json.ts',
  INGEST_TOKEN_TS_B64: 'examples/cloudflare-pages/functions/vizoalica/ingest-token.ts',
  VIZOALICA_LOADER_JS_B64: 'examples/cloudflare-pages/public/vizoalica-loader.js'
};

const workflow = readFileSync(workflowPath, 'utf8');
const beginMarker = '# BEGIN GENERATED: pnpm run generate:deploy-workflow';
const endMarker = '# END GENERATED';
const beginIndex = workflow.indexOf(beginMarker);
const endIndex = workflow.indexOf(endMarker);
if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
  console.error('Could not find the generated block markers in the workflow file.');
  process.exit(1);
}

const lines = [beginMarker];
for (const [envName, relativePath] of Object.entries(sources)) {
  const content = readFileSync(join(root, relativePath), 'utf8');
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  lines.push(`          ${envName}: ${encoded}`);
}
const block = lines.join('\n') + '\n          ';

const updated = workflow.slice(0, beginIndex) + block + workflow.slice(endIndex);

if (process.argv.includes('--check')) {
  if (updated !== workflow) {
    console.error(
      'deploy-vizoalica-pages.yml is out of date with its source files.\n' +
        'Run `pnpm run generate:deploy-workflow` and commit the result.'
    );
    process.exit(1);
  }
  console.log('deploy-vizoalica-pages.yml is up to date.');
  process.exit(0);
}

writeFileSync(workflowPath, updated);
console.log('Regenerated the embedded block in deploy-vizoalica-pages.yml.');
