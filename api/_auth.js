/**
 * Shared service-account auth helper for all /api functions.
 *
 * Module-level variables persist across warm Vercel function invocations,
 * so the auth client and its cached token are reused until the instance
 * is recycled — avoiding a fresh token fetch on every video range request.
 */

import { GoogleAuth } from 'google-auth-library';

let _client = null;

function parseCredentials() {
  let raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim();
  // Strip surrounding quotes added by some env dashboards or copy-paste
  if ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  return JSON.parse(raw);
}

/** Returns a cached auth client; creates one on first call per warm instance. */
export async function getAuthClient() {
  if (!_client) {
    const auth = new GoogleAuth({
      credentials: parseCredentials(),
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    _client = await auth.getClient();
  }
  return _client;
}

/** Returns a valid access token, refreshing automatically when it expires. */
export async function getAccessToken() {
  const client = await getAuthClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Failed to obtain access token from service account');
  return token;
}
