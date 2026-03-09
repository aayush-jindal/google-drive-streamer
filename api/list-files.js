import { getAccessToken } from './_auth.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const folderId = req.query.folderId || 'root';
    const token = await getAccessToken();

    const typeFilter = `(mimeType = '${FOLDER_MIME}' or mimeType contains 'video')`;
    const q = folderId === 'root'
      ? `sharedWithMe = true and trashed = false and ${typeFilter}`
      : `'${folderId}' in parents and trashed = false and ${typeFilter}`;

    const params = new URLSearchParams({
      q,
      fields: 'files(id,name,mimeType,thumbnailLink,size,modifiedTime,videoMediaMetadata)',
      orderBy: 'folder,name',
      pageSize: '100',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!driveRes.ok) {
      const err = await driveRes.json().catch(() => ({}));
      return res.status(driveRes.status).json({ error: err });
    }

    const data = await driveRes.json();
    return res.status(200).json(data.files ?? []);
  } catch (err) {
    console.error('[list-files]', err);
    return res.status(500).json({ error: err.message });
  }
}
