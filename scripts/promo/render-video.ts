/**
 * Renders the intro video: scripts/promo/video/index.html is drawn from a clock, captured frame by
 * frame with Chromium, and encoded with ffmpeg into an MP4, a WebM, and a poster image in
 * docs/public/media/. It needs no network and no credentials. Run the snapshot command first:
 * the video shows those images.
 *
 * Run: node --import tsx scripts/promo/render-video.ts   (or: pnpm promo:video)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../apps/admin-web/package.json', import.meta.url));
const { chromium } = require('@playwright/test') as typeof import('@playwright/test');

const FPS = 30;
const POSTER_AT = 2.6; // a frame with the first message typed and the console behind it
const HTML = fileURLToPath(new URL('./video/index.html', import.meta.url));
const OUT = fileURLToPath(new URL('../../docs/public/media/', import.meta.url));

function ffmpeg(args: string[]): void {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error('ffmpeg failed. Is it installed (https://ffmpeg.org)?');
}

async function main(): Promise<void> {
  for (const image of ['01-overview.png', '02-geography.png', '05-install.png'])
    if (
      !existsSync(fileURLToPath(new URL(`../../docs/assets/promo-src/${image}`, import.meta.url)))
    )
      throw new Error(`Missing ${image}. Run pnpm promo:snapshots first.`);
  mkdirSync(OUT, { recursive: true });
  const frames = mkdtempSync(join(tmpdir(), 'vizoalica-video-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${pathToFileURL(HTML).href}?render`);
    await page.waitForFunction(() =>
      Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)
    );
    const duration = await page.evaluate(
      () => (window as unknown as { VIDEO_DURATION: number }).VIDEO_DURATION
    );
    const total = Math.round(duration * FPS);
    for (let index = 0; index < total; index += 1) {
      await page.evaluate(
        (t) => (window as unknown as { renderAt: (t: number) => void }).renderAt(t),
        index / FPS
      );
      await page.screenshot({ path: join(frames, `frame-${String(index).padStart(4, '0')}.png`) });
    }
    console.log(`captured ${total} frames (${duration}s at ${FPS} fps)`);
    await page.evaluate(
      (t) => (window as unknown as { renderAt: (t: number) => void }).renderAt(t),
      POSTER_AT
    );
    await page.screenshot({ path: join(frames, 'poster.png') });
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
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    join(OUT, 'vizoalica-intro.mp4')
  ]);
  ffmpeg([
    ...input,
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '34',
    '-b:v',
    '0',
    '-pix_fmt',
    'yuv420p',
    join(OUT, 'vizoalica-intro.webm')
  ]);
  ffmpeg(['-i', join(frames, 'poster.png'), '-q:v', '3', join(OUT, 'vizoalica-intro-poster.jpg')]);
  // The social preview image (1200x630) is the poster frame, cropped.
  ffmpeg([
    '-i',
    join(frames, 'poster.png'),
    '-vf',
    'scale=1200:-1,crop=1200:630',
    '-q:v',
    '3',
    join(OUT, '../og.jpg')
  ]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
