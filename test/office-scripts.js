import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function readOfficePage() {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(([, path]) => ({
    path, source: readFileSync(resolve(root, path), 'utf8'),
  }));
  return { html, scripts };
}
