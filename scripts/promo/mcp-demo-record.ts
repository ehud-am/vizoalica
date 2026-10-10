/**
 * Records the transcripts behind the MCP demo video: starts the fictional local backend
 * (mcp-demo-backend.ts), points `vizoalica mcp` at it through a throwaway HOME, and asks real Claude
 * Code (headless, `claude -p`) a site owner's questions, one after the other in the same session.
 * Each answer's tool calls, results, and text are saved in scripts/promo/mcp-demo/ so the video is
 * reproducible and auditable; render-mcp-demo.ts draws the video from those files.
 *
 * It needs the `claude` command, signed in. Nothing is sent to any Vizoalica or Cloudflare service:
 * the only backend is the in-process Worker on 127.0.0.1.
 *
 * Run: node --import tsx scripts/promo/mcp-demo-record.ts   (then: pnpm promo:mcp-demo)
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoBackend } from './mcp-demo-backend.js';
import { sanitizeTranscript } from './mcp-demo-transcript.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = fileURLToPath(new URL('./mcp-demo/', import.meta.url));

const QUESTIONS = ['How did my websites do last week?', 'Why did traffic to the blog drop?'];

/** Keeps answers short enough to read in a video; the facts are the model's own. */
const STYLE =
  'You are being recorded for a short demo. Use the tools as much as the question needs, then answer in plain Markdown: one short line naming the environment and range, then at most 4 bullets of under 25 words each. No tables, no headings.';

function claude(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`claude exited with ${code}`))
    );
  });
}

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'vizoalica-mcp-record-'));
  const { server, home } = await startDemoBackend({ home: join(work, 'home') });
  try {
    // A project folder holding only the Vizoalica skill, so Claude Code can load it.
    const project = join(work, 'paperkite');
    cpSync(join(ROOT, 'skills/vizoalica'), join(project, '.claude/skills/vizoalica'), {
      recursive: true
    });
    const config = join(work, 'mcp.json');
    writeFileSync(
      config,
      JSON.stringify({
        mcpServers: {
          vizoalica: {
            command: 'node',
            args: [join(ROOT, 'bin/vizoalica.mjs'), 'mcp'],
            env: { HOME: home }
          }
        }
      })
    );
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'questions.json'), `${JSON.stringify(QUESTIONS, null, 2)}\n`);
    let session: string | undefined;
    for (const [index, question] of QUESTIONS.entries()) {
      const raw = await claude(
        [
          '-p',
          question,
          '--mcp-config',
          config,
          '--strict-mcp-config',
          '--setting-sources',
          'project',
          '--allowedTools',
          'mcp__vizoalica__* Skill',
          '--append-system-prompt',
          STYLE,
          '--output-format',
          'stream-json',
          '--verbose',
          ...(session ? ['--resume', session] : [])
        ],
        project
      );
      for (const line of raw.split('\n').filter(Boolean)) {
        const event = JSON.parse(line) as { type: string; session_id?: string; result?: string };
        if (event.type === 'result') {
          session = event.session_id;
          console.log(`\n> ${question}\n${event.result}`);
        }
      }
      // Only what the video shows is kept; local temporary paths are not part of the story.
      writeFileSync(
        join(OUT, `q${index + 1}.jsonl`),
        sanitizeTranscript(raw.split(work).join('/demo'))
      );
    }
  } finally {
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
