import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = __dirname;
const clientRoot = path.join(projectRoot, 'E-commerce System Foundation', 'dist');
const adminRoot = path.join(projectRoot, 'Admin Web Interface Design', 'dist');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === '/') {
    res.writeHead(302, { Location: '/client/' });
    res.end();
    return;
  }

  const routeMatch = pathname.startsWith('/admin') ? '/admin' : pathname.startsWith('/client') ? '/client' : null;
  if (!routeMatch) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Route not found');
    return;
  }

  if (pathname === '/admin' || pathname === '/client') {
    res.writeHead(302, { Location: `${routeMatch}/` });
    res.end();
    return;
  }

  const root = routeMatch === '/admin' ? adminRoot : clientRoot;
  const relativePath = pathname.slice(routeMatch.length) || '/';
  const safePath = path.normalize(relativePath).replace(/^\.+/, '');
  const resolved = path.join(root, safePath === '/' ? 'index.html' : safePath);

  if (!resolved.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (statError, stats) => {
    if (statError && statError.code === 'ENOENT') {
      fs.stat(path.join(resolved, 'index.html'), (indexError, indexStats) => {
        if (!indexError && indexStats.isFile()) {
          sendFile(res, path.join(resolved, 'index.html'));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('File not found');
      });
      return;
    }

    if (stats && stats.isDirectory()) {
      sendFile(res, path.join(resolved, 'index.html'));
      return;
    }

    sendFile(res, resolved);
  });
});

server.listen(4175, '0.0.0.0', () => {
  console.log('Shared storefront running on http://localhost:4175');
  console.log('Admin: http://localhost:4175/admin/');
  console.log('Client: http://localhost:4175/client/');
});
