# Google Drive Streamer

A password-protected TV/Fire Stick video browser that streams MP4 files directly from Google Drive. Built with React + Vite on the frontend and Vercel serverless functions for the backend API.

## How it Works

The app uses a **range-request proxy** architecture:

1. The frontend fetches the file list from `/api/list-files` (a serverless function that calls the Drive v3 API using a service account)
2. When a video is selected, the browser's native `<video>` element is pointed at `/api/stream-video?fileId=<id>`
3. The browser automatically issues `Range: bytes=X-Y` requests for each chunk it needs
4. The serverless function forwards each range request to Google Drive with a service account bearer token, and pipes the chunk straight back
5. Seeking, buffering, and playback are all handled natively by the browser — the serverless function just relays byte ranges on demand

This approach works within Vercel's Hobby plan 10-second function timeout because each call only transfers a small chunk (~1–2 MB), not the whole file.

## Features

- Password lock screen before accessing the app
- Browse Google Drive folders and video files
- Full-screen video player with seek bar and time display
- Keyboard and Fire Stick remote navigation (arrow keys, OK, Back, media buttons)
- Wake Lock API to prevent screen saver during playback
- Dark TV-optimised UI — large text, high-contrast focus rings, 3-column grid

## Prerequisites

- A **Google Cloud project** with the Drive API enabled
- A **service account** with access to your Drive files (shared folder or Shared Drive)
- A **Vercel account** (free Hobby plan is sufficient)

## Setup

### 1. Create a Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Library**
2. Enable the **Google Drive API**
3. Go to **IAM & Admin → Service Accounts → Create Service Account**
4. Download the JSON key file (**Keys → Add Key → JSON**)
5. Share your Drive folder (or Shared Drive) with the service account's `client_email`

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
VITE_APP_PASSWORD=your-secret-password
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

The service account JSON must be **on a single line** — no newlines inside the value. You can minify it with:

```bash
cat your-service-account.json | tr -d '\n' | pbcopy
```

Then paste the result as the value of `GOOGLE_SERVICE_ACCOUNT_JSON`.

### 3. Run Locally

```bash
npm install
vercel dev        # serves both the Vite frontend and /api routes on http://localhost:3000
```

> Use `vercel dev` (not `npm run dev`) so the serverless `/api` routes work locally.

Alternatively, use the custom dev server:

```bash
npm run dev:api   # starts API on :3001
npm run dev       # starts Vite on :5173 (proxies /api to :3001)
```

## Deployment (Vercel)

### Environment Variables

Set these in **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Description |
|---|---|
| `VITE_APP_PASSWORD` | Password shown on the lock screen |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service account JSON, minified to a single line |

> **Important:** Paste the service account JSON as a single line. Multi-line values will fail to parse.

### Deploy

```bash
npm install -g vercel
vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard for automatic deploys on push.

**Build settings** (auto-detected from `vercel.json`):

| Setting | Value |
|---|---|
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

## Project Structure

```
├── api/
│   ├── _auth.js          # Shared service account auth helper (cached per warm instance)
│   ├── list-files.js     # GET /api/list-files?folderId=<id>
│   └── stream-video.js   # GET /api/stream-video?fileId=<id>  (range-request proxy)
├── src/
│   ├── App.jsx
│   ├── components/
│   │   ├── FileBrowser.jsx   # Folder/file grid with TV remote navigation
│   │   ├── VideoPlayer.jsx   # Full-screen player with seek + remote controls
│   │   ├── Breadcrumb.jsx
│   │   ├── PasswordScreen.jsx
│   │   └── LoadingSpinner.jsx
│   ├── hooks/
│   │   ├── useAuth.js        # Password auth, persisted in sessionStorage
│   │   ├── useDriveBrowser.js # Drive folder navigation state
│   │   └── useFocusNav.js    # TV remote grid focus management
│   ├── utils/
│   │   └── driveApi.js
│   └── index.css             # TV-friendly dark theme
├── vercel.json
└── vite.config.js
```

## Fire Stick / TV Remote Controls

### File Browser
| Key | Action |
|---|---|
| Arrow keys | Move focus between files |
| OK / Enter | Open folder or play video |
| Back / Escape | Go up one folder |

### Video Player
| Key | Action |
|---|---|
| OK / Enter / Space | Play / Pause |
| ← / → | Seek ±10 seconds |
| ↑ / ↓ | Seek ±30 seconds |
| Back / Escape | Return to file browser |
| Media Play/Pause | Play / Pause |
| Media Fast Forward | Seek +30 seconds |
| Media Rewind | Seek −30 seconds |

## Supported Video Formats

Any format the Fire Stick browser can decode natively — primarily **MP4 (H.264/AAC)**. H.265/HEVC and `.mov` files may not play; convert them to H.264 MP4 first.

## Docker (Local / LAN)

For local network access without Vercel:

```bash
cp .env.example .env.local   # fill in values
./rebuild.sh                  # builds and starts on http://localhost:5173
```

> The Docker setup uses the Vite dev server with a Node API proxy (`dev-server.js`). The production Dockerfile builds a static nginx image that does **not** include the `/api` routes — use Vercel for the full experience.

## Security Notes

- `GOOGLE_SERVICE_ACCOUNT_JSON` is only read in serverless functions — it is never sent to the browser
- `VITE_APP_PASSWORD` is baked into the JS bundle at build time (visible in source). Use a password that is not reused elsewhere
- The service account should be granted the minimum required scope: **read-only Drive access** to only the folders you want to share
