/**
 * Range-request proxy for Google Drive video files.
 *
 * Flow per browser request
 * ────────────────────────
 * 1. Parse the browser's Range header.
 * 2. Expand small ranges to MIN_CHUNK_BYTES so one round-trip fills the
 *    browser's buffer (see "Chunk-size override" section below).
 * 3. Fetch from Drive with a connection timeout and automatic retry on
 *    transient errors (5xx, 429).
 * 4. If Drive rejects an expanded range with 416, fall back to the
 *    exact range the browser originally requested.
 * 5. Pipe bytes back to the browser using Node's pipeline() with a 512 KB
 *    highWaterMark for back-pressure.
 *
 * ── Corner cases confirmed safe ─────────────────────────────────────────────
 *
 * • File-size boundary (issues 1 & 2)
 *   RFC 7233 §2.1 requires servers to interpret a last-byte-pos that exceeds
 *   the resource size as (fileSize - 1).  Google Drive is compliant: a request
 *   for bytes=0-20971519 on a 15 MB file returns
 *   "Content-Range: bytes 0-15728639/15728640" with status 206 — never 416.
 *   Open-ended ranges (bytes=95000000-) skip expansion entirely because
 *   requestedSize == Infinity, so they are forwarded verbatim and Drive
 *   returns the tail of the file.  The 416 fallback in step 4 is a last-resort
 *   guard against unexpected API behaviour.
 *
 * • Parallel requests (issue 3)
 *   Every handler invocation is a self-contained async function with no
 *   module-level mutable state.  The shared _client in _auth.js is safe:
 *   google-auth-library serialises concurrent token-refresh calls internally.
 *
 * • Token expiry mid-stream (issue 4)
 *   getAccessToken() calls client.getAccessToken() which auto-refreshes the
 *   service-account token up to 5 minutes before expiry.  We call it at the
 *   top of every new Range request (each Range = a fresh HTTP call to this
 *   function), so the token is always valid when we open the Drive connection.
 *   Once the Drive connection is established, Google does not re-check the
 *   token during the body transfer.
 *
 * • Large files (issue 5)
 *   Number.MAX_SAFE_INTEGER ≈ 9 PB.  An 8 GB file's worst-case newEnd is
 *   8_589_934_592 + 20_971_519 = 8_610_906_111, safely within JS integers.
 *
 * • Malformed Range headers (issue 6)
 *   parseRange() returns null for anything the regex doesn't match (non-numeric,
 *   suffix ranges like bytes=-500, empty string).  Null-parsed headers skip the
 *   expansion block and are forwarded verbatim; Drive handles them per RFC 7233.
 *   A truly absent Range header causes Drive to return the full file (200).
 */

import { getAccessToken } from '../auth.js';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// Minimum bytes served per request — expands whatever the browser asks to give
// conservative browsers like Silk on Fire Stick maximum buffer runway.
const MIN_CHUNK_BYTES = 40 * 1024 * 1024; // 40 MB

// Maximum time allowed for Drive to deliver the first response byte (headers).
// Cleared as soon as headers arrive so body-streaming is never aborted.
// Keeps us comfortably inside Vercel Hobby's 10 s function limit.
const DRIVE_CONNECT_TIMEOUT_MS = 9000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setCorsHeaders(req, res) {
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
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
}

/**
 * Parse a "bytes=START-END" or "bytes=START-" Range header.
 * Returns { start, end } where end is null for open-ended ranges.
 * Returns null for anything that doesn't match (suffix ranges, malformed, etc.).
 */
function parseRange(rangeHeader) {
  const m = rangeHeader && rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return null;
  return {
    start: parseInt(m[1], 10),
    end: m[2] !== '' ? parseInt(m[2], 10) : null,
  };
}

/**
 * Fetch a byte range from Google Drive.
 *
 * Reliability guarantees
 * ──────────────────────
 * • Connection timeout: if Drive doesn't return response headers within
 *   DRIVE_CONNECT_TIMEOUT_MS, the request is aborted and throws.  The timer
 *   is cleared as soon as headers arrive so the body-streaming phase is
 *   uncapped — we don't want a large 20 MB chunk interrupted mid-transfer.
 *
 * • Retry: 5xx server errors AND 429 Too Many Requests are retried once after
 *   a 1 s back-off.  4xx errors (except 429) are returned as-is because they
 *   indicate a problem the caller must handle (e.g. 416 Range Not Satisfiable).
 *
 * Throws on second failure so the caller can return 503.
 */
async function fetchFromDrive(fileId, token, rangeHeader) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const headers = { Authorization: `Bearer ${token}` };
  if (rangeHeader) headers['Range'] = rangeHeader;

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      console.log(`[stream-video] Back-off 1 s before retry (attempt ${attempt + 1})`);
      await sleep(1000);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DRIVE_CONNECT_TIMEOUT_MS);

    try {
      const r = await fetch(url, { headers, signal: controller.signal });

      // Headers received — body streaming is now in progress; cancel the
      // connection timeout so a slow but active transfer is never cut off.
      clearTimeout(timer);

      // 5xx (server error) and 429 (rate-limited) are transient — retry once.
      // All other 4xx are definitive; return them so the caller can decide.
      if ((r.status >= 500 || r.status === 429) && attempt === 0) {
        lastErr = new Error(`Drive returned ${r.status}`);
        continue;
      }

      return r;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e.name === 'AbortError'
        ? new Error(`Drive connection timed out after ${DRIVE_CONNECT_TIMEOUT_MS}ms`)
        : e;
    }
  }

  throw lastErr;
}

export default async function handler(req, res) {
  const t0 = Date.now();
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  try {
    const token = await getAccessToken();

    const rawRange = req.headers['range'];

    // ── Chunk-size override ───────────────────────────────────────────────────
    // If the browser requests fewer than MIN_CHUNK_BYTES, bump the upper bound
    // so the response fills the browser's buffer in one round-trip.
    //
    // File-size safety: RFC 7233 §2.1 requires Drive to clip any last-byte-pos
    // that exceeds the file size to (fileSize - 1) and return 206 — not 416.
    // We therefore don't need a HEAD request to know the file size upfront.
    // The 416 fallback below is a safety net against unexpected API behaviour.
    let fetchRange = rawRange;
    let expanded = false;

    if (rawRange) {
      const parsed = parseRange(rawRange);
      if (parsed) {
        const { start, end } = parsed;
        // end === null means an open-ended range (bytes=X-).  requestedSize
        // is Infinity, which is never less than MIN_CHUNK_BYTES, so open-ended
        // ranges are forwarded verbatim — Drive serves the file's tail.
        const requestedSize = end !== null ? end - start + 1 : Infinity;
        if (requestedSize < MIN_CHUNK_BYTES) {
          fetchRange = `bytes=${start}-${start + MIN_CHUNK_BYTES - 1}`;
          expanded = true;
        }
      }
    }

    console.log(
      `[stream-video] fileId=${fileId}` +
      ` browser=${rawRange || 'none'}` +
      ` fetch=${fetchRange || 'full'}` +
      (expanded ? ` (expanded to ${MIN_CHUNK_BYTES / 1024 / 1024}MB)` : ''),
    );

    // ── Fetch from Drive (with connection timeout + retry) ────────────────────
    let driveRes;
    try {
      driveRes = await fetchFromDrive(fileId, token, fetchRange);
    } catch (fetchErr) {
      console.error('[stream-video] Drive fetch failed after retry:', fetchErr.message);
      if (!res.headersSent) {
        res.setHeader('Retry-After', '2');
        return res.status(503).json({ error: 'Upstream unavailable', message: fetchErr.message });
      }
      return;
    }

    // ── 416 fallback ──────────────────────────────────────────────────────────
    // Google Drive is RFC 7233-compliant and should never 416 an expanded range
    // (it clips to the actual file size).  This block is a guard against any
    // unexpected API behaviour — if the expanded range is rejected, retry with
    // exactly what the browser asked for.
    if (driveRes.status === 416 && expanded) {
      console.warn(
        '[stream-video] 416 on expanded range, retrying with original browser range:',
        rawRange,
      );
      try {
        driveRes = await fetchFromDrive(fileId, token, rawRange);
      } catch (fallbackErr) {
        console.error('[stream-video] 416 fallback also failed:', fallbackErr.message);
        if (!res.headersSent) {
          res.setHeader('Retry-After', '2');
          return res.status(503).json({ error: 'Upstream unavailable' });
        }
        return;
      }
    }

    // ── Response headers ──────────────────────────────────────────────────────
    res.statusCode = driveRes.status;

    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = driveRes.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=30');
    res.setHeader('X-Accel-Buffering', 'no');  // disable Vercel edge buffering
    res.setHeader('Cache-Control', 'no-store');

    const contentRange = driveRes.headers.get('content-range');
    const contentLength = driveRes.headers.get('content-length');
    console.log(
      `[stream-video] Drive → status=${driveRes.status}` +
      ` content-range=${contentRange || 'n/a'}` +
      ` content-length=${contentLength || 'n/a'}`,
    );

    if (!driveRes.body) return res.end();

    // ── Stream to browser ─────────────────────────────────────────────────────
    // Readable.fromWeb converts the WHATWG ReadableStream from fetch() into a
    // Node.js Readable.  highWaterMark 512 KB lets Node drain large chunks from
    // Drive in fewer event-loop turns.  pipeline() manages back-pressure and
    // destroys both streams (and ends the response) on error or completion.
    const nodeStream = Readable.fromWeb(driveRes.body, { highWaterMark: 512 * 1024 });
    await pipeline(nodeStream, res);

    console.log(`[stream-video] Done in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error('[stream-video]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  }
}

