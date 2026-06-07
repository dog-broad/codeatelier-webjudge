// CodeAtelier web-judge service.
//
// A small HTTP service that grades a student's HTML/CSS/JS file set against a
// set of declarative DOM assertions, authoritatively, in a real headless
// Chromium. The plugin posts the file set + assertions; for each assertion the
// service renders a fresh page, runs the assertion's actions, evaluates the one
// check in page context, and returns the result. It never computes the final
// mark — the plugin aggregates the weighted fraction — and it returns every
// assertion's outcome including hidden ones (the plugin only ever shipped the
// hidden ones to us, never to the student).

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { grade, closeBrowser } from './grade.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version;

const PORT = Number(process.env.PORT) || 4400;
const TOKEN = process.env.WEBJUDGE_TOKEN || '';
const MAX_BODY = 4 * 1024 * 1024; // 4 MB

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    return sendJson(res, 200, { status: 'ok', service: 'codeatelier-webjudge', version: VERSION });
  }
  if (req.method === 'POST' && req.url === '/grade') {
    if (TOKEN && req.headers['x-auth-token'] !== TOKEN) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }
    let body = '';
    let aborted = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        aborted = true;
        sendJson(res, 413, { error: 'payload too large' });
        req.destroy();
      }
    });
    req.on('end', async () => {
      if (aborted) {
        return;
      }
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        return sendJson(res, 400, { error: 'invalid JSON body' });
      }
      try {
        const out = await grade(payload);
        sendJson(res, 200, out);
      } catch (e) {
        sendJson(res, 500, { error: String((e && e.message) || e) });
      }
    });
    return;
  }
  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`codeatelier-webjudge ${VERSION} listening on :${PORT}`);
});

async function shutdown() {
  server.close();
  await closeBrowser();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
