import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { isStaticRequest, serveStatic, type StaticDirs } from '../src/static.js';

let dirs: StaticDirs;
let outside: string;
beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), 'vizoalica-static-'));
  const consoleDir = join(root, 'console');
  const sdkDir = join(root, 'sdk');
  outside = join(root, 'outside.txt');
  mkdirSync(join(consoleDir, 'assets'), { recursive: true });
  mkdirSync(join(consoleDir, 'brand'));
  mkdirSync(sdkDir);
  writeFileSync(join(consoleDir, 'index.html'), '<!doctype html><title>Vizoalica</title>');
  writeFileSync(join(consoleDir, 'assets', 'index-abc.js'), 'console.log(1)');
  writeFileSync(join(consoleDir, 'assets', 'index-abc.css'), 'body{}');
  writeFileSync(join(consoleDir, 'brand', 'mark.svg'), '<svg/>');
  writeFileSync(join(consoleDir, 'logo.png'), 'png');
  writeFileSync(outside, 'secret');
  symlinkSync(outside, join(consoleDir, 'assets', 'escape.js'));
  writeFileSync(join(sdkDir, 'vizoalica.js'), '/* sdk */');
  writeFileSync(join(sdkDir, 'vizoalica-loader.js'), '/* loader */');
  writeFileSync(join(sdkDir, 'other.js'), '/* not exposed */');
  dirs = { consoleDir, sdkDir };
});

describe('serveStatic', () => {
  it('serves the console at / with the console headers and no caching', () => {
    const result = serveStatic('GET', '/', dirs);
    expect(result.status).toBe(200);
    expect(result.body?.toString()).toContain('Vizoalica');
    expect(result.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['x-content-type-options']).toBe('nosniff');
    expect(result.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(result.headers['content-security-policy']).toContain("base-uri 'none'");
    expect(result.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('falls back to the console for its own routes', () => {
    for (const path of ['/manage/websites', '/analytics/actions', '/setup']) {
      const result = serveStatic('GET', path, dirs);
      expect(result.status).toBe(200);
      expect(result.headers['content-type']).toContain('text/html');
    }
  });

  it('serves hashed assets with long-lived caching and the right types', () => {
    const script = serveStatic('GET', '/assets/index-abc.js', dirs);
    expect(script.status).toBe(200);
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(script.headers['cache-control']).toContain('immutable');
    expect(serveStatic('GET', '/assets/index-abc.css', dirs).headers['content-type']).toContain(
      'text/css'
    );
    expect(serveStatic('GET', '/brand/mark.svg', dirs).headers['content-type']).toBe(
      'image/svg+xml'
    );
    expect(serveStatic('GET', '/logo.png', dirs).headers['content-type']).toBe('image/png');
  });

  it('answers 404 for a missing asset or file instead of the console', () => {
    for (const path of ['/assets/missing.js', '/brand/none.svg', '/favicon.ico', '/x.map'])
      expect(serveStatic('GET', path, dirs).status).toBe(404);
  });

  it('refuses traversal, encoded separators, backslashes, absolute paths, and NUL', () => {
    for (const path of [
      '/../outside.txt',
      '/assets/../../outside.txt',
      '/%2e%2e/outside.txt',
      '/assets/%2E%2E/%2E%2E/outside.txt',
      '/assets%2f..%2foutside.txt',
      '/assets%5c..%5coutside.txt',
      '/assets\\..\\outside.txt',
      '/%00',
      '/assets/index-abc.js%00.png',
      '/%',
      'assets/index-abc.js'
    ])
      expect(serveStatic('GET', path, dirs).status, path).toBe(404);
  });

  it('refuses a symlink that leaves the console directory', () => {
    expect(serveStatic('GET', '/assets/escape.js', dirs).status).toBe(404);
  });

  it('refuses everything but GET and HEAD', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const result = serveStatic(method, '/', dirs);
      expect(result.status).toBe(405);
      expect(result.headers.allow).toBe('GET, HEAD');
    }
  });

  it('answers HEAD without a body', () => {
    const result = serveStatic('HEAD', '/assets/index-abc.js', dirs);
    expect(result.status).toBe(200);
    expect(result.body).toBeUndefined();
    expect(result.headers['content-length']).toBe('14');
  });

  it('lists no directories', () => {
    expect(serveStatic('GET', '/assets', dirs).headers['content-type']).toContain('text/html');
    expect(serveStatic('GET', '/assets/', dirs).body?.toString()).not.toContain('index-abc');
  });

  it('serves only the two SDK files, as JavaScript, from the SDK directory', () => {
    for (const name of ['vizoalica.js', 'vizoalica-loader.js']) {
      const result = serveStatic('GET', `/api/sdk/${name}`, dirs);
      expect(result.status).toBe(200);
      expect(result.headers['content-type']).toBe('text/javascript; charset=utf-8');
    }
    expect(serveStatic('GET', '/api/sdk/other.js', dirs).status).toBe(404);
    expect(serveStatic('GET', '/api/sdk/..%2fvizoalica.js', dirs).status).toBe(404);
    expect(serveStatic('GET', '/api/sdk/vizoalica.js', {}).status).toBe(404);
  });

  it('is a 404 when no console is configured or built', () => {
    expect(serveStatic('GET', '/', {}).status).toBe(404);
    expect(serveStatic('GET', '/', { consoleDir: join(tmpdir(), 'vizoalica-nope') }).status).toBe(
      404
    );
    const empty = mkdtempSync(join(tmpdir(), 'vizoalica-empty-'));
    expect(serveStatic('GET', '/', { consoleDir: empty }).status).toBe(404);
  });
});

describe('isStaticRequest', () => {
  it('leaves /api alone except the SDK files', () => {
    expect(isStaticRequest('/')).toBe(true);
    expect(isStaticRequest('/assets/x.js')).toBe(true);
    expect(isStaticRequest('/api/projects')).toBe(false);
    expect(isStaticRequest('/api/sdk/vizoalica.js')).toBe(true);
  });
});
