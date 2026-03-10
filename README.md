<div align="center">
  <img src="./logo.png" alt="Google Drive TV Streamer" width="120" height="120" />

  # Google Drive TV Streamer

  > Watch your private Google Drive videos on any TV — Fire Stick, Jio Box, Smart TV — privately and securely.

  [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/aayush-jindal/google-drive-streamer&env=GOOGLE_SERVICE_ACCOUNT_JSON,VITE_APP_PASSWORD)
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
- ⚡ **Deployed on Vercel free tier** — zero ongoing cost

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────────────────┐     ┌───────────────┐
│   Browser   │────▶│  Vercel Serverless API  │────▶│ Google Drive  │
│  (TV/Phone) │◀────│  (Service Account Auth) │◀────│   (Storage)   │
└─────────────┘     └─────────────────────────┘     └───────────────┘
```

All Drive API calls happen server-side. Your service account key never touches the browser. Videos stream through the API using HTTP range requests.

## 🚀 Deploy Your Own (5 minutes)

### Prerequisites

- Google Account with videos in Google Drive
- Vercel account (free)
- Google Cloud Console account (free)

### Step 1: Clone & Deploy

**[Deploy with one click](https://vercel.com/new/clone?repository-url=https://github.com/aayush-jindal/google-drive-streamer&env=GOOGLE_SERVICE_ACCOUNT_JSON,VITE_APP_PASSWORD)** — then add your env vars in the Vercel dashboard.

Or deploy manually:

```bash
git clone https://github.com/aayush-jindal/google-drive-streamer.git
cd google-drive-streamer
vercel deploy
```

### Step 2: Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Library**
2. Enable the **Google Drive API**
3. Go to **IAM & Admin → Service Accounts → Create Service Account**
4. Create a key: **Keys → Add Key → Create new key → JSON**
5. Download the JSON file
6. **Share your Drive folder** with the service account's `client_email` (found in the JSON — it looks like `xxx@xxx.iam.gserviceaccount.com`)

### Step 3: Environment Variables

Add these in **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full contents of your service account JSON, minified to **one line** (no newlines) |
| `VITE_APP_PASSWORD` | Password to protect your app — share with family |

**Tip:** Minify the JSON in one command:
```bash
cat your-service-account.json | tr -d '\n' | pbcopy
```
Then paste as the value of `GOOGLE_SERVICE_ACCOUNT_JSON`.

### Step 4: Done!

Open your Vercel URL, enter the password, and start watching 🎬

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
- **Vercel Serverless Functions** — backend API
- **Google Drive API + Service Account** — auth & storage
- **google-auth-library** — token management

## 🔒 Security

- Service account key **never exposed** to the browser — all Drive API calls happen server-side
- Password protection on the frontend (baked into build — use a unique password)
- Videos stream directly from Google Drive through the proxy
- No video data stored on Vercel — only metadata and streaming bytes pass through

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
