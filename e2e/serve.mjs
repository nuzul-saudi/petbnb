// Static server for the exported web build (S10 E2E).
//
// Serves ./dist with the same routing semantics the Vercel deploy has:
// real files as-is; a route like /listings/abc falls back to the
// route's own exported HTML when one exists, else to /index.html (SPA
// fallback). Port 4173 to match playwright.config.ts's webServer.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT ?? 4173);

const MIME = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

http
  .createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let fp = path.join(DIST, p);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      const asHtml = path.join(DIST, p.replace(/\/$/, '') + '.html');
      fp = fs.existsSync(asHtml) ? asHtml : path.join(DIST, 'index.html');
    }
    res.setHeader('Content-Type', MIME[path.extname(fp)] ?? 'application/octet-stream');
    fs.createReadStream(fp).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`[e2e-serve] dist on http://127.0.0.1:${PORT}`);
  });
