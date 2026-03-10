# Architecture

This document explains how the Google Drive TV Streamer works from end to end, the key design decisions, and the data flows.

## How It Works

### Complete Flow: Browser → Cloud Run → Google Drive

1. **User opens the app** — React loads, shows password screen if not authenticated
2. **User enters password** — checked client-side against `VITE_APP_PASSWORD` (baked in at build time)
3. **App fetches file list** — `GET /api/list-files?folderId=root` (or `folderId=<id>` for subfolders)
4. **Serverless function authenticates** — loads `GOOGLE_SERVICE_ACCOUNT_JSON` from env, uses `google-auth-library` to obtain a bearer token
5. **Function calls Drive API** — lists files/folders with `supportsAllDrives=true`, filters for folders + videos
6. **User selects a video** — browser's `<video>` element is pointed at `/api/stream-video?fileId=<id>`
7. **Browser sends Range requests** — e.g. `Range: bytes=0-1048575` for the first chunk
8. **Stream-video function** — expands small ranges to 40 MB, fetches from Drive with bearer token, pipes bytes back
9. **Browser plays natively** — seek, pause, buffer all handled by the video element; each seek triggers new Range requests

### Why Service Account Instead of OAuth

- **OAuth** requires each user to sign in with Google. On a TV (Fire Stick, Jio Box), there is no keyboard for typing credentials, and the OAuth flow often breaks on TV browsers.
- **Service Account** is a server-side-only credential. The user never signs in. You share a folder with the service account email once, and the app can access it forever. This is ideal for family use: one person sets it up, everyone watches.

### Why a Small Backend (Cloud Run) Instead of Direct Drive URLs

- **Keeps the Drive token server-side** — the browser never sees the bearer token
- **Works with Range requests** — each seek triggers a new Range request which the backend proxies to Drive
- **Scales automatically** — Cloud Run scales instances based on traffic

### Range Request Streaming Explained

The browser's `<video>` element uses HTTP Range requests to fetch only the bytes it needs. For a 2-hour movie, it doesn't download the whole file — it requests chunks on demand (e.g. bytes 0–5MB, then 5MB–10MB as you watch).

Our `/api/stream-video` function:

1. Receives the browser's `Range: bytes=X-Y` header
2. Expands small ranges to 40 MB (so conservative browsers like Fire Stick Silk get more buffer per request)
3. Forwards the range to Google Drive: `GET .../files/{id}?alt=media` with `Range` header
4. Pipes the response body straight back to the browser
5. Sets `Content-Range`, `Content-Length`, `Accept-Ranges` so the browser knows it can seek

Because each request only transfers a chunk (not the whole file), the backend can serve long videos safely while the browser seeks using standard HTTP Range requests.

### TV vs Phone Detection Logic

The app detects the device type in `useDevice.js`:

- **TV / remote device** (`isTVDevice = true`): User-Agent contains `TV`, `FireTV`, `Silk`, `AFTS`, or `AndroidTV`, OR the device has no touch screen (laptop, desktop). Uses cursor/hover navigation, custom video controls, back-button handling.
- **Phone / tablet** (`isPhone = true`): Has touch screen AND does not look like a TV. Uses native video controls, touch-friendly grid, hardware back button via `popstate`.

---

## Key Design Decisions

### 1. Service Account over OAuth — Why

OAuth would require each family member to sign in with Google on the TV. TV browsers (especially Fire Stick Silk) often fail OAuth flows (popups, redirects, keyboard entry). A service account lets one person set up the app; everyone watches with a simple password. The trade-off: the folder must be shared with the service account — you can't browse "my entire Drive" unless you share it.

### 2. Range Request Proxy — Why Not Direct Streaming

Google Drive's `alt=media` URLs require a bearer token. If we gave the browser a direct Drive URL, we'd have to put the token somewhere the browser could use it — which would expose it. By proxying through our API, the token stays server-side. The browser only ever talks to our domain. We also gain control over chunk sizing (40 MB expansion) to optimize for TV browsers.

### 3. 40 MB Chunk Size — Why

Fire Stick Silk and similar TV browsers tend to request small ranges (e.g. 1–2 MB). That causes frequent round-trips and buffering. By expanding requests under 40 MB to 40 MB, we give the browser enough runway in one request to play smoothly. Drive complies with RFC 7233 and clips the range to file size, so we never get 416 errors on oversized requests.

### 4. Cursor-Based TV Navigation — Why

Fire Stick Silk treats arrow keys as *cursor movement* — the on-screen mouse pointer moves. If we used arrow keys for list navigation, the cursor would jump around and break the UX. So we use *hover-based* navigation: move the cursor over a row to highlight it, press OK/Enter/Click to select. We also use mouse-position-based auto-scroll: cursor in the top or bottom 15% of the screen scrolls the list. This matches how TV users expect to interact (point and click).

### 5. Password Protection Approach — Why

We use a simple client-side password check (`VITE_APP_PASSWORD`) stored in sessionStorage. It's not cryptographically secure — the password is in the JS bundle. The goal is to keep casual visitors out, not to protect against attackers. For a family streaming app, this is a reasonable trade-off: easy to set up, no backend sessions, and the real protection (service account key) is never exposed anyway.

---

## Sequence Diagrams (ASCII)

### Initial App Load + Auth

```
┌─────────┐                ┌──────────────┐                ┌─────────────┐
│ Browser │                │  Cloud Run   │                │ Google      │
└────┬────┘                └──────┬───────┘                └──────┬──────┘
     │                             │                                │
     │  GET / (index.html + JS)    │                                │
     │────────────────────────────▶│                                │
     │◀────────────────────────────│                                │
     │                             │                                │
     │  User enters password       │                                │
     │  (client-side check)        │                                │
     │  sessionStorage = true      │                                │
     │                             │                                │
     │  GET /api/list-files        │                                │
     │  ?folderId=root             │                                │
     │────────────────────────────▶│                                │
     │                             │  getAccessToken() (cached)      │
     │                             │  GET drive/v3/files?q=...       │
     │                             │───────────────────────────────▶│
     │                             │◀───────────────────────────────│
     │◀────────────────────────────│  JSON files[]                   │
     │                             │                                │
```

### Browsing Files

```
┌─────────┐                ┌──────────────┐                ┌─────────────┐
│ Browser │                │  Cloud Run   │                │ Google      │
└────┬────┘                └──────┬───────┘                └──────┬──────┘
     │                             │                                │
     │  User clicks folder         │                                │
     │                             │                                │
     │  GET /api/list-files        │                                │
     │  ?folderId=<folderId>       │                                │
     │────────────────────────────▶│                                │
     │                             │  getAccessToken()              │
     │                             │  GET drive/v3/files?q='...'    │
     │                             │───────────────────────────────▶│
     │                             │◀───────────────────────────────│
     │◀────────────────────────────│  JSON files[]                   │
     │                             │                                │
     │  Render new list            │                                │
     │                             │                                │
```

### Playing a Video

```
┌─────────┐                ┌──────────────┐                ┌─────────────┐
│ Browser │                │  Cloud Run   │                │ Google      │
└────┬────┘                └──────┬───────┘                └──────┬──────┘
     │                             │                                │
     │  <video src="/api/stream-video?fileId=X">                   │
     │                             │                                │
     │  GET /api/stream-video      │                                │
     │  ?fileId=X                  │                                │
     │  Range: bytes=0-1048575     │                                │
     │────────────────────────────▶│                                │
     │                             │  getAccessToken()              │
     │                             │  Expand to bytes=0-41943039     │
     │                             │  GET drive/v3/files/X?alt=media │
     │                             │  Range: bytes=0-41943039        │
     │                             │───────────────────────────────▶│
     │                             │◀───────────────────────────────│
     │                             │  206 Partial Content           │
     │                             │  Content-Range: bytes 0-41943039/... │
     │◀────────────────────────────│  (stream body)                  │
     │  206 + video bytes          │                                │
     │                             │                                │
     │  Browser buffers & plays    │                                │
     │                             │                                │
```

### Seeking in a Video

```
┌─────────┐                ┌──────────────┐                ┌─────────────┐
│ Browser │                │  Cloud Run   │                │ Google      │
└────┬────┘                └──────┬───────┘                └──────┬──────┘
     │                             │                                │
     │  User seeks to 10:00        │                                │
     │  (video.currentTime = 600)  │                                │
     │                             │                                │
     │  Browser issues new request │                                │
     │  GET /api/stream-video      │                                │
     │  ?fileId=X                  │                                │
     │  Range: bytes=10485760-     │                                │
     │         (start of new pos)  │                                │
     │────────────────────────────▶│                                │
     │                             │  Expand if < 40 MB             │
     │                             │  GET drive/v3/files/X?alt=media │
     │                             │───────────────────────────────▶│
     │                             │◀───────────────────────────────│
     │◀────────────────────────────│  206 + bytes                   │
     │                             │                                │
     │  Resume playback at seek pos│                                │
     │                             │                                │
```

---

## File Overview

| File | Purpose |
|------|---------|
| `backend/src/auth.js` | Service account auth, cached per warm instance |
| `backend/src/routes/listFiles.js` | Lists folders and videos in a Drive folder |
| `backend/src/routes/streamVideo.js` | Range-request proxy: forwards byte ranges to Drive, pipes back (40 MB expansion) |
| `backend/src/server.js` | Express server: CORS, logging, `/api/*` routes, `/health` |
| `frontend/src/App.jsx` | Root component: auth gate, FileBrowser + VideoPlayer |
| `frontend/src/components/FileBrowser.jsx` | Folder grid/list UI, TV + phone behaviours |
| `frontend/src/components/VideoPlayer.jsx` | Video playback UI; points `<video>` at the backend stream route |
| `frontend/src/hooks/useDevice.js` | TV vs phone detection |
| `frontend/src/hooks/useDriveBrowser.js` | Drive folder state, fetches file list from the backend |
| `frontend/src/hooks/useAuth.js` | Password check, sessionStorage persistence |
| `frontend/src/config.js` | Central API base URL (`VITE_API_URL` / localhost fallback) |
| `frontend/src/utils/driveApi.js` | Thumbnail URL scaling, folder MIME constant |
