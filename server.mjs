import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(path.dirname(fileURLToPath(import.meta.url)));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT には 1〜65535 の整数を指定してください。');
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': types['.json'] });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ app: 'hokago-track-club', ok: true }));
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.split(/[\\/]/).some(part => part.startsWith('.'))) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const candidate = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!candidate.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const filename = await realpath(candidate);
    if (!filename.startsWith(root + path.sep) || !(await stat(filename)).isFile()) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const body = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': types[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(status === 404 ? 'Not found' : status === 400 ? 'Bad request' : 'Server error');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `ポート ${port} は使用中です。起動済みなら http://${host}:${port} を開いてください。別のポートでは PORT=4174 npm start で起動できます。`
    : `起動できませんでした: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`\n放課後トラック部 — http://${host}:${port}\n終了: Ctrl+C\n`);
});
