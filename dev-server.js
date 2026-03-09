/**
 * Local development API server.
 * Mirrors the Vercel /api serverless functions so they work with `npm run dev`.
 * Reads .env.local into process.env before loading handlers.
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseUrl } from 'node:url';
import dotenv from 'dotenv';

// ── Load .env.local ───────────────────────────────────────────────────────────
const envFile = existsSync('.env.local') ? '.env.local' : existsSync('.env') ? '.env' : null;
if (envFile) {
  dotenv.config({ path: envFile });

  // dotenv truncates unquoted multi-line JSON values (e.g. pretty-printed service
  // account keys). If the result is not valid JSON, extract it directly from the
  // raw file using a balanced-brace matcher so the user doesn't need to minify.
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '';
  let isValid = false;
  try { JSON.parse(raw); isValid = true; } catch { /* fall through */ }

  if (!isValid) {
    const fileContent = readFileSync(envFile, 'utf8');
    const extracted = extractJson(fileContent, 'GOOGLE_SERVICE_ACCOUNT_JSON');
    if (extracted) {
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = extracted;
      console.log('[api] Extracted multi-line GOOGLE_SERVICE_ACCOUNT_JSON from env file');
    } else {
      console.warn('[api] WARNING: Could not parse GOOGLE_SERVICE_ACCOUNT_JSON — check your .env.local');
    }
  }

  console.log(`[api] Loaded env from ${envFile}`);
}

/**
 * Extract a JSON object value for a given key from a raw .env file string.
 * Handles multi-line (pretty-printed) JSON by matching balanced braces.
 */
function extractJson(fileContent, key) {
  const marker = `${key}=`;
  const keyStart = fileContent.indexOf(marker);
  if (keyStart === -1) return null;

  const valueStart = keyStart + marker.length;
  const braceStart = fileContent.indexOf('{', valueStart);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = braceStart; i < fileContent.length; i++) {
    const ch = fileContent[i];
    if (escape)            { escape = false; continue; }
    if (ch === '\\')       { escape = true;  continue; }
    if (ch === '"')        { inString = !inString; continue; }
    if (inString)          continue;
    if (ch === '{')        depth++;
    if (ch === '}') { depth--; if (depth === 0) return fileContent.slice(braceStart, i + 1); }
  }
  return null;
}

// ── Route table ───────────────────────────────────────────────────────────────
const routes = {
  '/api/list-files':   () => import('./api/list-files.js'),
  '/api/get-token':    () => import('./api/get-token.js'),
  '/api/stream-video': () => import('./api/stream-video.js'),
};

const PORT = 3001;

/**
 * Patch a raw Node http.ServerResponse with Vercel/Express-style helpers
 * so our /api handlers work identically in dev and on Vercel.
 */
function patchRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  return res;
}

// ── Request handler ───────────────────────────────────────────────────────────
createServer(async (req, rawRes) => {
  const { pathname, query } = parseUrl(req.url, true);
  req.query = query;
  const res = patchRes(rawRes);

  const load = routes[pathname];
  if (!load) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  try {
    const { default: handler } = await load();
    await handler(req, res);
  } catch (err) {
    console.error('[api] Error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(PORT, () => {
  console.log(`[api] Dev server → http://localhost:${PORT}`);
});
