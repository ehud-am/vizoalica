/**
 * Renders the MCP demo video from the recorded Claude Code transcripts (scripts/promo/mcp-demo/q*.jsonl,
 * made by mcp-demo-record.ts). It reduces each transcript to what a terminal shows (the question, the
 * Vizoalica tool calls with a one-line gist of each result, and Claude's answer, word for word) into
 * mcp-demo/transcript.js, draws mcp-demo/replay.html from a clock, captures it frame by frame with
 * Chromium, and encodes an MP4, a WebM, and a poster into docs/public/media/, plus a still of an answer
 * for the homepage (docs/assets/mcp-answer.png). It needs no network and no credentials.
 *
 * ffmpeg comes from PATH, or from FFMPEG=<path> (for example the binary bundled with the Python package
 * imageio-ffmpeg: python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())").
 *
 * CHROMIUM_PATH=<path> uses a Chromium other than the one Playwright expects.
 *
 * Run: node --import tsx scripts/promo/render-mcp-demo.ts   (or: pnpm promo:mcp-demo)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../apps/admin-web/package.json', import.meta.url));
const { chromium } = require('@playwright/test') as typeof import('@playwright/test');

const FPS = 30;
const DIR = fileURLToPath(new URL('./mcp-demo/', import.meta.url));
const HTML = join(DIR, 'replay.html');
const OUT = fileURLToPath(new URL('../../docs/public/media/', import.meta.url));
const STILL = fileURLToPath(new URL('../../docs/assets/mcp-answer.png', import.meta.url));
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

type Json = Record<string, unknown>;
type Step = { tool: string; args: string; gist: string };
export type Turn = { question: string; steps: Step[]; answer: string };

const n = (value: unknown) => Number(value).toLocaleString('en-US');
const pct = (value: unknown) =>
  value === null || value === undefined ? 'n/a' : `${Number(value) > 0 ? '+' : ''}${value}%`;

/** One line about a tool's result, from its own numbers, like the gist a terminal shows. */
function gist(tool: string, data: Json | undefined, text: string): string {
  if (!data) return text.split('\n').find((line) => line && !line.startsWith('Environment:')) ?? '';
  const scope = data.scope as { project?: string; website?: string | null } | undefined;
  const where = scope?.website ?? `${scope?.project ?? ''} (all websites)`;
  switch (tool) {
    case 'list_environments': {
      const list =
        (data.environments as Array<{ name: string; role: string; works: boolean }>) ?? [];
      return list
        .map((e) => `${e.name} (${e.role}, ${e.works ? 'works' : 'not working'})`)
        .join(', ');
    }
    case 'list_websites': {
      const projects =
        (data.projects as Array<{ name: string; websites: Array<{ name: string }> }>) ?? [];
      return projects
        .map((p) => `${p.name}: ${p.websites.map((w) => w.name).join(', ')}`)
        .join('; ');
    }
    case 'compare_periods': {
      const views = data.pageViews as Json;
      const visitors = data.uniqueVisitors as Json;
      return `${where}: ${n(views.current)} page views (${pct(views.percent)}), ${n(visitors.current)} visitors (${pct(visitors.percent)}) vs the period before`;
    }
    case 'get_traffic_overview': {
      const totals = data.totals as Json;
      const range = data.range as { startUtc: string; endUtc: string };
      return `${where}, ${range.startUtc.slice(5, 10)} to ${range.endUtc.slice(5, 10)}: ${n(totals.pageViews)} page views, ${n(totals.uniqueUsers)} visitors`;
    }
    default:
      return text.split('\n')[1] ?? '';
  }
}

const argText = (input: Json) =>
  Object.entries(input)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ');

/** What the terminal shows for one recorded answer. */
export function turnFrom(jsonl: string): Turn {
  const events = jsonl
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Json);
  const results = new Map<string, { text: string; data?: Json }>();
  for (const event of events)
    if (event.type === 'user')
      for (const item of ((event.message as Json).content as Json[]) ?? [])
        if (typeof item === 'object' && item.type === 'tool_result') {
          const raw = item.content;
          const text =
            typeof raw === 'string'
              ? raw
              : Array.isArray(raw)
                ? (raw as Json[]).map((part) => String(part.text ?? '')).join('\n')
                : '';
          let data: Json | undefined;
          try {
            data = JSON.parse(text) as Json;
          } catch {
            data = undefined;
          }
          results.set(String(item.tool_use_id), { text, ...(data ? { data } : {}) });
        }
  const steps: Step[] = [];
  for (const event of events) {
    if (event.type !== 'assistant') continue;
    for (const item of (event.message as Json).content as Json[]) {
      if (item.type === 'tool_use') {
        const name = String(item.name);
        const result = results.get(String(item.id));
        if (name.startsWith('mcp__vizoalica__')) {
          const tool = name.slice('mcp__vizoalica__'.length);
          steps.push({
            tool,
            args: argText(item.input as Json),
            gist: gist(tool, result?.data, result?.text ?? '')
          });
        } else if (name === 'Skill')
          steps.push({ tool: 'skill', args: String((item.input as Json).skill), gist: '' });
      }
    }
  }
  const final = events.find((event) => event.type === 'result');
  return { question: '', steps, answer: String(final?.result ?? '') };
}

function ffmpeg(args: string[]): void {
  const result = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit'
  });
  if (result.status !== 0)
    throw new Error('ffmpeg failed. Install it, or set FFMPEG to an ffmpeg binary.');
}

async function main(): Promise<void> {
  const questions = JSON.parse(readFileSync(join(DIR, 'questions.json'), 'utf8')) as string[];
  const files = readdirSync(DIR)
    .filter((name) => /^q\d+\.jsonl$/.test(name))
    .sort();
  if (!files.length) throw new Error('No transcripts. Run scripts/promo/mcp-demo-record.ts first.');
  const turns = files.map((name, index) => ({
    ...turnFrom(readFileSync(join(DIR, name), 'utf8')),
    question: questions[index]!
  }));
  writeFileSync(
    join(DIR, 'transcript.js'),
    `// Generated by scripts/promo/render-mcp-demo.ts from q*.jsonl. Do not edit.\nwindow.TRANSCRIPT = ${JSON.stringify(turns, null, 2)};\n`
  );

  mkdirSync(OUT, { recursive: true });
  const frames = mkdtempSync(join(tmpdir(), 'vizoalica-mcp-video-'));
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${pathToFileURL(HTML).href}?render`);
    await page.evaluate(() => document.fonts.ready);
    const { duration, poster } = await page.evaluate(() => {
      const w = window as unknown as { VIDEO_DURATION: number; POSTER_AT: number };
      return { duration: w.VIDEO_DURATION, poster: w.POSTER_AT };
    });
    const total = Math.round(duration * FPS);
    const renderAt = (t: number) =>
      page.evaluate(
        (at) => (window as unknown as { renderAt: (t: number) => void }).renderAt(at),
        t
      );
    for (let index = 0; index < total; index += 1) {
      await renderAt(index / FPS);
      await page.screenshot({ path: join(frames, `frame-${String(index).padStart(4, '0')}.png`) });
    }
    console.log(`captured ${total} frames (${duration.toFixed(1)}s at ${FPS} fps)`);
    await renderAt(poster);
    await page.screenshot({ path: join(frames, 'poster.png') });

    // The homepage still: the last question and its whole answer, 1200 px wide.
    const still = await browser.newPage({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 1
    });
    await still.goto(`${pathToFileURL(HTML).href}?still=${turns.length - 1}`);
    await still.evaluate(() => document.fonts.ready);
    const height = await still.evaluate(() => document.getElementById('stage')!.offsetHeight);
    await still.setViewportSize({ width: 1200, height });
    await still.screenshot({ path: STILL });
  } finally {
    await browser.close();
  }
  const input = ['-framerate', String(FPS), '-i', join(frames, 'frame-%04d.png')];
  ffmpeg([
    ...input,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '24',
    '-tune',
    'stillimage',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    join(OUT, 'vizoalica-mcp-demo.mp4')
  ]);
  ffmpeg([
    ...input,
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '38',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    '-pix_fmt',
    'yuv420p',
    join(OUT, 'vizoalica-mcp-demo.webm')
  ]);
  ffmpeg([
    '-i',
    join(frames, 'poster.png'),
    '-q:v',
    '3',
    join(OUT, 'vizoalica-mcp-demo-poster.jpg')
  ]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`wrote ${OUT} and ${STILL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
