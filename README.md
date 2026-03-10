<div align="center">
  <img src="./logo.png" alt="Google Drive TV Streamer" width="120" height="120" />

  # Google Drive TV Streamer

  > Watch your private Google Drive videos on any TV — Fire Stick, Jio Box, Smart TV — privately and securely.

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Made with React](https://img.shields.io/badge/Made%20with-React-61dafb?logo=react)](https://reactjs.org/)
</div>

## ✨ Features

- 🔒 **Completely private** — your videos never become public
- 📺 **Works on Fire Stick, Jio Box, Android TV, Smart TV** — and any device with a browser
- 📱 **Responsive** — works on phone and desktop too
- 🎬 **Smooth streaming** with optimized range requests
- 🔑 **Password protected** — only your family can access
- 🗂️ **Browse your entire Google Drive folder structure**
- ⚡ **Backend + frontend separated** — Cloud Run (API) + Cloudflare Pages (UI)

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────────────────┐     ┌───────────────┐
│   Browser   │────▶│   Cloud Run (Express)   │────▶│ Google Drive  │
│  (TV/Phone) │◀────│  (Service Account Auth) │◀────│   (Storage)   │
└─────────────┘     └─────────────────────────┘     └───────────────┘
```

Frontend is a static React app deployed to Cloudflare Pages. It calls the Cloud Run backend over HTTPS.

All Drive API calls happen server-side. Your service account key never touches the browser. Videos stream through the API using HTTP range requests.

## 🗂️ Repo Structure

```
/
├── frontend/   # React (Vite) app → Cloudflare Pages
└── backend/    # Express API → Google Cloud Run
```

## 🚀 Deploy Your Own

### Prerequisites

- Google Account with videos in Google Drive
- Google Cloud Console account (free)
- Cloudflare account (for Pages)

### Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Library**
2. Enable the **Google Drive API**
3. Go to **IAM & Admin → Service Accounts → Create Service Account**
4. Create a key: **Keys → Add Key → Create new key → JSON**
5. Download the JSON file
6. **Share your Drive folder** with the service account's `client_email` (found in the JSON — it looks like `xxx@xxx.iam.gserviceaccount.com`)

### Environment Variables

Backend (`backend/`):

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service account JSON contents, minified to **one line** |
| `FRONTEND_URL` | Your Pages URL (used for CORS), e.g. `https://stream.rasiklabs.com` |
| `PORT` | Cloud Run uses `8080` (optional locally) |

Frontend (`frontend/`):

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Your Cloud Run URL, e.g. `https://api.rasiklabs.com` |
| `VITE_APP_PASSWORD` | Password to protect the app (baked into the JS bundle) |

**Tip:** Minify the JSON in one command:
```bash
cat your-service-account.json | tr -d '\n' | pbcopy
```
Then paste as the value of `GOOGLE_SERVICE_ACCOUNT_JSON`.

### Local development notes

- Frontend defaults to `http://localhost:3001` when `VITE_API_URL` is not set.
- Run backend locally with `PORT=3001` to match.
- `frontend/vite.config.js` proxies `/api` to `http://localhost:3001` for local dev convenience.

## 📱 Device Support

| Device | Browser | Status |
|--------|---------|--------|
| Amazon Fire Stick | Silk Browser | ✅ Fully supported |
| Jio Box | Built-in browser | ✅ Fully supported |
| Android TV | Chrome | ✅ Fully supported |
| iPhone / Android | Safari / Chrome | ✅ Fully supported |
| Desktop | Any browser | ✅ Fully supported |

## 🔧 Tech Stack

- **React + Vite** — frontend
- **Express on Cloud Run** — backend API
- **Cloudflare Pages** — static hosting for frontend
- **Google Drive API + Service Account** — auth & storage
- **google-auth-library** — token management

## 🔒 Security

- Service account key **never exposed** to the browser — all Drive API calls happen server-side
- Password protection on the frontend (baked into build — use a unique password)
- Videos stream directly from Google Drive through the proxy
- No video data stored on your hosting provider — only metadata and streaming bytes pass through the backend proxy

## 🤖 Built With AI

This project was built collaboratively with **Claude** (Anthropic's AI coding assistant). The entire development process — from architecture decisions to debugging streaming issues on Fire Stick — was a human-AI collaboration.

## 📖 Article Series

This project is documented in a 3-part Medium series:

- **Part 1:** The Problem & Architecture
- **Part 2:** Google Cloud Setup Guide
- **Part 3:** Building for TV — The Hard Parts

*Links to be added when published.*

## 📄 License

MIT License — use it, modify it, share it freely. See [LICENSE](LICENSE) for details.
