/**
 * AI 辦公室 - 本機開發伺服器
 * Run: node server.js
 * Open: http://localhost:3000
 */
import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = await realpath(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT ?? 3000);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

function isPublicFile(file) {
  if (/[\\:\0]/.test(file) || file.split('/').some(part => !part || part.startsWith('.'))) return false;
  return file === 'index.html' || file === 'style.css' || /^styles\/[^/]+\.css$/.test(file) || /^js\/[^/]+\.js$/.test(file) ||
    (file.startsWith('assets/') && MIME_TYPES[path.extname(file)]?.startsWith('image/'));
}

function respond(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

const pendingReads = new Map();

function readPublicFile(file) {
  const pending = pendingReads.get(file);
  if (pending) return pending;
  // 合併同一路徑的重疊讀取，完成後讓下個請求讀取目前的檔案。
  const reading = (async () => {
    const filePath = await realpath(path.join(ROOT, file));
    const relative = path.relative(ROOT, filePath).split(path.sep).join('/');
    if (!isPublicFile(relative)) return null;
    return { data: await readFile(filePath), type: MIME_TYPES[path.extname(filePath)] };
  })().finally(() => pendingReads.delete(file));
  pendingReads.set(file, reading);
  return reading;
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return respond(res, 400, '400 Bad Request');
  }
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!pathname.startsWith('/') || !isPublicFile(file)) return respond(res, 404, '404 Not Found');

  try {
    const asset = await readPublicFile(file);
    if (!asset) return respond(res, 404, '404 Not Found');
    res.writeHead(200, { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff' });
    res.end(asset.data);
  } catch {
    respond(res, 404, '404 Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const port = server.address().port;
  console.log(`🏘️  AI 辦公室已啟動
  ─────────────────────────────
  📍 本機:  http://localhost:${port}
  ─────────────────────────────
  按 Ctrl+C 停止服務`);
});
