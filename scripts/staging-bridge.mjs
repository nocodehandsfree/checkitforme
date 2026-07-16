// Loopback bridge: http://127.0.0.1:8899/* -> https://staging.checkitforme.com/*
// Headless Chromium in a Claude session can't TLS to staging (the egress proxy resets
// Chromium's ClientHello; Node fetch is fine) — point Playwright at this instead.
// Run: node scripts/staging-bridge.mjs &   (see docs/shared/GOTCHAS.md)
import http from 'node:http';

const TARGET = process.env.BRIDGE_TARGET || 'https://staging.checkitforme.com';
const PORT = Number(process.env.BRIDGE_PORT || 8899);

const server = http.createServer(async (req, res) => {
  try {
    const url = TARGET + req.url;
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (['host', 'connection', 'accept-encoding', 'content-length'].includes(k.toLowerCase())) continue;
      headers[k] = v;
    }
    headers['host'] = new URL(TARGET).host;
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });
    }
    const r = await fetch(url, { method: req.method, headers, body, redirect: 'manual' });
    const outHeaders = {};
    r.headers.forEach((v, k) => {
      if (['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k)) return;
      if (k === 'location' && v.startsWith(TARGET)) { outHeaders[k] = v.slice(TARGET.length) || '/'; return; }
      outHeaders[k] = v;
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, outHeaders);
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('bridge error: ' + e.message);
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`bridge up on ${PORT} -> ${TARGET}`));
