import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["'](js\/[^"']+)["']/g)]
  .map(match => readFileSync(new URL(match[1], import.meta.url), 'utf8'));
const sources = [html, ...scripts].join('\n');
const ids = new Set([...sources.matchAll(/\bid\s*=\s*(["'])([^"'<>]+)\1/g)]
  .map(match => match[2]).filter(id => !id.includes('${')));
const references = [...scripts.join('\n').matchAll(/document\.getElementById\(\s*(['"`])([^'"`\r\n]+)\1\s*\)/g)]
  .map(match => match[2]).filter(id => !id.includes('${'));
const missing = [...new Set(references)].filter(id => !ids.has(id));

console.log(`檢查 ${scripts.length} 支腳本、${ids.size} 個靜態 ID。`);
console.log('缺少的靜態 ID：', missing);
if (missing.length) process.exitCode = 1;
