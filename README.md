<p align="center">
  <img src="./vibe_page/public/aether-logo.webp" alt="Aether logo" width="160">
</p>

#  Aether

Where music becomes a place.

Aether is an immersive web application that transforms your music into interactive digital worlds.

Unlike traditional music players, Aether treats every listening session as an experience—combining real-time audio visualization, cinematic environments, and responsive interfaces into a living space that evolves with your music.

Built with Next.js, React, the Web Audio API, and the Spotify Web API, Aether explores what music streaming could feel like if it were designed as an interactive world instead of a playlist.

<!-- TODO: replace with a real screenshot or GIF of the app running -->
<!-- ![Vibe Page screenshot](./public/screenshot.png) -->

> **Live demo:** [aether-iota-gold.vercel.app](https://aether-iota-gold.vercel.app) &nbsp;·&nbsp; **Case study:** [Engineering Aether (PDF)](./aether-case-study.pdf) ([plain-text version](./CASE_STUDY.md))
>
> ⚠️ **Spotify login won't work for you unless I've added you.** Spotify's Developer Platform caps apps in Development Mode to 5 allow-listed accounts, and I can only add an account by its exact email — so the Spotify-connected features (playback, search, library) are unavailable to visitors by default. Everything else — the boot animation, custom cursors, and the local-track audio-reactive visualizer — works for anyone, no login required. Want to see the Spotify side working? Reach out and I'll add your account.

---

## ✨ Experiences

- **Spotify authentication** — full OAuth 2.0 Authorization Code flow, implemented by hand with `httpOnly` cookie sessions, automatic token refresh, and CSRF-protected `state`.
- **Playback control** — play/pause, skip, seek, and transfer playback between devices, plus live "now playing" state.
- **Library & discovery** — browse your saved tracks and playlists, view playlist contents, and search the Spotify catalog.
- **Immersion Mode (the light show)** — a beat-reactive visualizer built on the Web Audio API. Real-time FFT analysis drives an additive-glow starfield and particle web that pulse, bloom, and ripple with the music. The web's own color drifts along a red(bass)–violet(treble) spectrum tracking where the music's energy is centered, while a separate calm-green–to–warm-orange pulse tracks overall loudness/impact — and each of four frequency bands independently drifts left/right with its own stereo panning.
- **Bundled demo tracks** — a built-in track picker with a few ready-to-play local tracks, including two original compositions by a collaborator (credited by name in the title), so anyone can try the visualizer instantly with no file of their own.
- **Tab & system audio capture** — Spotify's own stream can't be analyzed directly (see Engineering Notes), so Interactive Mode can instead capture whatever's already playing out loud from a shared browser tab via `getDisplayMedia` — Spotify, Apple Music, YouTube, anything — and feed it into the same real-time analysis. Works alongside local playback, not instead of it; picking one stops the other.
- **The Aether Challenge** — an open invitation for other musicians to compose for the installation: a full listening brief (frequency bands, beat behavior, color/stereo logic) at `/challenge`, with a submission path for a track to be added to the bundled list.
- **Focus mode** — a one-click "Only Background" toggle that hides all page content, leaving just the cosmic visuals running underneath.
- **Cosmic UI** — an animated Three.js / Vanta starfield and particle "spiderweb" background, custom cursors, and a boot-sequence intro.

---

## 🛠️ Tech Stack

| Area | Tech |
|------|------|
| Framework | [Next.js 15](https://nextjs.org) (App Router + Pages Router API routes) |
| UI | React 19, Tailwind CSS v4, Framer Motion |
| Graphics | Three.js, Vanta, HTML Canvas |
| Audio | Web Audio API (`AnalyserNode` FFT) |
| Music | Spotify Web API + Web Playback SDK |
| Auth | OAuth 2.0 Authorization Code flow, cookie-based sessions |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18.18+ (or 20+)
- A [Spotify Developer](https://developer.spotify.com/dashboard) account (a free Spotify account works for listening; a **Premium** account is required for playback control via the Web Playback SDK)

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Under **Settings → Redirect URIs**, add exactly:
   ```
   http://127.0.0.1:3000/api/auth/callback
   ```
   > ⚠️ Spotify no longer accepts `http://localhost` redirect URIs — you must use the loopback IP `127.0.0.1`. Match it character-for-character.
3. While the app is in **Development Mode**, add your own Spotify account under **User Management** (name + email), or authentication will fail for you.

### 2. Configure environment variables

Create a `.env.local` file in the `vibe_page/` directory:

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback
NEXT_PUBLIC_BASE_URL=http://127.0.0.1:3000
```

> Never commit `.env.local`. The client secret must stay private; the client ID is public by design.

### 3. Install and run

```bash
cd vibe_page
npm install
npm run dev -- -H 127.0.0.1
```

Then open **http://127.0.0.1:3000** (use `127.0.0.1`, not `localhost`, so the OAuth cookies line up) and start the login from `/api/auth/login`.

---

## 🔐 Environment Variables

| Variable | Description |
|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Your Spotify app's client ID (public). |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify app's client secret (keep private). |
| `SPOTIFY_REDIRECT_URI` | OAuth callback URL; must match the dashboard exactly. |
| `NEXT_PUBLIC_BASE_URL` | Base URL the app runs on (used to build redirect/callback URLs). |

**Spotify scopes requested:** `streaming`, `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`, `user-read-private`, `user-read-email`, `user-library-read`, `playlist-read-private`, `playlist-read-collaborative`.

---

## 🧠 Engineering Notes

A few problems worth calling out, because they shaped the design:

- **The visualizer reacts to a local track, not the Spotify stream — on purpose.** Spotify's Web Playback SDK plays through DRM (Encrypted Media Extensions), which the Web Audio API cannot tap, so the live stream can't be analyzed in-browser. Spotify's Audio Analysis / Audio Features endpoints (which used to provide beat and tempo data) were also deprecated for new apps in November 2024. Given both constraints, Interactive Mode analyzes a local audio track you control via a real `AnalyserNode` — the only way to get genuine, frame-accurate reactivity in the browser.
- **Tab/system audio capture sidesteps the same DRM wall from a different angle.** Instead of tapping the encrypted stream directly (impossible), `getDisplayMedia`'s tab-sharing audio captures whatever's already been decoded and is playing out loud — the same way a microphone would, just without the room noise. That makes it source-agnostic (Spotify, Apple Music, YouTube, anything), at the cost of being far less consistent across browsers: solid in Chrome/Edge, weak or missing entirely in Firefox and on mobile.
- **Beat detection** compares instantaneous low-band (bass) energy against a rolling baseline, with a short refractory window so fast bass doesn't smear into one continuous pulse. Each beat's loudness drives color, size, a screen flash, and an expanding shockwave ring.
- **Hand-rolled OAuth.** The Authorization Code flow, refresh-token rotation, and CSRF `state` nonce are implemented directly rather than via a library, so the token lifecycle is fully visible in `pages/api/auth/`.

---

## 📁 Project Structure

```
vibe_page/
├── app/                    # App Router: root layout, background canvases, pages
│   └── challenge/          # The Aether Challenge — scoring brief + submission
├── components/             # UI + visualizers (SpotifyPlayer, AudioReactiveStarfield, cursors…)
├── lib/                    # Web Audio analysis + helpers (local track + tab/stream capture)
├── pages/api/
│   ├── auth/               # OAuth: login, callback, token, refresh
│   └── spotify/            # Playback + library proxy routes
└── public/audio/           # Bundled demo tracks
```

---

## ☁️ Deployment

Deploys cleanly to [Vercel](https://vercel.com). Two things to remember for production:

1. Add your production callback (e.g. `https://your-app.vercel.app/api/auth/callback`) as a **second Redirect URI** in the Spotify dashboard — production must use **HTTPS**.
2. Set the same environment variables in your Vercel project settings, with `SPOTIFY_REDIRECT_URI` and `NEXT_PUBLIC_BASE_URL` pointing at the production URL.

---

## 📌 Notes & Limitations

- Playback control requires **Spotify Premium** (a Web Playback SDK limitation).
- While in Development Mode, only Spotify accounts you've allow-listed in the dashboard can log in.
- Tab/system audio capture needs a secure context (`https://` or `http://localhost`) and works best in Chrome/Edge — Firefox's support is inconsistent, and most mobile browsers don't support it at all.
- Built as a personal project to explore Next.js, the Spotify API, and real-time audio visualization.

##  Architecture Diagrams 
<img width="1014" height="320" alt="top_structure" src="https://github.com/user-attachments/assets/3d2bcce4-af3b-4c9c-a8a6-21da51255dd5" />
<img width="1016" height="759" alt="second_layer" src="https://github.com/user-attachments/assets/3aa64a86-2060-46f0-a2e1-fc0a79ea6edf" />
<img width="1013" height="962" alt="third_layer" src="https://github.com/user-attachments/assets/714e7f67-b1e0-48d9-a337-1d0b4aca83b4" />
<img width="1020" height="925" alt="fourth_layer" src="https://github.com/user-attachments/assets/cd19001c-d8e9-43ef-874c-023dfd16d12d" />




