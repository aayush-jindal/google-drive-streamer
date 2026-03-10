import express from 'express';

import listFiles from './routes/listFiles.js';
import streamVideo from './routes/streamVideo.js';
import ping from './routes/ping.js';

const app = express();

// ── Request logging ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ── CORS (Cloudflare Pages ↔ Cloud Run) ──────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowlist = new Set(
    [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
    ].filter(Boolean),
  );

  if (origin && allowlist.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/api/list-files', listFiles);
app.get('/api/stream-video', streamVideo);
app.get('/api/ping', ping);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ── Error handling ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[server]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});

// ── Graceful shutdown (Cloud Run sends SIGTERM) ──────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  // Safety: if existing connections hang, force exit.
  setTimeout(() => {
    console.error('Forced shutdown after 10s');
    process.exit(1);
  }, 10_000).unref();
});

