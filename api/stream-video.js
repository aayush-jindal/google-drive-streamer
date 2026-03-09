/**
 * Range-request proxy for Google Drive video files.
 *
 * The browser's <video> element issues HTTP Range requests automatically
 * (e.g. "Range: bytes=0-65535"). Each call to this function forwards exactly
 * that byte range to Google Drive and returns the chunk — typically 1-2 MB,
 * completing well within Vercel Hobby's 10-second limit.
 *
 * This is NOT streaming the whole file in one call. It is a lightweight
 * per-chunk relay that lets the browser handle seeking and buffering natively.
 */

import { getAccessToken } from './_auth.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  try {
    const token = await getAccessToken();

    const driveHeaders = { Authorization: `Bearer ${token}` };

    // Forward the browser's Range header so Google Drive returns only the
    // requested chunk. If no Range header is present (rare with video elements)
    // the first request fetches from the start and Drive will respond with 200.
    const range = req.headers['range'];
    if (range) driveHeaders['Range'] = range;

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: driveHeaders },
    );

    // Mirror the status (200 OK or 206 Partial Content) and key headers.
    res.statusCode = driveRes.status;
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = driveRes.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    if (!driveRes.body) return res.end();

    // Pipe the chunk bytes back to the browser.
    const reader = driveRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } catch (err) {
    console.error('[stream-video]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    }
  }
}
