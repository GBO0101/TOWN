import { afterAll, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { request } from 'node:http';

const root = process.cwd();
let child;
let port;

function get(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
});

test('node server.js starts and serves the AI office', async () => {
  port = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      env: { ...process.env, PORT: '0' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let errors = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 4000);
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
  });
  const response = await get('/');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('text/html');
  expect(response.body).toContain('charactersLayer');
});

test.each([
  ['/index.html?v=1', 'text/html'],
  ['/style.css?v=1', 'text/css'],
  ['/js/app.js?v=1', 'application/javascript'],
  ['/assets/icons/desk.svg?v=1', 'image/svg+xml'],
])('serves public file %s with query parameters', async (path, type) => {
  const response = await get(path);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain(type);
  expect(response.body.length).toBeGreaterThan(0);
});

test.each([
  '/package.json',
  '/server.js',
  '/start.ps1',
  '/check_ids.js',
  '/vitest.config.js',
  '/test/data.test.js',
  '/uploads/private.txt',
  '/opencode-usage/package.json',
  '/opencode-usage-sqlite/package.json',
  '/js/../package.json',
  '/js/%2e%2e/package.json',
  '/assets/../../package.json',
  '/assets/%2e%2e%2fpackage.json',
  '/assets/%5c..%5cpackage.json',
])('does not expose private or traversal path %s', async path => {
  expect((await get(path)).status).toBe(404);
});

test('serves percent-encoded public paths and rejects malformed encoding', async () => {
  expect((await get('/js/%61pp.js')).status).toBe(200);
  expect((await get('/assets/%E0%A4%A')).status).toBe(400);
  expect((await get('/')).status).toBe(200);
});

test('serves every imported visual stylesheet and its background assets', async () => {
  const entry = await get('/style.css');
  const imports = [...entry.body.matchAll(/@import\s+url\(['"]([^'"]+)['"]\)/g)].map(match => match[1]);
  expect(imports.length).toBeGreaterThan(0);
  for (const file of imports) {
    const response = await get('/' + file);
    expect(response.status, file).toBe(200);
    expect(response.headers['content-type']).toContain('text/css');
    for (const [, image] of response.body.matchAll(/url\(['"]([^'"]+)['"]\)/g)) {
      const asset = new URL(image, 'http://localhost/' + file).pathname;
      expect((await get(asset)).status, asset).toBe(200);
    }
  }
  expect((await get('/styles/../package.json')).status).toBe(404);
  expect((await get('/styles/.private.css')).status).toBe(404);
});
