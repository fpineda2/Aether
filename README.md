#  Aether

Where music becomes a place.

Aether is an immersive web application that transforms your music into interactive digital worlds.

Unlike traditional music players, Aether treats every listening session as an experience—combining real-time audio visualization, cinematic environments, and responsive interfaces into a living space that evolves with your music.

Built with Next.js, React, Three.js, Web Audio API, Framer Motion, and the Spotify Web API, Aether explores what music streaming could feel like if it were designed as an interactive world instead of a playlist.

<!-- TODO: replace with a real screenshot or GIF of the app running -->
<!-- ![Vibe Page screenshot](./public/screenshot.png) -->

> **Live demo:** _coming soon_ &nbsp;·&nbsp; <!-- TODO: add your Vercel URL here once deployed -->

---

## ✨ Experiences

- **Spotify authentication** — full OAuth 2.0 Authorization Code flow, implemented by hand with `httpOnly` cookie sessions, automatic token refresh, and CSRF-protected `state`.
- **Playback control** — play/pause, skip, seek, and transfer playback between devices, plus live "now playing" state.
- **Library & discovery** — browse your saved tracks and playlists, view playlist contents, and search the Spotify catalog.
- **Immersion Mode (the light show)** — a beat-reactive visualizer built on the Web Audio API. Real-time FFT analysis drives an additive-glow starfield and particle web that pulse, bloom, and ripple with the music. Color encodes dynamics: calmer beats glow green, harder hits flare red.
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
- **Beat detection** compares instantaneous low-band (bass) energy against a rolling baseline, with a short refractory window so fast bass doesn't smear into one continuous pulse. Each beat's loudness drives color, size, a screen flash, and an expanding shockwave ring.
- **Hand-rolled OAuth.** The Authorization Code flow, refresh-token rotation, and CSRF `state` nonce are implemented directly rather than via a library, so the token lifecycle is fully visible in `pages/api/auth/`.

---

## 📁 Project Structure

```
vibe_page/
├── app/                    # App Router: root layout, background canvases, pages
├── components/             # UI + visualizers (SpotifyPlayer, AudioReactiveStarfield, cursors…)
├── lib/                    # Web Audio analysis + helpers
├── pages/api/
│   ├── auth/               # OAuth: login, callback, token, refresh
│   └── spotify/            # Playback + library proxy routes
└── public/                 # Static assets (audio, icons)
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
- Built as a personal project to explore Next.js, the Spotify API, and real-time audio visualization.

## 📌 Architecture Diagrams 
<img width="1014" height="1049" alt="top_structure" src="https://github.com/user-attachments/assets/4abc6af5-0361-4031-9369-6b0497d98f76" />
<img width="1016" height="1049" alt="second_layer" src="https://github.com/user-attachments/assets/4df2e4da-3211-4307-b95c-bd08237d233b" />
<img width="1020" height="1064" alt="fourth_layer" src="https://github.com/user-attachments/assets/a7be6140-6987-4aeb-9a34-2d0fc3b873ca" />
<img width="1013" height="1064" alt="third_layer" src="https://github.com/user-attachments/assets/0d00318e-a4e4-4a15-a4e9-5546e4c58c11" />


